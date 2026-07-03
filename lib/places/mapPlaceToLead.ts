// Maps a validated raw Places API place to this app's lead shape, excluding
// closed businesses (SCRAPE-04) and classifying tier-1 leads whose
// websiteUri is absent (SCRAPE-05).
//
// Source: Phase 1's businesses/leads column shape (01-RESEARCH.md) +
// 02-RESEARCH.md Code Example 5.
import type { RawPlace } from './schema'

export interface MappedLead {
  placeId: string
  businessName: string
  phone: string | null
  address: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
  tier: 'tier-1' | null
  tierReason: string | null
}

// Exclusion set, not an inclusion allowlist — see 02-RESEARCH.md Pitfall 3. A
// place with NO businessStatus field at all (unknown status) is correctly
// included here, since it will not match this Set.
const CLOSED_STATUSES = new Set(['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'])

/**
 * Maps a validated raw place to this app's lead shape, or returns null if the
 * business is closed (SCRAPE-04 — excluded from results entirely, not just
 * flagged).
 */
export function mapPlaceToLead(place: RawPlace): MappedLead | null {
  if (place.businessStatus && CLOSED_STATUSES.has(place.businessStatus)) {
    return null
  }

  const hasWebsite = Boolean(place.websiteUri)

  return {
    placeId: place.id,
    businessName: place.displayName?.text ?? '',
    phone: place.internationalPhoneNumber ?? null,
    address: place.formattedAddress ?? null,
    website: place.websiteUri ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    // Signal, not fact — the exact copy SCRAPE-05 requires (Pitfall 2).
    tier: hasWebsite ? null : 'tier-1',
    tierReason: hasWebsite ? null : 'no website found on Google',
  }
}
