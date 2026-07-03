import { describe, expect, it } from 'vitest'
import { sanitizeCsvCell } from '@/lib/csv/sanitize'

describe('sanitizeCsvCell', () => {
  it('prefixes a value starting with =', () => {
    expect(sanitizeCsvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
  })

  it('prefixes a value starting with +', () => {
    expect(sanitizeCsvCell('+1-555-0100')).toBe("'+1-555-0100")
  })

  it('prefixes a value starting with -', () => {
    expect(sanitizeCsvCell('-10% off next visit')).toBe("'-10% off next visit")
  })

  it('prefixes a value starting with @', () => {
    expect(sanitizeCsvCell('@mention their Instagram')).toBe("'@mention their Instagram")
  })

  it('leaves a value containing a dangerous character mid-string unchanged', () => {
    expect(sanitizeCsvCell('A+ Auto Repair')).toBe('A+ Auto Repair')
  })

  it('leaves a value with no dangerous character unchanged', () => {
    expect(sanitizeCsvCell('123 Main St')).toBe('123 Main St')
  })

  it('returns an empty string unchanged', () => {
    expect(sanitizeCsvCell('')).toBe('')
  })
})
