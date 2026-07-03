import { describe, expect, it, vi } from 'vitest'
import { searchTextPlaces, PlacesApiError, FIELD_MASK } from '@/lib/places/client'
import { mockFetchOnce } from '../../../helpers/mockFetch'
import torontoFixture from '../../../fixtures/places/text-search-toronto-page1.json'
import limaFixture from '../../../fixtures/places/text-search-lima-page1.json'

describe('searchTextPlaces', () => {
  it('resolves with a parsed TextSearchResponse and calls fetchImpl exactly once', async () => {
    const fetchStub = mockFetchOnce(200, torontoFixture)

    const result = await searchTextPlaces(
      { textQuery: 'restaurant', languageCode: 'en', regionCode: 'CA' },
      fetchStub,
    )

    expect(result.places[0].id).toBe('ChIJT_toronto_place_1')
    expect(fetchStub).toHaveBeenCalledTimes(1)
  })

  it('sends websiteUri and businessStatus in the same X-Goog-FieldMask header as every display field', async () => {
    const fetchStub = mockFetchOnce(200, torontoFixture)

    await searchTextPlaces(
      { textQuery: 'restaurant', languageCode: 'en', regionCode: 'CA' },
      fetchStub,
    )

    expect(FIELD_MASK).toEqual(expect.stringContaining('places.websiteUri'))
    expect(FIELD_MASK).toEqual(expect.stringContaining('places.businessStatus'))

    const [, requestInit] = vi.mocked(fetchStub).mock.calls[0]
    const headers = requestInit!.headers as Record<string, string>
    expect(headers['X-Goog-FieldMask']).toEqual(expect.stringContaining('places.websiteUri'))
    expect(headers['X-Goog-FieldMask']).toEqual(expect.stringContaining('places.businessStatus'))
  })

  it('resolves with the Lima fixture and reflects the es/PE locale params in the request body', async () => {
    const fetchStub = mockFetchOnce(200, limaFixture)

    const result = await searchTextPlaces(
      { textQuery: 'restaurante', languageCode: 'es', regionCode: 'PE' },
      fetchStub,
    )

    expect(result.places[0].displayName?.text).toBe('Restaurante El Mirador Limeño')
    expect(result.places[0].formattedAddress).toContain('Lima, Perú')

    const [, requestInit] = vi.mocked(fetchStub).mock.calls[0]
    const body = JSON.parse(requestInit!.body as string)
    expect(body.languageCode).toBe('es')
    expect(body.regionCode).toBe('PE')
  })

  it('throws PlacesApiError with the status/body but never leaks the X-Goog-Api-Key header value', async () => {
    const fetchStub = (async () => ({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
      json: async () => ({}),
    })) as unknown as typeof fetch

    let caught: unknown
    try {
      await searchTextPlaces(
        { textQuery: 'restaurant', languageCode: 'en', regionCode: 'CA' },
        fetchStub,
      )
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(PlacesApiError)
    const err = caught as PlacesApiError
    expect(err.status).toBe(400)
    expect(err.body).toBe('Bad Request')

    const serialized = JSON.stringify(err) + err.message + err.stack
    expect(serialized).not.toContain('X-Goog-Api-Key')
    expect(serialized).not.toContain('vitest-placeholder-not-a-real-key')
  })

  it('throws a Zod validation error on a malformed response shape', async () => {
    const fetchStub = mockFetchOnce(200, { places: 'not an array' })

    await expect(
      searchTextPlaces(
        { textQuery: 'restaurant', languageCode: 'en', regionCode: 'CA' },
        fetchStub,
      ),
    ).rejects.toThrow()
  })

  it('omits pageToken/pageSize from the request body entirely when not provided', async () => {
    const fetchStub = mockFetchOnce(200, torontoFixture)

    await searchTextPlaces(
      { textQuery: 'restaurant', languageCode: 'en', regionCode: 'CA' },
      fetchStub,
    )

    const [, requestInit] = vi.mocked(fetchStub).mock.calls[0]
    const body = JSON.parse(requestInit!.body as string)
    expect(body).not.toHaveProperty('pageToken')
    expect(body).not.toHaveProperty('pageSize')
  })
})
