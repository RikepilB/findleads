import { describe, expect, it } from 'vitest'
import { isTerminalStatus } from '@/app/jobs/JobStatusPoller'

describe('isTerminalStatus', () => {
  it('returns true for done', () => {
    expect(isTerminalStatus('done')).toBe(true)
  })

  it('returns true for error', () => {
    expect(isTerminalStatus('error')).toBe(true)
  })

  it('returns false for pending', () => {
    expect(isTerminalStatus('pending')).toBe(false)
  })

  it('returns false for running', () => {
    expect(isTerminalStatus('running')).toBe(false)
  })

  it('returns false for partial', () => {
    expect(isTerminalStatus('partial')).toBe(false)
  })
})
