import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { jobs } from '@/lib/db/schema'
import { createJob, listJobs } from '@/lib/db/jobs'

// Integration tests — run against the real, isolated test Neon database
// (vitest.config.ts injects TEST_DATABASE_URL as DATABASE_URL for the test
// process). Mirrors the PLACE_ID-style unique fixture + afterEach cleanup
// pattern from tests/integration/db/businesses.test.ts.

const CATEGORY = 'test-category-jobs-01-05'

async function cleanup() {
  await db.delete(jobs).where(eq(jobs.category, CATEGORY))
}

describe('listJobs (CRM-01..05)', () => {
  afterEach(cleanup)

  it('returns jobs ordered by createdAt descending, including a freshly-created job', async () => {
    const first = await createJob({ category: CATEGORY, location: 'Toronto, ON' })
    const second = await createJob({ category: CATEGORY, location: 'Lima, Peru' })

    const rows = await listJobs()
    const ids = rows.map((r) => r.id)

    expect(ids).toContain(first.id)
    expect(ids).toContain(second.id)

    const firstIndex = ids.indexOf(first.id)
    const secondIndex = ids.indexOf(second.id)
    // second was created after first, so it must sort earlier (descending).
    expect(secondIndex).toBeLessThan(firstIndex)
  })
})
