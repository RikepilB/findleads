import { z } from 'zod'
import { getJob } from '@/lib/db/jobs'
import { buildJobLeadsCsv } from '@/lib/csv/export'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Mirrors app/api/jobs/[id]/route.ts — a non-UUID segment must 404, not
  // bubble a Postgres uuid-cast error as a 500.
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }

  const job = await getJob(id)
  if (!job) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }
  if (job.status !== 'done') {
    return Response.json(
      { error: 'Job is not complete yet', status: job.status },
      { status: 409 },
    )
  }

  const csv = await buildJobLeadsCsv(id)
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="job-${id}-leads.csv"`,
    },
  })
}
