import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { jobs, type jobStatusEnum } from '@/lib/db/schema'
import type { JobCursor } from '@/lib/jobs/checkpoint'

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
