import { describe, expect, it } from 'vitest'
import { mapPlaceToLead } from '@/lib/places/mapPlaceToLead'
import type { RawPlace } from '@/lib/places/schema'

const basePlace: RawPlace = {
  id: 'place-1',
  displayName: { text: 'Test Business' },
  formattedAddress: '123 Main St',
  internationalPhoneNumber: '+1 555 0100',
  websiteUri: 'https://example.com',
  rating: 4.5,
  userRatingCount: 10,
  businessStatus: 'OPERATIONAL',
}

describe('mapPlaceToLead', () => {
  it('returns null for a permanently closed business', () => {
    const place: RawPlace = { ...basePlace, businessStatus: 'CLOSED_PERMANENTLY' }
    expect(mapPlaceToLead(place)).toBeNull()
  })

  it('returns null for a temporarily closed business', () => {
    const place: RawPlace = { ...basePlace, businessStatus: 'CLOSED_TEMPORARILY' }
    expect(mapPlaceToLead(place)).toBeNull()
  })

  it('includes a business whose businessStatus is entirely absent (Pitfall 3 regression)', () => {
    const { businessStatus: _businessStatus, ...rest } = basePlace
    const place = rest as RawPlace
    const result = mapPlaceToLead(place)
    expect(result).not.toBeNull()
  })

  it('includes a business with businessStatus OPERATIONAL', () => {
    const result = mapPlaceToLead(basePlace)
    expect(result).not.toBeNull()
  })

  it('classifies tier-1 with exact tierReason copy when websiteUri is absent', () => {
    const { websiteUri: _websiteUri, ...rest } = basePlace
    const place = rest as RawPlace
    const result = mapPlaceToLead(place)
    expect(result?.tier).toBe('tier-1')
    expect(result?.tierReason).toBe('no website found on Google')
  })

  it('sets tier and tierReason to null when websiteUri is present', () => {
    const result = mapPlaceToLead(basePlace)
    expect(result?.tier).toBeNull()
    expect(result?.tierReason).toBeNull()
  })

  it('maps absent optional fields to null (never undefined) and businessName to empty string when displayName is absent', () => {
    const place: RawPlace = { id: 'place-2', businessStatus: 'OPERATIONAL' }
    const result = mapPlaceToLead(place)
    expect(result).toEqual({
      placeId: 'place-2',
      businessName: '',
      phone: null,
      address: null,
      website: null,
      rating: null,
      reviewCount: null,
      tier: 'tier-1',
      tierReason: 'no website found on Google',
    })
  })

  it('does not mutate the input RawPlace object', () => {
    const place: RawPlace = { ...basePlace }
    const snapshot = { ...place }
    mapPlaceToLead(place)
    expect(place).toEqual(snapshot)
  })
})
