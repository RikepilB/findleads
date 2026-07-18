import { describe, expect, it } from 'vitest'
import { relativeTime } from '@/lib/format/relativeTime'

const NOW = new Date('2026-07-18T12:00:00Z').getTime()
const now = () => NOW

describe('relativeTime', () => {
  it('formats sub-hour differences in minutes', () => {
    expect(relativeTime(new Date(NOW - 5 * 60_000), now)).toBe('5 minutes ago')
  })

  it('formats sub-day differences in hours', () => {
    expect(relativeTime(new Date(NOW - 3 * 3_600_000), now)).toBe('3 hours ago')
  })

  it('formats day-scale differences in days', () => {
    expect(relativeTime(new Date(NOW - 2 * 86_400_000), now)).toBe('2 days ago')
  })

  it('uses numeric:auto phrasing for a zero-minute difference', () => {
    // Intl renders 0 minutes as a phrase ("this minute"), not "0 minutes ago".
    expect(relativeTime(new Date(NOW), now)).toBe('this minute')
  })
})
