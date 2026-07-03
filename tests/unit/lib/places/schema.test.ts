import { describe, expect, it } from 'vitest'
import { rawPlaceSchema, textSearchResponseSchema } from '@/lib/places/schema'

describe('rawPlaceSchema', () => {
  it('parses a full valid place object with every field present', () => {
    const parsed = rawPlaceSchema.parse({
      id: 'place-1',
      displayName: { text: 'Toronto Cafe', languageCode: 'en' },
      formattedAddress: '123 Main St, Toronto, ON',
      internationalPhoneNumber: '+1 416-555-0100',
      websiteUri: 'https://example.com',
      rating: 4.5,
      userRatingCount: 120,
      businessStatus: 'OPERATIONAL',
    })

    expect(parsed.id).toBe('place-1')
    expect(parsed.displayName?.text).toBe('Toronto Cafe')
    expect(parsed.formattedAddress).toBe('123 Main St, Toronto, ON')
    expect(parsed.internationalPhoneNumber).toBe('+1 416-555-0100')
    expect(parsed.websiteUri).toBe('https://example.com')
    expect(parsed.rating).toBe(4.5)
    expect(parsed.userRatingCount).toBe(120)
    expect(parsed.businessStatus).toBe('OPERATIONAL')
  })

  it('parses a minimal object containing only id, leaving other fields undefined', () => {
    const parsed = rawPlaceSchema.parse({ id: 'place-2' })

    expect(parsed.id).toBe('place-2')
    expect(parsed.displayName).toBeUndefined()
    expect(parsed.formattedAddress).toBeUndefined()
    expect(parsed.internationalPhoneNumber).toBeUndefined()
    expect(parsed.websiteUri).toBeUndefined()
    expect(parsed.rating).toBeUndefined()
    expect(parsed.userRatingCount).toBeUndefined()
    expect(parsed.businessStatus).toBeUndefined()
  })

  it('throws when id (the one required field) is missing', () => {
    expect(() => rawPlaceSchema.parse({ displayName: { text: 'No Id Place' } })).toThrow()
  })

  it('parses successfully with businessStatus left undefined when entirely absent (Pitfall 3 regression)', () => {
    const parsed = rawPlaceSchema.parse({ id: 'place-3', displayName: { text: 'Unknown Status Place' } })

    expect(parsed.businessStatus).toBeUndefined()
  })
})

describe('textSearchResponseSchema', () => {
  it('parses a response with both places and nextPageToken present', () => {
    const parsed = textSearchResponseSchema.parse({
      places: [{ id: 'place-1' }],
      nextPageToken: 'token-abc',
    })

    expect(parsed.places).toHaveLength(1)
    expect(parsed.nextPageToken).toBe('token-abc')
  })

  it('defaults places to an empty array and leaves nextPageToken undefined when the key is entirely absent', () => {
    const parsed = textSearchResponseSchema.parse({})

    expect(parsed.places).toEqual([])
    expect(parsed.nextPageToken).toBeUndefined()
  })
})
