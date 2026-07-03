import { describe, expect, it } from 'vitest'
import { inferLocale } from '@/lib/places/locale'

describe('inferLocale', () => {
  it('resolves a Toronto free-text location to en/CA', () => {
    expect(inferLocale('Toronto, ON')).toEqual({ languageCode: 'en', regionCode: 'CA' })
  })

  it('resolves a Lima/Peru free-text location to es/PE', () => {
    expect(inferLocale('Lima, Peru')).toEqual({ languageCode: 'es', regionCode: 'PE' })
  })

  it('matches case-insensitively with no country suffix', () => {
    expect(inferLocale('lima')).toEqual({ languageCode: 'es', regionCode: 'PE' })
  })

  it('matches when the city name is embedded mid-string with category text prefixed', () => {
    expect(inferLocale('restaurants in Lima')).toEqual({ languageCode: 'es', regionCode: 'PE' })
  })

  it('resolves an accented "Perú" free-text location to es/PE', () => {
    expect(inferLocale('Arequipa, Perú')).toEqual({ languageCode: 'es', regionCode: 'PE' })
  })

  it('falls back to the en/CA default for an unmatched market', () => {
    expect(inferLocale('Vancouver')).toEqual({ languageCode: 'en', regionCode: 'CA' })
  })

  it('falls back to the en/CA default for an empty string without throwing', () => {
    expect(() => inferLocale('')).not.toThrow()
    expect(inferLocale('')).toEqual({ languageCode: 'en', regionCode: 'CA' })
  })
})
