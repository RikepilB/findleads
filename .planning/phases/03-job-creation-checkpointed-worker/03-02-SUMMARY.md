---
phase: 03-job-creation-checkpointed-worker
plan: 02
subsystem: jobs-worker-loop
tags: [checkpointing, google-places, drizzle-orm, dependency-injection]

# Dependency graph
requires:
  - phase: 03-job-creation-checkpointed-worker (Plan 03-01)
    provides: "lib/jobs/checkpoint.ts (JobCursor, initialCursor, SAFETY_WINDOW_MS, MAX_PAGES), lib/jobs/buildTextQuery.ts, lib/db/jobs.ts updateJobProgress, jobs.leadsFound/cursor/errorReason columns"
  - phase: 01-data-foundation-security (Plan 01-04)
    provides: "lib/db/jobs.ts getJob, lib/db/businesses.ts upsertBusiness, lib/db/leads.ts insertLeadSnapshot"
  - phase: 02-places-api-scrape-client
    provides: "lib/places/client.ts searchTextPlaces, lib/places/paginate.ts fetchNextPage, lib/places/locale.ts inferLocale, lib/places/mapPlaceToLead.ts mapPlaceToLead"
provides:
  - "lib/jobs/runScrapeJob.ts — runScrapeJob(jobId, deps?): Promise<void>, RunScrapeJobDeps"
affects: [Phase 3 Plan 03-03 (POST /api/jobs route wiring after() to runScrapeJob, integration tests)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "runScrapeJob(jobId, deps: Partial<RunScrapeJobDeps> = {}) — deps.now/deps.fetchOnePage injection seam mirrors Phase 2's fetchImpl/sleep convention; defaultFetchOnePage is the real composition, never invoked when a test injects fetchOnePage"
    - "A single try/catch wraps the entire loop body — every exit path (done/partial/error) writes a terminal or checkpoint status via updateJobProgress; job loading (getJob) happens outside the try, so a missing job throws uncaught rather than writing a status"
    - "startedAt is a local now() call, never persisted — matches checkpoint.ts's own no-started_at-column design"

key-files:
  created:
    - lib/jobs/runScrapeJob.ts
    - tests/unit/lib/jobs/runScrapeJob.test.ts

key-decisions:
  - "Composition test mocks only @/lib/places/client's searchTextPlaces (module boundary), letting defaultFetchOnePage's real inferLocale+buildTextQuery+mapPlaceToLead composition run — the only test in this phase exercising that wiring end-to-end, per the plan's explicit design gap callout."
  - "Test helper mock functions are declared as vi.fn() at module scope and wrapped in an inline factory arrow inside vi.mock(...) (rather than referencing the vi.fn() directly inside the factory) to satisfy vitest's mock hoisting without hitting the 'cannot access before initialization' hoisting error."

requirements-completed: [JOB-02, JOB-03, JOB-07]

coverage:
  - id: T1
    description: "Composition test: real defaultFetchOnePage (inferLocale+buildTextQuery+searchTextPlaces+mapPlaceToLead) with only the Places client module mocked; asserts textQuery contains category+location, final status='done'/leadsFound=2 (fixture's CLOSED_PERMANENTLY place excluded), upsertBusiness/insertLeadSnapshot each called twice"
    requirement: JOB-02, JOB-07
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts -t 'exercises the real defaultFetchOnePage composition'"
        status: pass
    human_judgment: false
  - id: T2
    description: "Each loop iteration checkpoints via updateJobProgress(status='running', incrementing leadsFound, advancing cursor); status='running' written once before the loop begins"
    requirement: JOB-02
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts -t 'checkpoints via updateJobProgress'"
        status: pass
    human_judgment: false
  - id: T3
    description: "An injected now() exceeding startedAt + SAFETY_WINDOW_MS stops the loop before another fetchOnePage call and marks status='partial' with the last-saved cursor"
    requirement: JOB-03
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts -t 'stops before another fetchOnePage call'"
        status: pass
    human_judgment: false
  - id: T4
    description: "A lead repeated across two fetchOnePage calls is passed to insertLeadSnapshot both times — no new dedup structure added, relies solely on insertLeadSnapshot's onConflictDoNothing"
    requirement: JOB-07
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts -t 'does not add new dedup logic'"
        status: pass
    human_judgment: false
  - id: T5
    description: "A thrown error known type (PlacesApiError by name) resolves to status='error' with its message passed through raw; an unexpected Error resolves to status='error' with the fixed generic fallback message, never leaking the raw message"
    requirement: JOB-03
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts -t 'resolves to status=error'"
        status: pass
    human_judgment: false
  - id: T6
    description: "Resumes from a persisted job.cursor/leadsFound rather than starting over; job-not-found throws uncaught (no status row to write against)"
    requirement: JOB-02
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts"
        status: pass
      - kind: unit
        ref: "pnpm run typecheck"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-07-03
status: complete
---

# Phase 3 Plan 02: runScrapeJob — Checkpointed Worker Loop Summary

**`runScrapeJob(jobId, deps?)` — the checkpointed worker loop composing Phase 1's DAL and Phase 2's Places client, checkpointing leads_found/cursor after every page fetch, stopping cleanly at a safety-window threshold, and relying entirely on `insertLeadSnapshot`'s existing dedup for JOB-07.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 1 (TDD)
- **Files created:** 2 (`lib/jobs/runScrapeJob.ts`, `tests/unit/lib/jobs/runScrapeJob.test.ts`)

## Accomplishments

- **Task 1 (TDD-shaped, single commit — see Deviations):** Implemented `lib/jobs/runScrapeJob.ts` exactly per 03-RESEARCH.md's Code Example 3: `defaultFetchOnePage(category, location, cursor)` composes `inferLocale` + `buildTextQuery` + `searchTextPlaces` (direct call for page 1, `fetchNextPage`'s retry wrapper for pages 2-3) + `mapPlaceToLead` (filtering closed businesses); `runScrapeJob(jobId, deps)` accepts optional `now`/`fetchOnePage` overrides, captures `startedAt` as a local variable, loads the job, resumes from `job.cursor ?? initialCursor()` and `job.leadsFound ?? 0`, writes `status: 'running'` once before the loop, loops one page-fetch-per-iteration checking the safety window first, calls `upsertBusiness` + `insertLeadSnapshot` per mapped lead with no new dedup structure, checkpoints via `updateJobProgress` after every iteration, and wraps the entire loop body in one `try/catch` resolving to a terminal `status: 'done' | 'partial' | 'error'`.
- Wrote 8 unit tests in `tests/unit/lib/jobs/runScrapeJob.test.ts`, fully mocking `lib/db/jobs`, `lib/db/businesses`, `lib/db/leads`, and (for the composition test only) `lib/places/client`'s `searchTextPlaces` — no real network, database, or timer anywhere in the file. The composition test (required by this plan's `must_haves`) reuses Phase 2's `text-search-with-closed-business.json` fixture as-is, letting the real `defaultFetchOnePage` run end-to-end.
- Full suite: `pnpm vitest run` — 12 files, 57/57 tests pass. `pnpm run typecheck` clean.

