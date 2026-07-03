import { describe, expect, it } from 'vitest'
import { buildTextQuery } from '@/lib/jobs/buildTextQuery'

describe('buildTextQuery', () => {
  it('composes category and location into the documented "X in Y" format', () => {
    expect(buildTextQuery('restaurant', 'Toronto, ON')).toBe('restaurant in Toronto, ON')
  })

  it('always includes both category and location in the composed string', () => {
    const result = buildTextQuery('restaurant', 'Toronto, ON')
    expect(result).toContain('restaurant')
    expect(result).toContain('Toronto, ON')
  })

  it('never returns just the category alone, even for an unrecognized/default-locale location', () => {
    const result = buildTextQuery('plumber', 'Nowheresville')
    expect(result).not.toBe('plumber')
    expect(result).toContain('Nowheresville')
  })
})
