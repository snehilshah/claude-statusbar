import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import { SEP, fmtCountdown, fmtTokens, level, prettyModel, shortEffort, tildePath, width } from './format'
import type { Seg } from './format'
import type { Effort } from '../types'

// Idle refresh. It re-reads figures the engine already holds and makes no API
// call, so it costs no usage; rate-limit % only moves when a real request reports it.
const TICK_MS = 5 * 60_000

// What the bar draws. Module state: a reload starts it over and session.start refills it.
const st = {
  model: '',
  effort: undefined as Effort | undefined,
  ctx: undefined as SessionContextUsage | undefined,
  limits: [] as readonly SessionRateLimit[],
  dir: '',
  now: 0,
  tick: undefined as Timer | undefined,
  // '' until the hint line first shows a vim mode (vim off: never).
  vim: '',
}

// Session state, so the effort survives a reload of the mod (module state does not).
const effortAtom = atom({ plugin: 'statusbar', key: 'effort' } as const, null as Effort | null)

const VIM_RE = /^-- ([A-Z]+(?: [A-Z]+)*) --\s*/

async function refresh($: EngineInterface): Promise<void> {
  const usage = await $.session.usage()
  st.ctx = usage.context
  st.limits = usage.rateLimits
  // root, not cwd: a shell `cd` during the session must not move the bar's path.
  st.dir = await $.session.root()
  st.now = await $.clock.now()
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    st.model = await $.session.model()
    st.effort = (await read($, effortAtom)) ?? undefined
    await refresh($)
    st.tick?.cancel()
    st.tick = $.clock.every(TICK_MS, () => void refresh($))
    return started
  })

  on('session.measure', ($, e, next) => {
    st.ctx = e.context
    st.limits = e.rateLimits
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // Main loop only; a request without effort keeps the last one unless the model changed.
    if (e.agentId === undefined) {
      const effort = e.effort ?? (e.model === st.model ? st.effort : undefined)
      if (e.model !== st.model || effort !== st.effort) {
        st.model = e.model
        st.effort = effort
        await update($, effortAtom, () => effort ?? null)
        $.ui.invalidate('ui.render')
      }
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    void refresh($)
    return result
  })

  // Vim mode: the engine leads the hint line with "-- INSERT -- " and drops it in
  // NORMAL, shifting the line. Strip it there; show the mode on the right instead.
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const m = VIM_RE.exec(e.props.hint)
    const vim = m ? m[1]! : st.vim && 'NORMAL'
    if (vim !== st.vim) {
      st.vim = vim
      $.ui.invalidate('ui.render')
    }
    return m ? next({ ...e, props: { ...e.props, hint: e.props.hint.slice(m[0].length) } }) : next(e)
  })

  on('ui.render', { component: 'SessionMode' }, ($, e, next) =>
    st.vim ? next({ ...e, props: { ...e.props, modes: [...e.props.modes, st.vim] } }) : next(e),
  )

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    const { model, effort, ctx, limits, dir, now } = st
    if (e.props.hasSurvey || !model) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    // Group 1: what the model is and how full its window is.
    const head: Seg[] = [{ text: prettyModel(model), color: 'cyan', bold: true }]
    if (effort !== undefined) head.push({ text: shortEffort(effort), color: 'yellow' })
    if (ctx?.tokens !== undefined) {
      head.push({
        text: `ctx ${fmtTokens(ctx.tokens)}/${fmtTokens(ctx.window)}`,
        color: level(ctx.percent ?? 0),
      })
    }

    // Group 2: where we are.
    const place: Seg[] = dir ? [{ text: tildePath(dir), dim: true, shrink: true }] : []

    // Right side: rate-limit windows, 5h then 7d, unlabelled ("12% 2h14m · 40% 4d3h").
    // Past its reset a window's % is the old reading, not validated until the
    // next request reports one: it stays, dimmed, with no countdown.
    const quota: Seg[] = []
    for (const l of limits) {
      const label = l.kind === 'five_hour' || l.kind === 'seven_day' ? '' : `${l.kind} `
      const pct = `${label}${Math.round(l.percentUsed)}%`
      const resets = l.resetsAt ? Date.parse(l.resetsAt) : NaN
      const known = !Number.isNaN(resets) && now > 0
      if (known && resets <= now) {
        quota.push({ text: pct, dim: true })
        continue
      }
      quota.push({ text: pct, color: level(l.percentUsed) })
      if (known) quota.push({ text: fmtCountdown(resets - now), dim: true, glue: true })
    }

    const draw = (segs: readonly Seg[]) =>
      segs.map((s, i) => [
        i > 0 && <Text dimColor>{s.glue ? ' ' : SEP}</Text>,
        <Box flexShrink={s.shrink ? 1 : 0} minWidth={s.shrink ? 4 : undefined}>
          <Text
            color={s.color}
            bold={s.bold}
            dimColor={s.dim}
            wrap={s.shrink ? 'truncate-start' : 'truncate-end'}
          >
            {s.text}
          </Text>
        </Box>,
      ])

    // Left groups shrink (the path first); the quota side never does.
    const row = (left: readonly Seg[], right: readonly Seg[]) => (
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row" flexShrink={1} overflow="hidden">
          {draw(left)}
        </Box>
        {right.length > 0 && (
          <Box flexDirection="row" flexShrink={0} marginLeft={2}>
            {draw(right)}
          </Box>
        )}
      </Box>
    )

    // One row when everything fits, else model/ctx/quota over the path.
    const oneLine: Seg[] = [...head, ...place]
    const fits = width(oneLine) + (quota.length ? 2 + width(quota) : 0) <= e.props.bodyColumns
    return fits ? (
      row(oneLine, quota)
    ) : (
      <Box flexDirection="column">
        {row(head, quota)}
        {place.length > 0 && row(place, [])}
      </Box>
    )
  })
}
