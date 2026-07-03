import 'server-only'
import { db } from '@/lib/db/client'
import { leads } from '@/lib/db/schema'

export async function insertLeadSnapshot(
  jobId: string,
  place: {
    placeId: string
    businessName: string
    phone: string | null
    address: string | null
    website: string | null
    rating: number | null
    reviewCount: number | null
  }
): Promise<void> {
  await db
    .insert(leads)
    .values({ jobId, ...place })
    .onConflictDoNothing({ target: [leads.jobId, leads.placeId] })
  // If the checkpointed worker (Phase 3) re-processes a page after a
  // resume, this is a no-op rather than a unique-violation error.
}