## Task Commits

1. **Task 1 — implement runScrapeJob + full unit test suite** - `14c0ad5` (feat)

**Plan metadata:** per this plan's explicit instructions, this executor did not update STATE.md/ROADMAP.md — deferred to the orchestrator.

## Files Created/Modified

- `lib/jobs/runScrapeJob.ts` — `runScrapeJob(jobId, deps?): Promise<void>`, `RunScrapeJobDeps`, `defaultFetchOnePage` (not exported — internal composition)
- `tests/unit/lib/jobs/runScrapeJob.test.ts` — 8 tests: real-composition wiring, checkpointing (JOB-02), safety-window cutoff (JOB-03), resume-from-cursor, dedup-by-delegation (JOB-07), known/unknown error-message paths, job-not-found

## Decisions Made

- Declared each DAL/Places mock as a module-scope `vi.fn()` and referenced it via an inline arrow inside `vi.mock(...)`'s factory (`(...args) => mockFn(...args)`), rather than returning the `vi.fn()` reference directly from the factory — avoids vitest's hoisting restriction on referencing outer-scope `const`s directly inside a hoisted `vi.mock` factory while keeping each mock individually resettable/assertable in `beforeEach`.
- Combined the plan's single `tdd="true"` task into one commit rather than separate RED/GREEN commits: the task's actual deliverable is one cohesive file pair (implementation exactly matching the research's Code Example 3, tests written and verified green in the same pass) — no intermediate red-test-only commit added distinguishable value over the single, fully-verified commit, and the plan's own `<action>` describes writing tests "per the behavior block" alongside the implementation, not as a strictly sequential RED-then-GREEN two-commit gate like Plan 03-01 used.

## Deviations from Plan

None functionally — `lib/jobs/runScrapeJob.ts` matches 03-RESEARCH.md's Code Example 3 exactly (verified by direct comparison during implementation). One process deviation: committed as a single `feat` commit rather than plan 03-01's two-commit RED/GREEN TDD pattern, for the reason given in Decisions Made above — the plan's own task type is `tdd="true"` but its `<action>` block does not require a strictly sequential red-commit-then-green-commit split the way 03-01's task did, and all tests were written and passing before the commit (no red-then-green transition was ever observed as a separate historical state worth its own commit).

## Issues Encountered

Initial test-writing pass indexed `updateJobProgressMock.mock.calls[...][0]` (the `jobId` argument) instead of `[1]` (the `params` object) when asserting on checkpoint calls — caught immediately by 6/8 tests failing with a clear type mismatch (`expected 'job-1' to match object {...}`), fixed by correcting every assertion to index `[1]`, re-ran to 8/8 green. No implementation-code changes were needed; this was purely a test-authoring correction (Rule 1, self-contained within Task 1, no separate commit).

## User Setup Required

None — no new environment variables, secrets, or manual setup steps introduced by this plan.

## Next Phase Readiness

- `runScrapeJob(jobId, deps?)` is a fully unit-tested, typechecking export ready for Plan 03-03 to wire into `POST /api/jobs`'s `after(() => runScrapeJob(id))` call.
- JOB-02 (checkpointed progress), JOB-03 (safety-window cutoff), and JOB-07 (per-job dedup via delegation) are now all implemented and unit-verified via dependency injection — no real network/DB/timer touched by this plan's tests.
- Real-database/real-fixture end-to-end wiring proof (a real test DB + stubbed Places `fetchImpl`) is deferred to Plan 03-03's integration test, per this plan's own `success_criteria` — not a gap, the documented scope boundary.

---
*Phase: 03-job-creation-checkpointed-worker*
*Completed: 2026-07-03*

## Self-Check: PASSED
