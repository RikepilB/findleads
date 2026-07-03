// Source: nextjs.org/docs/app/api-reference/functions/after (v16.2.10) +
// nextjs.org/docs/app/api-reference/file-conventions/route (v16.2.10)
import { after } from 'next/server'
import { z } from 'zod'
import { createJob } from '@/lib/db/jobs'
import { runScrapeJob } from '@/lib/jobs/runScrapeJob'

// Explicit per Vercel's official duration-config pattern: Hobby's
// default/max is already 300s and this doesn't raise it, but it's the
// one-line lever for a future Pro upgrade and documents the intent
// explicitly rather than relying on an implicit platform default.
export const runtime = 'nodejs'
export const maxDuration = 300

// "validated against Toronto and Lima" (SCRAPE-01) refers to this phase's
// QA markets, not a runtime allowlist — PROJECT.md Constraints: "the
// location field itself is free-text, not a hardcoded enum." No market
// restriction belongs in this schema.
const createJobSchema = z.object({
  category: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = createJobSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { id } = await createJob(parsed.data)

  // Scheduled, NOT awaited — the response below returns before this runs.
  after(() => runScrapeJob(id))

  return Response.json({ jobId: id }, { status: 201 })
}
