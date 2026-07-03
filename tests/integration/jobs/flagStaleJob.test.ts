import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { jobs } from '@/lib/db/schema'
import { createJob, flagStaleJob, updateJobProgress } from '@/lib/db/jobs'
import { initialCursor, WATCHDOG_MS } from '@/lib/jobs/checkpoint'

// Integration tests — real, isolated test Neon database. Never `sleep`s —
// staleness is proven by directly SQL-writing a fake `updated_at` before
// calling flagStaleJob (JOB-05).

describe('flagStaleJob — real test DB (JOB-05)', () => {
  let jobId: string | undefined

  afterEach(async () => {
    if (jobId) {
      await db.delete(jobs).where(eq(jobs.id, jobId))
      jobId = undefined
    }
  })

  it('flags a running job as error once updated_at is older than WATCHDOG_MS', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Lima' })
    jobId = job.id
    await updateJobProgress(jobId, { status: 'running', leadsFound: 0, cursor: initialCursor() })

    await db
      .update(jobs)
      .set({ updatedAt: new Date(Date.now() - WATCHDOG_MS - 1_000) })
      .where(eq(jobs.id, jobId))

    const flagged = await flagStaleJob(jobId)
    expect(flagged?.status).toBe('error')
    expect(flagged?.errorReason).toMatch(/timed out/i)
  })

  it('does not flag a running job whose updated_at is recent', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Lima' })
    jobId = job.id
    await updateJobProgress(jobId, { status: 'running', leadsFound: 0, cursor: initialCursor() })

    const flagged = await flagStaleJob(jobId)
    expect(flagged).toBeUndefined()

    const updated = await db.select().from(jobs).where(eq(jobs.id, jobId))
    expect(updated[0]?.status).toBe('running')
  })

  it('does not affect a partial or done row even when stale', async () => {
    const job = await createJob({ category: 'restaurant', location: 'Lima' })
    jobId = job.id
    await updateJobProgress(jobId, { status: 'partial', leadsFound: 2, cursor: initialCursor() })

    await db
      .update(jobs)
      .set({ updatedAt: new Date(Date.now() - WATCHDOG_MS - 1_000) })
      .where(eq(jobs.id, jobId))

    const flagged = await flagStaleJob(jobId)
    expect(flagged).toBeUndefined()

    const updated = await db.select().from(jobs).where(eq(jobs.id, jobId))
    expect(updated[0]?.status).toBe('partial')
  })
})
