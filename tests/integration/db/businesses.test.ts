import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { businesses } from '@/lib/db/schema'
import { upsertBusiness } from '@/lib/db/businesses'

// Integration tests — run against the real, isolated test Neon database
// (vitest.config.ts injects TEST_DATABASE_URL as DATABASE_URL for the test
// process). Each test cleans up the row it creates so re-runs stay
// idempotent (see 01-05-PLAN.md threat T-05-01).

const PLACE_ID = 'test-place-businesses-01-05'

async function cleanup() {
  await db.delete(businesses).where(eq(businesses.placeId, PLACE_ID))
}

describe('businesses upsert (DATA-01, DATA-03)', () => {
  afterEach(cleanup)

  it('persists place content and is readable after upsert (DATA-03)', async () => {
    await upsertBusiness({
      placeId: PLACE_ID,
      businessName: 'Test Business',
      phone: '555-1234',
      address: '123 Main St',
      website: 'https://example.com',
      rating: 4.5,
      reviewCount: 10,
    })

    const [row] = await db.select().from(businesses).where(eq(businesses.placeId, PLACE_ID))

    expect(row).toBeDefined()
    expect(row.businessName).toBe('Test Business')
    expect(row.phone).toBe('555-1234')
    expect(row.address).toBe('123 Main St')
    expect(row.website).toBe('https://example.com')
    expect(row.rating).toBe(4.5)
    expect(row.reviewCount).toBe(10)
  })

  it('refreshes content but preserves notes/contacted/firstSeenAt across a re-sighting (DATA-01)', async () => {
    await upsertBusiness({
      placeId: PLACE_ID,
      businessName: 'Original Name',
      phone: '555-0000',
      address: 'Original Address',
      website: null,
      rating: 3.0,
      reviewCount: 5,
    })

    const [initial] = await db.select().from(businesses).where(eq(businesses.placeId, PLACE_ID))

    // Simulate a future CRM Server Action writing CRM state directly.
    await db
      .update(businesses)
      .set({ notes: 'Called, interested', contacted: true })
      .where(eq(businesses.placeId, PLACE_ID))

    // Re-sighting: same placeId, refreshed content fields.
    await upsertBusiness({
      placeId: PLACE_ID,
      businessName: 'Updated Name',
      phone: '555-9999',
      address: 'Original Address',
      website: null,
      rating: 3.0,
      reviewCount: 5,
    })

    const [after] = await db.select().from(businesses).where(eq(businesses.placeId, PLACE_ID))

    // Content fields refreshed to the new sighting.
    expect(after.businessName).toBe('Updated Name')
    expect(after.phone).toBe('555-9999')
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(initial.lastSeenAt.getTime())

    // CRM fields set outside upsertBusiness survive the second upsert.
    expect(after.notes).toBe('Called, interested')
    expect(after.contacted).toBe(true)
    expect(after.firstSeenAt.getTime()).toBe(initial.firstSeenAt.getTime())
  })
})
