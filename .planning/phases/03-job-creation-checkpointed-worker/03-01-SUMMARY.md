---
phase: 03-job-creation-checkpointed-worker
plan: 01
subsystem: jobs-worker-substrate
tags: [drizzle-orm, neon, checkpoint, migrations, google-places]

# Dependency graph
requires:
  - phase: 01-data-foundation-security (Plan 01-03, 01-04)
    provides: "lib/db/schema.ts (jobs/leads/businesses tables), lib/db/client.ts, lib/db/jobs.ts (createJob/getJob), first migration applied to real dev+test Neon"
provides:
  - "lib/jobs/checkpoint.ts — JobCursor, initialCursor(), SAFETY_WINDOW_MS (250_000), MAX_PAGES (3)"
  - "lib/jobs/buildTextQuery.ts — buildTextQuery(category, location) composing Google's textQuery format"
  - "lib/db/schema.ts jobs table — leadsFound/cursor/errorReason columns (additive migration 0001)"
  - "lib/db/jobs.ts — updateJobProgress(jobId, params)"
affects: [Phase 3 Plan 03-02 (runScrapeJob checkpointed worker loop), Phase 3 Plan 03-03 (POST /api/jobs route + integration tests)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JobCursor shape { pageToken, pagesFetched, done } is the sole source of truth for pagination/resume state — no started_at column, elapsed time is a local per-invocation Date.now()"
    - "jsonb('cursor').$type<JobCursor>() — compile-time typing only, no additional Zod validation since cursor is only ever written by this codebase's own code"
    - "Additive migration (drizzle-kit generate, never hand-written SQL, never editing 0000_*.sql) applied to both dev and test Neon databases via the drizzle-kit CLI, which succeeded (exit 0) on this run unlike Plan 01-03's CLI-exit-1 quirk"

key-files:
  created:
    - lib/jobs/checkpoint.ts
    - lib/jobs/buildTextQuery.ts
    - tests/unit/lib/jobs/checkpoint.test.ts
    - tests/unit/lib/jobs/buildTextQuery.test.ts
    - drizzle/0001_tan_stepford_cuckoos.sql
    - drizzle/meta/0001_snapshot.json
  modified:
    - lib/db/schema.ts
    - lib/db/jobs.ts
    - drizzle/meta/_journal.json

key-decisions:
  - "Verified the additive migration applied to both dev and test Neon databases via a direct information_schema.columns query (not just trusting drizzle-kit's exit code) — matching Plan 01-03's own verification discipline."

requirements-completed: [JOB-02, JOB-03]

coverage:
  - id: T1
    description: "checkpoint.ts exports JobCursor/initialCursor/SAFETY_WINDOW_MS(250_000)/MAX_PAGES(3) exactly as named"
    requirement: JOB-02, JOB-03
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/unit/lib/jobs/checkpoint.test.ts"
        status: pass
      - kind: unit
        ref: "pnpm run typecheck"
        status: pass
    human_judgment: false
  - id: T2
    description: "buildTextQuery('restaurant', 'Toronto, ON') composes both terms into the documented 'X in Y' format; never returns category alone"
    requirement: JOB-02
    verification:
      - kind: unit
        ref: "pnpm vitest run tests/unit/lib/jobs/buildTextQuery.test.ts"
        status: pass
    human_judgment: false
  - id: T3
    description: "jobs table gains leads_found/cursor/error_reason via a new additive migration (0001), containing only ADD COLUMN statements, applied to both real dev and test Neon databases"
    requirement: JOB-02, JOB-03
    verification:
      - kind: other
        ref: "ls drizzle/0001_*.sql && ! grep -qi DROP drizzle/0001_*.sql"
        status: pass
      - kind: integration
        ref: "information_schema.columns query against both DATABASE_URL and TEST_DATABASE_URL confirming leads_found/cursor/error_reason present in both"
        status: pass
    human_judgment: false
  - id: T4
    description: "updateJobProgress(jobId, params) exported from lib/db/jobs.ts, typechecks against jobStatusEnum's values, sets status/leadsFound/cursor/errorReason/updatedAt scoped by eq(jobs.id, jobId)"
    requirement: JOB-02, JOB-03
    verification:
      - kind: unit
        ref: "pnpm run typecheck"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-07-03
status: complete
---

# Phase 3 Plan 01: Checkpoint Primitives + Jobs Schema/DAL Extension Summary

**JobCursor/SAFETY_WINDOW_MS/MAX_PAGES + buildTextQuery checkpoint primitives, and an additive Neon migration (leads_found/cursor/error_reason) plus updateJobProgress DAL function extending Phase 1's jobs table/DAL — the substrate the checkpointed worker (Plan 03-02) is written against.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-03T13:57Z
- **Completed:** 2026-07-03T14:01Z
- **Tasks:** 2
- **Files modified:** 4 created (checkpoint.ts, buildTextQuery.ts, checkpoint.test.ts, buildTextQuery.test.ts) + 1 new migration pair (0001 SQL + snapshot) + 2 modified (schema.ts, jobs.ts) + 1 modified (journal.json)

## Accomplishments

- **Task 1 (TDD):** Wrote failing unit tests for `checkpoint.ts` and `buildTextQuery.ts` first (RED — confirmed both test files failed with "Cannot find package" import errors), then implemented both modules to match exactly: `JobCursor` interface (`pageToken: string | null`, `pagesFetched: number`, `done: boolean`), `initialCursor()` returning `{ pageToken: null, pagesFetched: 0, done: false }`, `SAFETY_WINDOW_MS = 250_000`, `MAX_PAGES = 3` as named exported constants; `buildTextQuery(category, location)` returning `` `${category} in ${location}` ``. All 6 new unit tests pass (GREEN), full typecheck clean.
- **Task 2:** Extended `lib/db/schema.ts`'s existing `jobs` table (Phase 1, Plan 01-03) with three additive columns — `leadsFound: integer('leads_found').notNull().default(0)`, `cursor: jsonb('cursor').$type<JobCursor>()` (importing `JobCursor` from Task 1's `lib/jobs/checkpoint.ts`), `errorReason: text('error_reason')` (nullable). Ran `pnpm exec drizzle-kit generate` to produce a new migration file (`drizzle/0001_tan_stepford_cuckoos.sql`) — read the generated SQL before applying: it contains exactly three `ALTER TABLE "jobs" ADD COLUMN ...` statements, no `DROP`. Did not touch `drizzle/0000_lethal_whizzer.sql`. Applied the migration to the real dev Neon database (`DATABASE_URL`) via `drizzle-kit migrate` (succeeded, exit 0), then re-ran the same command with `DATABASE_URL` temporarily pointed at `TEST_DATABASE_URL` to apply it to the real test Neon database (also succeeded, exit 0). Independently verified both databases via a direct `information_schema.columns` query (disposable script, deleted immediately after) confirming `leads_found`/`cursor`/`error_reason` present in both DEV and TEST. Extended `lib/db/jobs.ts` with `updateJobProgress(jobId, params)`, setting `status`/`leadsFound`/`cursor`/`errorReason` (defaulting to `null`) and `updatedAt: new Date()`, scoped by `eq(jobs.id, jobId)`.
- Full test suite (`pnpm vitest run`, all 11 files including Phases 1-2's existing suite) passes: 49/49 tests green. `pnpm run typecheck` clean throughout.

## Task Commits

Each task was committed atomically (TDD gates for Task 1: RED then GREEN):

1. **Task 1 RED — failing tests for checkpoint.ts and buildTextQuery.ts** - `7f9efe2` (test)
2. **Task 1 GREEN — implement checkpoint.ts and buildTextQuery.ts** - `74d05ca` (feat)
3. **Task 2 — extend jobs schema (additive migration) + updateJobProgress** - `821db61` (feat)

**Plan metadata:** per this plan's explicit instructions, this executor did not update STATE.md/ROADMAP.md — deferred to the orchestrator.

## Files Created/Modified

- `lib/jobs/checkpoint.ts` - `JobCursor`, `initialCursor()`, `SAFETY_WINDOW_MS`, `MAX_PAGES`
- `lib/jobs/buildTextQuery.ts` - `buildTextQuery(category, location): string`
- `tests/unit/lib/jobs/checkpoint.test.ts`, `tests/unit/lib/jobs/buildTextQuery.test.ts` - unit tests, both green
- `lib/db/schema.ts` - `jobs` table gains `leadsFound`/`cursor`/`errorReason` (imports `JobCursor` from `lib/jobs/checkpoint`)
- `drizzle/0001_tan_stepford_cuckoos.sql`, `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json` - new additive migration, applied to both real dev and test Neon databases
- `lib/db/jobs.ts` - adds `updateJobProgress(jobId, params): Promise<void>`

## Decisions Made

- Verified the migration landed on both real databases via a direct `information_schema.columns` query rather than trusting `drizzle-kit migrate`'s exit code alone — same discipline Plan 01-03 established (its own CLI hit a Windows/non-TTY spinner quirk; this run's CLI invocation succeeded cleanly with exit 0 both times, but the independent DB-level check was still run for parity/confidence).

