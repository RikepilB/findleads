import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { businesses, jobs, leads } from '@/lib/db/schema'
import { createJob } from '@/lib/db/jobs'
import { insertLeadSnapshot } from '@/lib/db/leads'
import { upsertBusiness } from '@/lib/db/businesses'

// Integration tests — run against the real, isolated test Neon database
// (vitest.config.ts injects TEST_DATABASE_URL as DATABASE_URL for the test
// process). Each test cleans up the rows it creates (leads, businesses,
// jobs) so re-runs stay idempotent (see 01-05-PLAN.md threat T-05-01).

const PLACE_ID_A = 'test-place-leads-a'
const PLACE_ID_B = 'test-place-leads-b'

function place(placeId: string) {
  return {
    placeId,
    businessName: 'Test Lead Business',
    phone: '555-1111',
    address: '1 Test Ave',
    website: null,
    rating: 4.0,
    reviewCount: 2,
  }
}

describe('leads snapshot insert (DATA-02)', () => {
  let jobId: string | undefined

  afterEach(async () => {
    if (jobId) {
      await db.delete(leads).where(eq(leads.jobId, jobId))
      await db.delete(jobs).where(eq(jobs.id, jobId))
      jobId = undefined
    }
    await db.delete(businesses).where(eq(businesses.placeId, PLACE_ID_A))
    await db.delete(businesses).where(eq(businesses.placeId, PLACE_ID_B))
  })

  it('is idempotent under a simulated worker retry: no error, exactly one row', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Toronto' })
    jobId = job.id

    await insertLeadSnapshot(jobId, place(PLACE_ID_A))
    await expect(insertLeadSnapshot(jobId, place(PLACE_ID_A))).resolves.not.toThrow()

    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.jobId, jobId))

    expect(rows.filter((r) => r.placeId === PLACE_ID_A)).toHaveLength(1)
  })

  it('scopes dedup to the exact (job, place) pair, not a global collapse', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Toronto' })
    jobId = job.id

    await insertLeadSnapshot(jobId, place(PLACE_ID_A))
    await insertLeadSnapshot(jobId, place(PLACE_ID_B))

    const rows = await db.select().from(leads).where(eq(leads.jobId, jobId))
    const placeIds = rows.map((r) => r.placeId).sort()

    expect(placeIds).toEqual([PLACE_ID_A, PLACE_ID_B].sort())
  })

  it('joins to businesses by placeId at query time for CRM display/export', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Toronto' })
    jobId = job.id

    await insertLeadSnapshot(jobId, place(PLACE_ID_A))
    await upsertBusiness(place(PLACE_ID_A))

    const rows = await db
      .select({
        leadPlaceId: leads.placeId,
        leadBusinessName: leads.businessName,
        businessNotes: businesses.notes,
        businessContacted: businesses.contacted,
      })
      .from(leads)
      .innerJoin(businesses, eq(leads.placeId, businesses.placeId))
      .where(eq(leads.jobId, jobId))

    expect(rows).toHaveLength(1)
    expect(rows[0].leadPlaceId).toBe(PLACE_ID_A)
    expect(rows[0].leadBusinessName).toBe('Test Lead Business')
    expect(rows[0].businessContacted).toBe(false)
  })
})
