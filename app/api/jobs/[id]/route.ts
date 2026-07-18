// Source: nextjs.org/docs/app/api-reference/functions/after (v16.2.10) +
// nextjs.org/docs/app/api-reference/file-conventions/route (v16.2.10)
import { after } from 'next/server'
import { z } from 'zod'
import { getJob, claimPartialJob, flagStaleJob } from '@/lib/db/jobs'
import { runScrapeJob } from '@/lib/jobs/runScrapeJob'

// Mirrors app/api/jobs/route.ts's segment config — this route can also
// schedule an after()-based continuation, so it needs the same duration
// budget lever.
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // A non-UUID path segment would otherwise reach Postgres's uuid cast and
  // throw a 500 — treat it as an address for a job that can't exist.
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }

  const job = await getJob(id)
  if (!job) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }

  // JOB-05: no-op unless truly stale (pending/running past WATCHDOG_MS).
  const staleFlagged = await flagStaleJob(id)
  let current = staleFlagged ?? job

  // JOB-04: only a 'partial' job (not touched by the watchdog above, which
  // only targets pending/running) is eligible for claim+continuation.
  if (current.status === 'partial') {
    const claimed = await claimPartialJob(id)
    if (claimed) {
      after(() => runScrapeJob(id))
      current = claimed
    }
    // If claimed is undefined, another poll already won the race — return
    // `current` (still 'partial' from this read) as-is; the winning poll's
    // own response already reflects 'running'.
  }

  // JOB-06: status + leadsFound together let a consumer distinguish a
  // genuine zero-result completion ({status:'done', leadsFound:0}) from a
  // real failure ({status:'error', errorReason:'...'}) — no new status
  // value, no worker change required.
  return Response.json({
    id: current.id,
    status: current.status,
    category: current.category,
    location: current.location,
    leadsFound: current.leadsFound,
    errorReason: current.errorReason,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    // cursor deliberately omitted — internal resumption detail.
  })
}
