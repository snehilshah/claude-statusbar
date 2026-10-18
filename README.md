# statusbar

A minimal, colored status bar mod for Claude Code, drawn above the prompt:

```
Opus 5.5 · high · ctx 89k/1M · ~/project                 12% 2h14m · 40% 4d3h
```

- Model and effort, context fill against the auto-compact window (green / yellow at 60% / red at 85%; `~` = local estimate before the first response), project path.
- 5-hour and 7-day rate limits with reset countdowns; a % from before its window reset is dimmed.
- Vim mode moved from the left of the hint line to the right footer, so the line no longer shifts.
- Refreshes every minute from figures Claude Code already holds: no API calls, no usage.

## Install

```
/plugin install statusbar --marketplace snehilshah/claude-statusbar
```

Answer `y` to add the marketplace, then pick the user scope.

## Update

```
claude plugin marketplace update claude-statusbar
claude plugin update statusbar@claude-statusbar
```

## Develop

`claude plugin validate .` · `claude plugin test .` · `tsc -p .`
