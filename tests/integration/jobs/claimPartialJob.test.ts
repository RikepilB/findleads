import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { jobs } from '@/lib/db/schema'
import { createJob, claimPartialJob, updateJobProgress } from '@/lib/db/jobs'
import { initialCursor } from '@/lib/jobs/checkpoint'

// Integration tests — real, isolated test Neon database (vitest.config.ts
// injects TEST_DATABASE_URL as DATABASE_URL for the test process). Proves
// Postgres's own row-level locking serializes the claim race, not
// application code (JOB-04).

describe('claimPartialJob — real test DB (JOB-04)', () => {
  let jobId: string | undefined

  afterEach(async () => {
    if (jobId) {
      await db.delete(jobs).where(eq(jobs.id, jobId))
      jobId = undefined
    }
  })

  it('exactly one of two concurrent claims on the same partial job succeeds', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Toronto, ON' })
    jobId = job.id
    await updateJobProgress(jobId, { status: 'partial', leadsFound: 5, cursor: initialCursor() })

    const [first, second] = await Promise.all([
      claimPartialJob(jobId),
      claimPartialJob(jobId),
    ])

    const claimedCount = [first, second].filter(Boolean).length
    expect(claimedCount).toBe(1)

    const updated = await db.select().from(jobs).where(eq(jobs.id, jobId))
    expect(updated[0]?.status).toBe('running')
  })

  it('does not affect a pending/running/done/error row', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Toronto, ON' })
    jobId = job.id
    await updateJobProgress(jobId, { status: 'running', leadsFound: 0, cursor: initialCursor() })

    const claimed = await claimPartialJob(jobId)
    expect(claimed).toBeUndefined()

    const updated = await db.select().from(jobs).where(eq(jobs.id, jobId))
    expect(updated[0]?.status).toBe('running')
  })
})
