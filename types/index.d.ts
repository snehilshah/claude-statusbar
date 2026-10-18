export type Effort = string | number

// Context fill: tokens over the window (the compaction window when set); approx = local estimate.
export type Fill = { tokens: number; approx: boolean; window: number }

declare module 'claude-code' {
  interface PluginState {
    statusbar: { effort: Effort | null; fill: Fill | null }
  }
}
