// Source: developers.google.com/maps/documentation/places/web-service/text-search
// (endpoint, headers, body fields — confirmed against 02-RESEARCH.md Code Example 1)
import 'server-only'
import { env } from '@/lib/env'
import { textSearchResponseSchema, type TextSearchResponse } from './schema'

export const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

// One field mask, reused for every call — satisfies SCRAPE-02: websiteUri and
// businessStatus are requested on the SAME call as every display field, no
// separate Place Details lookup per result.
export const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'nextPageToken',
].join(',')

export interface TextSearchParams {
  textQuery: string
  languageCode: string
  regionCode: string
  pageToken?: string
  pageSize?: number // max 20 (Google-enforced) — omit to use Google's own default of 20
}

// Deliberately carries only `status` and response `body` text — never the
// outbound request object, which holds the X-Goog-Api-Key header. Do not
// extend this class to log the request/headers (T-02-03-02).
export class PlacesApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Places API request failed: ${status}`)
    this.name = 'PlacesApiError'
  }
}

export async function searchTextPlaces(
  params: TextSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<TextSearchResponse> {
  const res = await fetchImpl(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.PLACES_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: params.textQuery,
      languageCode: params.languageCode,
      regionCode: params.regionCode,
      ...(params.pageSize ? { pageSize: params.pageSize } : {}),
      ...(params.pageToken ? { pageToken: params.pageToken } : {}),
    }),
  })

  if (!res.ok) {
    throw new PlacesApiError(res.status, await res.text())
  }

  // Validate at the boundary — never trust the raw JSON shape (coding-rules.md).
  return textSearchResponseSchema.parse(await res.json())
}
