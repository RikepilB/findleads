// Zod validation boundary for the Google Places API (New) Text Search
// response. Never trust the raw JSON shape — parse it through these schemas
// before any downstream code (lib/places/client.ts, lib/places/mapPlaceToLead.ts)
// reads a field (coding-rules.md: "Validate at boundaries").
//
// Source: developers.google.com/maps/documentation/places/web-service/data-fields
// (field names/paths) + docs.cloud.google.com Go client reference (businessStatus
// enum values, confirmed OPTIONAL — omitted, not defaulted, when unknown).
import { z } from 'zod'

// `.optional()`, never `.default(...)` — an absent businessStatus must stay
// `undefined`, not silently coerced to 'OPERATIONAL' or any closed value
// (Pitfall 3). mapPlaceToLead.ts (Plan 02-04) relies on this exact contract
// to filter on an exclusion set, not an inclusion allowlist.
export const businessStatusSchema = z
  .enum(['BUSINESS_STATUS_UNSPECIFIED', 'OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'])
  .optional()

export const rawPlaceSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string(), languageCode: z.string().optional() }).optional(),
  formattedAddress: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  // Loose z.string() rather than z.url() — be lenient parsing an external
  // API's URI field; a minor formatting quirk shouldn't reject the whole
  // response. Judgment call, not a documented Google guarantee.
  websiteUri: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  businessStatus: businessStatusSchema,
})

export const textSearchResponseSchema = z.object({
  places: z.array(rawPlaceSchema).optional().default([]),
  nextPageToken: z.string().optional(),
})

export type RawPlace = z.infer<typeof rawPlaceSchema>
export type TextSearchResponse = z.infer<typeof textSearchResponseSchema>
