// Composes Phase 1's DAL (lib/db/{jobs,businesses,leads}.ts) and Phase 2's
// Places client (lib/places/* — built, verified, unchanged here). This is
// the checkpointed worker loop itself (JOB-02, JOB-03, JOB-07) — see
// 03-RESEARCH.md Code Example 3 / Pitfalls 1, 2, 4.
import 'server-only'
import { getJob, updateJobProgress } from '@/lib/db/jobs'
import { upsertBusiness } from '@/lib/db/businesses'
import { insertLeadSnapshot } from '@/lib/db/leads'
import { searchTextPlaces } from '@/lib/places/client'
import { fetchNextPage } from '@/lib/places/paginate'
import { mapPlaceToLead, type MappedLead } from '@/lib/places/mapPlaceToLead'
import { inferLocale } from '@/lib/places/locale'
import { buildTextQuery } from './buildTextQuery'
import { SAFETY_WINDOW_MS, MAX_PAGES, initialCursor, type JobCursor } from './checkpoint'

interface FetchOnePageResult {
  mapped: MappedLead[]
  nextCursor: JobCursor
}

async function defaultFetchOnePage(
  category: string,
  location: string,
  cursor: JobCursor,
): Promise<FetchOnePageResult> {
  const { languageCode, regionCode } = inferLocale(location)
  const textQuery = buildTextQuery(category, location)
  const doFetch = () =>
    searchTextPlaces({
      textQuery,
      languageCode,
      regionCode,
      ...(cursor.pageToken ? { pageToken: cursor.pageToken } : {}),
    })

  // Page 1 has no token — fetch directly. Pages 2-3 go through Phase 2's
  // retry/backoff wrapper (SCRAPE-06), unchanged.
  const response = cursor.pageToken ? await fetchNextPage(doFetch) : await doFetch()

  const pagesFetched = cursor.pagesFetched + 1
  // SCRAPE-07 (Pitfall 1 Option B): computed from the RAW response — page
  // count and nextPageToken — before mapPlaceToLead's closed-business filter
  // runs below. This is the only point the worker can distinguish "genuinely
  // exhausted the cap" from "closed-business filtering happened to drop
  // leadsFound below 60"; once true it stays true for the rest of the run.
  const capHit = pagesFetched >= MAX_PAGES && Boolean(response.nextPageToken)
  const hasMore = Boolean(response.nextPageToken) && pagesFetched < MAX_PAGES

  const mapped = response.places
    .map(mapPlaceToLead)
    .filter((lead): lead is MappedLead => lead !== null)

  return {
    mapped,
    nextCursor: {
      pageToken: hasMore ? (response.nextPageToken ?? null) : null,
      pagesFetched,
      done: !hasMore,
      capHit: cursor.capHit || capHit,
    },
  }
}

export interface RunScrapeJobDeps {
  now: () => number
  fetchOnePage: (
    category: string,
    location: string,
    cursor: JobCursor,
  ) => Promise<FetchOnePageResult>
}

export async function runScrapeJob(
  jobId: string,
  deps: Partial<RunScrapeJobDeps> = {},
): Promise<void> {
  const now = deps.now ?? (() => Date.now())
  const fetchOnePage = deps.fetchOnePage ?? defaultFetchOnePage

  // Local, per-invocation clock — see Pitfall 4. Never persisted or read
  // from the DB; a resumed (Phase 4) job gets its own fresh budget.
  const startedAt = now()

  const job = await getJob(jobId)
  if (!job) throw new Error(`runScrapeJob: job ${jobId} not found`)

  let cursor: JobCursor = job.cursor ?? initialCursor()
  let leadsFound = job.leadsFound ?? 0

  try {
    // Write 'running' before any Places call — an invocation killed mid-
    // page-1 (before the first post-unit checkpoint) would otherwise leave
    // the row at 'pending' with no error (Pitfall 1).
    await updateJobProgress(jobId, { status: 'running', leadsFound, cursor })

    while (!cursor.done) {
      if (now() - startedAt > SAFETY_WINDOW_MS) {
        // Stop cleanly, before another page fetch — JOB-03. Actual
        // resumption is Phase 4's GET /api/jobs/:id continuation guard.
        await updateJobProgress(jobId, { status: 'partial', leadsFound, cursor })
        return
      }

      const { mapped, nextCursor } = await fetchOnePage(job.category, job.location, cursor)

      // JOB-07: insertLeadSnapshot already dedupes on (jobId, placeId) via
      // onConflictDoNothing (Phase 1 DAL) — no dedup logic added here.
      for (const lead of mapped) {
        await upsertBusiness(lead)
        await insertLeadSnapshot(jobId, lead)
      }

      leadsFound += mapped.length
      cursor = nextCursor

      // JOB-02: checkpoint after every unit of work.
      await updateJobProgress(jobId, { status: 'running', leadsFound, cursor })
    }

    await updateJobProgress(jobId, {
      status: 'done',
      leadsFound,
      cursor: null,
      resultCapHit: cursor.capHit,
    })
  } catch (err) {
    // See Pitfall 1: this is the only place an error inside after() can be
    // surfaced at all — no HTTP response exists to attach it to.
    await updateJobProgress(jobId, {
      status: 'error',
      leadsFound,
      cursor,
      // See Pitfall 2: only known-safe error messages pass through raw.
      errorReason:
        err instanceof Error && (err.name === 'PlacesApiError' || err.name === 'ZodError')
          ? err.message
          : 'Unexpected worker error',
    })
  }
}
