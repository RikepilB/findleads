---
phase: 03-job-creation-checkpointed-worker
plan: 03
subsystem: api
tags: [nextjs-after, zod, route-handler, drizzle-orm, neon-integration-test]

# Dependency graph
requires:
  - phase: 03-job-creation-checkpointed-worker (Plan 03-01)
    provides: "lib/jobs/checkpoint.ts (JobCursor, initialCursor), lib/db/jobs.ts updateJobProgress, jobs.leadsFound/cursor/errorReason columns"
  - phase: 03-job-creation-checkpointed-worker (Plan 03-02)
    provides: "lib/jobs/runScrapeJob.ts runScrapeJob(jobId, deps?)"
  - phase: 01-data-foundation-security (Plan 01-04)
    provides: "lib/db/jobs.ts createJob/getJob, lib/db/businesses.ts upsertBusiness, lib/db/leads.ts insertLeadSnapshot"
  - phase: 02-places-api-scrape-client
    provides: "lib/places/mapPlaceToLead.ts mapPlaceToLead, tests/fixtures/places/text-search-toronto-page1.json"
provides:
  - "app/api/jobs/route.ts — POST(request): Promise<Response>, the phase's only Route Handler"
  - "tests/integration/jobs/runScrapeJob.test.ts — real-DB, real-mapPlaceToLead proof of the full pipeline including JOB-07 dedup-on-retry"
