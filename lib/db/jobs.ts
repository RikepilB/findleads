import 'server-only'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { jobs, type jobStatusEnum } from '@/lib/db/schema'
import type { JobCursor } from '@/lib/jobs/checkpoint'
import { WATCHDOG_MS } from '@/lib/jobs/checkpoint'

export async function createJob({
  category,
  location,
}: {
  category: string
  location: string
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(jobs)
    .values({ category, location })
    .returning({ id: jobs.id })
  return row
}

export async function getJob(id: string) {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id))
  return row
}

export async function updateJobProgress(
  jobId: string,
  params: {
    status: (typeof jobStatusEnum.enumValues)[number]
    leadsFound: number
    cursor: JobCursor | null
    errorReason?: string | null
  },
): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: params.status,
      leadsFound: params.leadsFound,
      cursor: params.cursor,
      errorReason: params.errorReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId))
}

/**
 * Atomically claims a `partial` job for continuation (JOB-04). Returns the
 * claimed row if this call won the race (exactly one row affected), or
 * `undefined` if another concurrent call already claimed it (or the job
 * wasn't `partial`) — Postgres's own row-level locking serializes the race,
 * no application-level mutex needed.
 */
export async function claimPartialJob(jobId: string) {
  const [row] = await db
    .update(jobs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'partial')))
    .returning()
  return row
}

/**
 * Atomically flips a stale pending/running job to 'error' (JOB-05). Returns
 * the updated row if this call flagged it, or `undefined` if the job wasn't
 * stale (or wasn't pending/running).
 */
export async function flagStaleJob(jobId: string, now: () => number = Date.now) {
  const staleBefore = new Date(now() - WATCHDOG_MS)
  const [row] = await db
    .update(jobs)
    .set({
      status: 'error',
      errorReason: 'Job timed out — no progress for over 8 minutes',
      updatedAt: new Date(now()),
    })
    .where(
      and(
        eq(jobs.id, jobId),
        inArray(jobs.status, ['pending', 'running']),
        lt(jobs.updatedAt, staleBefore),
      ),
    )
    .returning()
  return row
}
