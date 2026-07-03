import { afterEach, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { businesses, jobs, leads } from '@/lib/db/schema'
import { createJob } from '@/lib/db/jobs'
import { buildJobLeadsCsv } from '@/lib/csv/export'

// Integration test — runs against the real, isolated test Neon database
// (vitest.config.ts injects TEST_DATABASE_URL as DATABASE_URL for the test
// process), mirroring tests/integration/jobs/runScrapeJob.test.ts's
// seed/afterEach-cleanup convention. Seeds leads/businesses directly via the
// db handle (not through runScrapeJob) since this test is scoped to the
// join/sanitize/stringify path itself.

const FIXTURE_PLACE_IDS = [
  'place-notes-contacted',
  'place-formula-injection',
  'place-no-website',
]

describe('buildJobLeadsCsv — real test DB (EXPORT-01, EXPORT-02)', () => {
  let jobId: string | undefined

  afterEach(async () => {
    if (jobId) {
      await db.delete(leads).where(eq(leads.jobId, jobId))
      await db.delete(jobs).where(eq(jobs.id, jobId))
      jobId = undefined
    }
    await db.delete(businesses).where(inArray(businesses.placeId, FIXTURE_PLACE_IDS))
  })

  it('joins leads to businesses current notes/contacted, sanitizes a formula-injection fixture in the real CSV output, and renders a null website as the tier-1 message', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Toronto, ON' })
    jobId = job.id

    await db.insert(businesses).values([
      {
        placeId: 'place-notes-contacted',
        businessName: 'Maple Diner',
        phone: '416-555-0100',
        address: '1 King St Toronto ON',
        website: 'https://mapdediner.example',
        rating: 4.5,
        reviewCount: 100,
        notes: 'Called - interested in a follow-up',
        contacted: true,
      },
      {
        placeId: 'place-formula-injection',
        businessName: '=SUM(A1:A9)',
        phone: null,
        address: null,
        website: null,
        rating: null,
        reviewCount: null,
        notes: null,
        contacted: false,
      },
      {
        placeId: 'place-no-website',
        businessName: 'Corner Cafe',
        phone: '416-555-0200',
        address: '2 Queen St, Toronto, ON',
        website: null,
        rating: 4.0,
        reviewCount: 20,
        notes: null,
        contacted: false,
      },
    ])

    await db.insert(leads).values([
      {
        jobId,
        placeId: 'place-notes-contacted',
        businessName: 'Maple Diner',
        phone: '416-555-0100',
        address: '1 King St Toronto ON',
        website: 'https://mapdediner.example',
        rating: 4.5,
        reviewCount: 100,
      },
      {
        jobId,
        placeId: 'place-formula-injection',
        businessName: '=SUM(A1:A9)',
        phone: null,
        address: null,
        website: null,
        rating: null,
        reviewCount: null,
      },
      {
        jobId,
        placeId: 'place-no-website',
        businessName: 'Corner Cafe',
        phone: '416-555-0200',
        address: '2 Queen St Toronto ON',
        website: null,
        rating: 4.0,
        reviewCount: 20,
      },
    ])

    const csv = await buildJobLeadsCsv(jobId)

    expect(csv).toContain('business_name,phone,address,website,rating,review_count,notes,contacted')
    // Current businesses CRM state (notes/contacted), not leads' own (leads has no such columns).
    expect(csv).toContain('Maple Diner,416-555-0100,1 King St Toronto ON,https://mapdediner.example,4.5,100,Called - interested in a follow-up,yes')
    // Formula-injection fixture sanitized in the actual generated CSV, not only at the unit level.
    expect(csv).toContain("'=SUM(A1:A9)")
    expect(csv).not.toMatch(/[^']=SUM\(A1:A9\)/)
    // null website renders as the tier-1 messaging convention, never a raw empty cell.
    expect(csv).toContain('Corner Cafe,416-555-0200,2 Queen St Toronto ON,no website found on Google,4,20,,no')
  })
})
