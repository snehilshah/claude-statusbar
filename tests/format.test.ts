import { describe, expect, test } from 'claude-code/testing'

import {
  fmtCountdown,
  fmtTokens,
  level,
  prettyModel,
  tildePath,
  width,
} from '../hooks/format'

describe('format', () => {
  test('model ids read as names', async () => {
    expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(prettyModel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
    expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(prettyModel('Opus 5.5')).toBe('Opus 5.5')
  })

  test('tokens, countdowns, thresholds', async () => {
    expect(fmtTokens(950)).toBe('950')
    expect(fmtTokens(1234)).toBe('1.2k')
    expect(fmtTokens(45_200)).toBe('45k')
    expect(fmtTokens(1_000_000)).toBe('1M')
    expect(fmtCountdown(45 * 60_000)).toBe('45m')
    expect(fmtCountdown((2 * 60 + 14) * 60_000)).toBe('2h14m')
    expect(fmtCountdown((4 * 1440 + 3 * 60) * 60_000)).toBe('4d3h')
    expect(level(10)).toBe('success')
    expect(level(60)).toBe('warning')
    expect(level(90)).toBe('error')
  })

  test('paths and widths', async () => {
    expect(tildePath('/home/snehil/.claude')).toBe('~/.claude')
    expect(tildePath('/home/snehil')).toBe('~')
    expect(tildePath('/tmp/x')).toBe('/tmp/x')
    expect(width([{ text: 'ab' }, { text: 'cd' }, { text: 'e', glue: true }])).toBe(2 + 3 + 2 + 1 + 1)
  })
})
