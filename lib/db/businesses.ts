import 'server-only'
import { db } from '@/lib/db/client'
import { businesses } from '@/lib/db/schema'

export async function upsertBusiness(place: {
  placeId: string
  businessName: string
  phone: string | null
  address: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
}): Promise<void> {
  const now = new Date()
  await db
    .insert(businesses)
    .values({
      placeId: place.placeId,
      businessName: place.businessName,
      phone: place.phone,
      address: place.address,
      website: place.website,
      rating: place.rating,
      reviewCount: place.reviewCount,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: businesses.placeId,
      set: {
        // Content fields: always refreshed to the latest sighting.
        businessName: place.businessName,
        phone: place.phone,
        address: place.address,
        website: place.website,
        rating: place.rating,
        reviewCount: place.reviewCount,
        lastSeenAt: now,
        updatedAt: now,
        // Deliberately NOT listed here: notes, contacted, firstSeenAt.
        // Omitting a column from `set` is what makes Postgres leave its
        // existing value untouched on conflict — this omission IS DATA-01.
      },
    })
}