affects: [Phase 4 (GET /api/jobs/:id polling, resume-from-partial), Phase 5 (job-creation UI form calling this POST endpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route Handler validates with Zod, calls the DAL, schedules the worker via after() (not awaited), returns before the worker runs — response latency independent of scrape duration"
    - "Integration tests import a Phase 2 JSON fixture directly and route it through the real mapPlaceToLead before injecting it as runScrapeJob's fetchOnePage stub, proving the mapping function itself (not just the DB writes) against real data shape"

key-files:
  created:
    - app/api/jobs/route.ts
    - tests/unit/app/api/jobs/route.test.ts
    - tests/integration/jobs/runScrapeJob.test.ts

key-decisions:
  - "Unit test mocks createJob/runScrapeJob/next/server's after as inline vi.fn() wrappers (module-scope const referenced via an inline arrow inside vi.mock's factory) — same hoisting-safe pattern Plan 03-02 established, kept consistent rather than reaching for vi.mock's direct-reference form."
  - "Integration test's second (JOB-07) case reuses the exact same createJob-created jobId and stub across two full runScrapeJob invocations, rather than manually inserting a leads row — this exercises the real cursor-reset-on-retry path (job.cursor is null after a done run, so the second call re-enters the loop via initialCursor()) and still asserts zero duplicate rows, a stronger proof than a single insertLeadSnapshot-only retry check."

requirements-completed: [SCRAPE-01, JOB-01, JOB-07]

coverage:
  - id: D1
    description: "POST /api/jobs with a valid category+location body creates a pending job, schedules runScrapeJob via after() (not invoked synchronously), and returns 201 {jobId}"
    requirement: "SCRAPE-01"
    verification:
      - kind: unit
        ref: "tests/unit/app/api/jobs/route.test.ts#returns jobId immediately and schedules the worker via after() without awaiting it"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /api/jobs with an invalid body (empty category) returns 400 with Zod issues, without creating a job or scheduling the worker"
    requirement: "JOB-01"
    verification:
      - kind: unit
        ref: "tests/unit/app/api/jobs/route.test.ts#returns 400 without creating a job or scheduling the worker when the body is invalid"
        status: pass
    human_judgment: false
  - id: D3
    description: "A full runScrapeJob run against the real test DB and Phase 2's Toronto fixture (routed through the real mapPlaceToLead) produces done status, correct leadsFound, null cursor, and matching leads/businesses rows"
    requirement: "JOB-01"
    verification:
      - kind: integration
        ref: "tests/integration/jobs/runScrapeJob.test.ts#produces correct leads/businesses rows and a done status from a real fetchOnePage stub"
        status: pass
    human_judgment: false
  - id: D4
    description: "A repeated runScrapeJob call for the same jobId with the same stub does not duplicate leads rows (JOB-07 dedup on retry)"
    requirement: "JOB-07"
    verification:
      - kind: integration
        ref: "tests/integration/jobs/runScrapeJob.test.ts#does not duplicate leads rows on a repeated call for the same job (JOB-07)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-03
status: complete
---

# Phase 3 Plan 03: POST /api/jobs + Real-DB Pipeline Proof Summary

**`app/api/jobs/route.ts` POST handler (Zod-validated, `after()`-scheduled) wired to `runScrapeJob`, proven end-to-end against a real Neon test database including a JOB-07 dedup-on-retry case — completing Phase 3's vertical slice.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-03T18:07:45Z (previous commit) — first task commit 2026-07-03T18:12:14Z
- **Completed:** 2026-07-03T18:13:21Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments

- **Task 1:** Created `app/api/jobs/route.ts` exactly per 03-RESEARCH.md Code Example 1 — `createJobSchema` (trim, 1-200 char bounds, no market allowlist per PROJECT.md's free-text-location constraint), `export const runtime = 'nodejs'` / `maxDuration = 300`, `POST(request)` validates, calls `createJob`, schedules `after(() => runScrapeJob(id))` (not awaited), returns `201 { jobId }`. Unit test (`tests/unit/app/api/jobs/route.test.ts`, 2 tests) mocks `next/server`'s `after`, `createJob`, and `runScrapeJob`; proves `runScrapeJob` is never invoked synchronously during the request, `after` is called exactly once, and invoking the captured callback separately calls `runScrapeJob(jobId)`; second test proves invalid bodies (empty `category`) return `400` with Zod issues and never call `createJob`/`after`.
- **Task 2:** Created `tests/integration/jobs/runScrapeJob.test.ts` (2 tests) against the real `TEST_DATABASE_URL` Neon database. Test 1 creates a real job via `createJob`, injects a `fetchOnePage` stub that wraps Phase 2's existing `text-search-toronto-page1.json` fixture (4 `OPERATIONAL` places) routed through the real `mapPlaceToLead`, and asserts `getJob(jobId)` returns `status: 'done'`, `leadsFound: 4`, `cursor: null`, with matching `leads`/`businesses` rows by `placeId`. Test 2 calls `runScrapeJob` a second time for the same `jobId` with the same stub (simulating a retried invocation) and asserts the `leads` row count stays at 4 — proving JOB-07 dedup via `insertLeadSnapshot`'s existing `onConflictDoNothing` end-to-end, with no new dedup logic added.
- Full suite: `pnpm test -- --run` — 14 files, 61 tests, all green. `pnpm run typecheck` and `pnpm lint` both clean.

## Task Commits

1. **Task 1: POST /api/jobs route handler (SCRAPE-01, JOB-01)** - `bf9f887` (feat)
2. **Task 2: Integration proof — real test DB + Phase 2 fixtures (JOB-02/03/07 wiring)** - `225e1fb` (test)

**Plan metadata:** per this plan's explicit instructions, this executor did not update STATE.md/ROADMAP.md — deferred to the orchestrator.

## Files Created/Modified

- `app/api/jobs/route.ts` - `POST(request): Promise<Response>` — Zod-validates, creates job, schedules `runScrapeJob` via `after()`, returns `201 { jobId }`
- `tests/unit/app/api/jobs/route.test.ts` - 2 tests: happy-path (`after`-scheduled, not synchronous) and invalid-body 400 path
- `tests/integration/jobs/runScrapeJob.test.ts` - 2 tests: real-DB wiring proof and JOB-07 dedup-on-retry proof, both against the real Neon test database and Phase 2's Toronto fixture

## Decisions Made

- Reused the exact `vi.mock` hoisting-safe pattern from Plan 03-02 (module-scope `vi.fn()` referenced via an inline arrow inside the factory) for consistency across the codebase's test files.
- The JOB-07 integration test drives two full `runScrapeJob` invocations for the same job rather than a manual duplicate-insert check — this exercises the real post-`done` cursor-reset path (`job.cursor` is `null` after completion, so a retry re-enters via `initialCursor()`), a stronger end-to-end proof than isolating `insertLeadSnapshot` alone.

## Deviations from Plan

None — plan executed exactly as written. Both tasks match 03-RESEARCH.md's Code Examples 1 and 7 and the plan's `<behavior>`/`<action>` blocks; no Rule 1-4 auto-fixes were needed.

## Issues Encountered

None.

## User Setup Required

None — no new environment variables, secrets, or manual setup steps introduced by this plan. `DATABASE_URL`, `TEST_DATABASE_URL`, and `PLACES_API_KEY` were already confirmed present and valid before this plan started.

## Next Phase Readiness

- `POST /api/jobs` is live, tested, and satisfies SCRAPE-01/JOB-01 end-to-end.
- Phase 3's vertical slice is complete: submit a job via `POST /api/jobs` → a real, checkpointed, resumable scrape job runs via `runScrapeJob` → real `leads`/`businesses` rows land in Postgres, proven against a real Neon test database (not just mocked internals).
- Phase 4 can now build `GET /api/jobs/:id` (polling + partial-job resume) directly on top of this plan's `POST` handler and the existing `getJob`/`cursor` shape — no new interfaces needed from this plan.
- Phase 5's job-creation UI form has a stable `POST /api/jobs` contract (`{ category, location }` → `201 { jobId }` / `400 { error, issues }`) to build against.

---
*Phase: 03-job-creation-checkpointed-worker*
*Completed: 2026-07-03*

## Self-Check: PASSED
