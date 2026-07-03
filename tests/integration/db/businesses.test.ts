import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { businesses } from '@/lib/db/schema'
import {
  upsertBusiness,
  listBusinesses,
  updateBusinessNotes,
  setBusinessContacted,
} from '@/lib/db/businesses'

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

describe('listBusinesses/updateBusinessNotes/setBusinessContacted (CRM-01..05)', () => {
  afterEach(cleanup)

  it('listBusinesses returns every business ordered by updatedAt descending, with website null/not-null distinguishing tier', async () => {
    await upsertBusiness({
      placeId: PLACE_ID,
      businessName: 'Tier One (no website)',
      phone: null,
      address: null,
      website: null,
      rating: null,
      reviewCount: null,
    })

    const rows = await listBusinesses()
    const row = rows.find((r) => r.placeId === PLACE_ID)

    expect(row).toBeDefined()
    expect(row?.website).toBeNull()
    // Ordered by updatedAt desc — our freshly-upserted row should be first
    // among rows with the same or older updatedAt.
    expect(rows[0].updatedAt.getTime()).toBeGreaterThanOrEqual(rows.at(-1)!.updatedAt.getTime())
  })

  it('updateBusinessNotes persists notes and bumps updatedAt on every call (CRM-04, Pitfall 3)', async () => {
    await upsertBusiness({
      placeId: PLACE_ID,
      businessName: 'Notes Target',
      phone: null,
      address: null,
      website: null,
      rating: null,
      reviewCount: null,
    })
    const [initial] = await db.select().from(businesses).where(eq(businesses.placeId, PLACE_ID))

    await updateBusinessNotes(initial.id, 'First note')
    const [afterFirst] = await db.select().from(businesses).where(eq(businesses.placeId, PLACE_ID))
    expect(afterFirst.notes).toBe('First note')
    expect(afterFirst.updatedAt.getTime()).toBeGreaterThan(initial.updatedAt.getTime())

    await new Promise((r) => setTimeout(r, 5))
    await updateBusinessNotes(initial.id, 'Second note')
    const [afterSecond] = await db.select().from(businesses).where(eq(businesses.placeId, PLACE_ID))
    expect(afterSecond.notes).toBe('Second note')
    expect(afterSecond.updatedAt.getTime()).toBeGreaterThan(afterFirst.updatedAt.getTime())

    // Untouched columns.
    expect(afterSecond.businessName).toBe('Notes Target')
    expect(afterSecond.website).toBeNull()
  })

  it('setBusinessContacted persists contacted and bumps updatedAt, without touching other columns (CRM-04)', async () => {
    await upsertBusiness({
      placeId: PLACE_ID,
      businessName: 'Contacted Target',
      phone: null,
      address: null,
      website: 'https://example.com',
      rating: null,
      reviewCount: null,
    })
    const [initial] = await db.select().from(businesses).where(eq(businesses.placeId, PLACE_ID))

    await setBusinessContacted(initial.id, true)
    const [after] = await db.select().from(businesses).where(eq(businesses.placeId, PLACE_ID))

    expect(after.contacted).toBe(true)
    expect(after.updatedAt.getTime()).toBeGreaterThan(initial.updatedAt.getTime())
    expect(after.businessName).toBe('Contacted Target')
    expect(after.website).toBe('https://example.com')
    expect(after.notes).toBeNull()
  })
})
