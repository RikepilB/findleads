import { afterEach, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { businesses, jobs, leads } from '@/lib/db/schema'
import { createJob, getJob } from '@/lib/db/jobs'
import { runScrapeJob } from '@/lib/jobs/runScrapeJob'
import { mapPlaceToLead, type MappedLead } from '@/lib/places/mapPlaceToLead'
import type { RawPlace } from '@/lib/places/schema'
import type { JobCursor } from '@/lib/jobs/checkpoint'
import torontoFixture from '../../fixtures/places/text-search-toronto-page1.json'

// Integration tests — run against the real, isolated test Neon database
// (vitest.config.ts injects TEST_DATABASE_URL as DATABASE_URL for the test
// process). Reuses Phase 2's existing Toronto fixture as-is (no new fixture
// file), wrapped in a single fetchOnePage result so the worker completes in
// one loop iteration. No real Google Places API call and no real timer
// anywhere in this file. Each test cleans up the rows it creates (jobs,
// leads, businesses) so re-runs stay idempotent, per Plan 01-05's
// established discipline.

const FIXTURE_PLACE_IDS = torontoFixture.places.map((place) => place.id)

const MAPPED_LEADS: MappedLead[] = (torontoFixture.places as RawPlace[])
  .map(mapPlaceToLead)
  .filter((lead): lead is MappedLead => lead !== null)

async function stubFetchOnePage(): Promise<{ mapped: MappedLead[]; nextCursor: JobCursor }> {
  return {
    mapped: MAPPED_LEADS,
    nextCursor: { pageToken: null, pagesFetched: 1, done: true, capHit: false },
  }
}

describe('runScrapeJob — real test DB + Phase 2 fixtures (JOB-02/JOB-03/JOB-07 wiring)', () => {
  let jobId: string | undefined

  afterEach(async () => {
    if (jobId) {
      await db.delete(leads).where(eq(leads.jobId, jobId))
      await db.delete(jobs).where(eq(jobs.id, jobId))
      jobId = undefined
    }
    await db.delete(businesses).where(inArray(businesses.placeId, FIXTURE_PLACE_IDS))
  })

  it('produces correct leads/businesses rows and a done status from a real fetchOnePage stub', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Toronto, ON' })
    jobId = job.id

    await runScrapeJob(jobId, { fetchOnePage: stubFetchOnePage })

    const updated = await getJob(jobId)
    expect(updated?.status).toBe('done')
    expect(updated?.leadsFound).toBe(MAPPED_LEADS.length)
    expect(updated?.cursor).toBeNull()

    const leadRows = await db.select().from(leads).where(eq(leads.jobId, jobId))
    expect(leadRows).toHaveLength(MAPPED_LEADS.length)
    expect(leadRows.map((r) => r.placeId).sort()).toEqual([...FIXTURE_PLACE_IDS].sort())

    const businessRows = await db
      .select()
      .from(businesses)
      .where(inArray(businesses.placeId, FIXTURE_PLACE_IDS))
    expect(businessRows).toHaveLength(MAPPED_LEADS.length)
  })

  it('does not duplicate leads rows on a repeated call for the same job (JOB-07)', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Toronto, ON' })
    jobId = job.id

    await runScrapeJob(jobId, { fetchOnePage: stubFetchOnePage })
    const firstRunRows = await db.select().from(leads).where(eq(leads.jobId, jobId))
    expect(firstRunRows).toHaveLength(MAPPED_LEADS.length)

    // Simulated retry/duplicate invocation for the SAME jobId + same stub.
    await runScrapeJob(jobId, { fetchOnePage: stubFetchOnePage })
    const secondRunRows = await db.select().from(leads).where(eq(leads.jobId, jobId))

    expect(secondRunRows).toHaveLength(MAPPED_LEADS.length)
  })
})
