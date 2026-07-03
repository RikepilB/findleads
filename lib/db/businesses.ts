import 'server-only'
import { desc, eq } from 'drizzle-orm'
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

// CRM-01..05: reads/writes for the Leads dashboard (Plan 05-03). A business
// with `website: null` is the tier-1 signal (no separate tier column) —
// callers derive tier from that field at read time.
export function listBusinesses() {
  return db.select().from(businesses).orderBy(desc(businesses.updatedAt))
}

// CRM-04: Drizzle does not auto-bump a `.defaultNow()` column on UPDATE
// (only on INSERT) — `updatedAt` must be set explicitly in the same `.set()`
// call, same discipline as `upsertBusiness`'s onConflictDoUpdate above.
export async function updateBusinessNotes(id: number, notes: string): Promise<void> {
  await db
    .update(businesses)
    .set({ notes, updatedAt: new Date() })
    .where(eq(businesses.id, id))
}

export async function setBusinessContacted(id: number, contacted: boolean): Promise<void> {
  await db
    .update(businesses)
    .set({ contacted, updatedAt: new Date() })
    .where(eq(businesses.id, id))
}
