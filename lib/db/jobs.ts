import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { jobs } from '@/lib/db/schema'

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
