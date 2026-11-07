import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextBreakdown, SessionContextUsage } from 'claude-code'

const BAR = {
  plugin: 'statusbar',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

// What the engine holds; a test changes it as a command would.
type World = { id: string; tokens?: number; estimate: number }

// Hooks standing for the engine. The local estimate on a fresh start is the
// system prompt and tools alone (23k).
function engine(on: On, world: World = { id: 's1', estimate: 23_000 }) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.root', () => ({ value: '/tmp/x' }))
  on('session.id', () => ({ value: world.id }))
  on('classic.PostModelSwitch', () => ({}))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('command.run', () => ({ text: '' }))
  on('session.usage', (_, e) => {
    const breakdown = { totalTokens: world.estimate, rawMaxTokens: 500_000 } as SessionContextBreakdown
    const context: SessionContextUsage = { window: 1_000_000 }
    if (world.tokens !== undefined) context.tokens = world.tokens
    if (e.breakdown) context.breakdown = breakdown
    return { value: { startedAt: 0, context, rateLimits: [] } }
  })
  return mock.clock(on)
}

const measure = (context: SessionContextUsage) => ({ context, rateLimits: [], changed: ['context' as const] })

// The bar's row as one string: its Texts joined in order.
async function bar($: Engine): Promise<string> {
  const ui = await $.ui.mount(BAR)
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return texts.map(t => t.text).join('')
}

async function ctx($: Engine): Promise<string | undefined> {
  const ui = await $.ui.mount(BAR)
  const text = (await ui.find({ type: 'Text', text: /^ctx / }))?.text
  await ui.unmount()
  return text
}

const start = ($: Engine) => $.session.start({ cwd: '/tmp/x', surface: 'terminal', isInteractive: true })

test('a compaction shows the new estimate, not the stale reported fill', async ($, on) => {
  const world: World = { id: 's1', tokens: 200_000, estimate: 200_000 }
  const clock = engine(on, world)
  const summary = [{ role: 'user' as const, text: 'summary', toolUses: [] }]
  on('session.compact', () => ({ messages: summary, tokensAfter: 6_000 }))
  await start($)
  expect(await ctx($)).toBe('ctx 200k/500k')

  // The engine may still report the pre-compaction figure for a moment.
  world.estimate = 31_000
  await $.session.compact({ trigger: 'manual', messages: summary })
  await clock.advance(1_000)
  expect(await ctx($)).toBe('ctx ~31k/500k')

  // The next response's figure takes over.
  await $.session.measure(measure({ window: 1_000_000, tokens: 33_000 }))
  expect(await ctx($)).toBe('ctx 33k/500k')
  await clock.settle()
})

test('a fresh start shows the estimate', async ($, on) => {
  const clock = engine(on)
  await start($)
  expect(await ctx($)).toBe('ctx ~23k/500k')
  await clock.settle()
})

test('a /resume inside the session shows within seconds, with no event', async ($, on) => {
  const world: World = { id: 's1', estimate: 23_000 }
  const clock = engine(on, world)
  await start($)
  expect(await ctx($)).toBe('ctx ~23k/500k')

  // Another conversation swaps in; the engine holds its last response's figure.
  world.id = 's2'
  world.tokens = 180_000
  await clock.advance(3_000)
  expect(await ctx($)).toBe('ctx 180k/500k')
  await clock.settle()
})

test('a /clear that drops the reported fill shows within seconds', async ($, on) => {
  const world: World = { id: 's1', tokens: 150_000, estimate: 150_000 }
  const clock = engine(on, world)
  await start($)
  expect(await ctx($)).toBe('ctx 150k/500k')

  world.tokens = undefined
  world.estimate = 21_000
  await clock.advance(3_000)
  expect(await ctx($)).toBe('ctx ~21k/500k')
  await clock.settle()
})

test('a slash command refreshes the bar when it returns', async ($, on) => {
  const world: World = { id: 's1', tokens: 90_000, estimate: 90_000 }
  const clock = engine(on, world)
  await start($)
  world.tokens = 40_000
  await $.command.run({
    command: 'rewind',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  await clock.settle()
  expect(await ctx($)).toBe('ctx 40k/500k')
  await clock.settle()
})

const HINT = {
  plugin: 'statusbar',
  component: 'PromptHint',
  surface: 'terminal',
  props: { isDraft: false, isWorking: false, hint: '' },
} as const

const MODES = {
  plugin: 'statusbar',
  component: 'SessionMode',
  surface: 'terminal',
  props: { modes: [] as readonly string[] },
} as const

test('the vim mode is a tag at the right of the footer, and the hint line keeps its shape', async ($, on) => {
  const clock = engine(on)
  // Stand for the engine drawing what it is handed.
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  await start($)

  const hint = async (text: string) => {
    const ui = await $.ui.mount({ ...HINT, props: { ...HINT.props, hint: text } })
    const shown = (await ui.find({ type: 'Text' }))?.text
    await ui.unmount()
    return shown
  }
  const modes = async (labels: readonly string[] = []) => {
    const ui = await $.ui.mount({ ...MODES, props: { modes: labels } })
    const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
    await ui.unmount()
    return shown
  }

  // Vim off: nothing added.
  expect(await hint('? for shortcuts')).toBe('? for shortcuts')
  expect(await modes()).toBe('')

  // The same hint line in both modes; the tag on the right.
  expect(await hint('-- INSERT -- (shift+tab to cycle)')).toBe('(shift+tab to cycle) ')
  expect(await modes()).toBe('INS')
  expect(await hint('(shift+tab to cycle)')).toBe('(shift+tab to cycle) ')
  expect(await modes(['focus'])).toBe('focus & NOR')
  expect(await bar($)).toMatch(/^Opus 5\.5/)
  await clock.settle()
})
