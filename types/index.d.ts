export type Effort = string | number

declare module 'claude-code' {
  interface PluginState {
    statusbar: { effort: Effort | null }
  }
}
