import { describe, expect, it } from 'vitest'
import { initialCursor, SAFETY_WINDOW_MS, MAX_PAGES } from '@/lib/jobs/checkpoint'

describe('checkpoint', () => {
  it('initialCursor returns the starting cursor shape', () => {
    expect(initialCursor()).toEqual({
      pageToken: null,
      pagesFetched: 0,
      done: false,
      capHit: false,
    })
  })

  it('SAFETY_WINDOW_MS is exactly 250_000', () => {
    expect(SAFETY_WINDOW_MS).toBe(250_000)
  })

  it('MAX_PAGES is exactly 3', () => {
    expect(MAX_PAGES).toBe(3)
  })
})
