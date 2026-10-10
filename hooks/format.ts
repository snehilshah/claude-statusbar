// Pure formatting helpers: no `$`, so the tests can call them directly.

export type Seg = {
  text: string
  color?: string
  bold?: boolean
  dim?: boolean
  // The one segment allowed to shrink (cut from its start) when the row is too narrow.
  shrink?: boolean
  // Joined to the previous segment by a space instead of SEP (e.g. "5h 12% 2h14m").
  glue?: boolean
}

// green < 60% <= yellow < 85% <= red
export const level = (pct: number): string =>
  pct >= 85 ? 'error' : pct >= 60 ? 'warning' : 'success'

// 1234 -> 1.2k, 45200 -> 45k, 1000000 -> 1M
export const fmtTokens = (n: number): string => {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return `${n}`
}

// ms until reset -> 4d3h, 2h14m, 45m
export const fmtCountdown = (ms: number): string => {
  if (ms <= 0) return '0m'
  const mins = Math.floor(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d >= 1) return `${d}d${h}h`
  if (h >= 1) return `${h}h${m}m`
  return `${m}m`
}

// "claude-opus-5-5[1m]" -> "Opus 5.5"; anything else is returned as is.
export const prettyModel = (id: string): string => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(id)
  if (!m || !m[1]) return id
  const name = m[1][0]!.toUpperCase() + m[1].slice(1)
  return m[3] ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`
}

export const shortEffort = (e: string | number): string =>
  e === 'medium' ? 'med' : `${e}`

// /home/me/x -> ~/x, /Users/me/x -> ~/x
export const tildePath = (p: string): string =>
  p.replace(/^\/(?:home|Users)\/[^/]+(?=\/|$)/, '~')

export const SEP = ' · '

export const width = (segs: readonly Seg[]): number =>
  segs.reduce((n, s, i) => n + s.text.length + (i === 0 ? 0 : s.glue ? 1 : SEP.length), 0)