## Deviations from Plan

None — plan executed exactly as written. Both tasks match the plan's `<action>`/`<acceptance_criteria>` verbatim (exact constant values, exact migration discipline, exact `updateJobProgress` signature).

## Issues Encountered

None. Unlike Plan 01-03's `drizzle-kit migrate` CLI spinner exiting 1 on a successful migration (Windows/non-TTY shell quirk), both invocations in this plan (dev and test) completed with `[✓] migrations applied successfully!` and exit code 0.

## User Setup Required

None — `DATABASE_URL` (`.env`) and `TEST_DATABASE_URL` (`.env.test`) were already populated and confirmed present/valid before this plan ran.

## Next Phase Readiness

- `lib/jobs/checkpoint.ts` and `lib/jobs/buildTextQuery.ts` are the exact shapes Plan 03-02's `runScrapeJob` worker loop is written against — no renegotiation needed.
- `jobs.cursor`/`jobs.leadsFound`/`jobs.errorReason` are live on both real dev and test Neon databases, and `updateJobProgress` is a callable, typechecking DAL function — Plan 03-02 can persist checkpoint progress immediately.
- JOB-02 (checkpointed progress) and JOB-03 (safety-window cutoff) now have their full substrate in place: the cursor shape, the safety-window constant, and the DB column/write-path all exist and typecheck, exactly as this plan's objective required.

---
*Phase: 03-job-creation-checkpointed-worker*
*Completed: 2026-07-03*

## Self-Check: PASSED
