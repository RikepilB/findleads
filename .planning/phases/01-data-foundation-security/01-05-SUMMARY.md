---
phase: 01-data-foundation-security
plan: 05
subsystem: database
tags: [drizzle-orm, neon, vitest, integration-testing, upsert, idempotency]

# Dependency graph
requires:
  - phase: 01-data-foundation-security (Plan 01-03)
    provides: "lib/db/schema.ts (jobs/leads/businesses tables), lib/db/client.ts (server-only neon-http Drizzle client), first migration applied to real dev + test Neon databases"
  - phase: 01-data-foundation-security (Plan 01-04)
    provides: "lib/db/jobs.ts (createJob, getJob), lib/db/businesses.ts (upsertBusiness), lib/db/leads.ts (insertLeadSnapshot)"
provides:
  - "tests/integration/db/businesses.test.ts — real Neon DB proof that upsertBusiness refreshes content but preserves notes/contacted/firstSeenAt (DATA-01), and that place content persists and is readable (DATA-03)"
  - "tests/integration/db/leads.test.ts — real Neon DB proof that insertLeadSnapshot is idempotent under worker retry, dedup is scoped to the exact (job, place) pair (not global), and leads/businesses join by placeId at query time (DATA-02)"
affects: [Phase 2 (Places client writes through this proven DAL), Phase 3 (job worker writes through this proven DAL), Phase 4 (CRM/export reads leads-businesses joins proven here)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Integration tests import db/schema directly for assertion queries and cleanup deletes, never mocking the database — vitest.config.ts already injects the real isolated TEST_DATABASE_URL"
    - "Per-test cleanup via afterEach delete-by-key (not global beforeAll/afterAll truncate) keeps the shared test database safe for concurrent/repeated runs"
    - "leads.jobId FK requires deleting leads rows before their parent jobs row in cleanup order"

key-files:
  created:
    - tests/integration/db/businesses.test.ts
    - tests/integration/db/leads.test.ts
  modified: []

key-decisions:
  - "Used a fixed, dedicated placeId per test file (test-place-businesses-01-05, test-place-leads-a/b) rather than randomly generated IDs, so a failed run's leftover rows are trivially identifiable and re-deletable by hand if cleanup itself fails."

requirements-completed: [DATA-01, DATA-02, DATA-03]

coverage:
  - id: D1
    description: "upsertBusiness persists all place content fields (name/phone/address/website/rating/reviewCount) durably and they are readable back via a direct select — DATA-03"
    requirement: DATA-03
    verification:
      - kind: integration
        ref: "tests/integration/db/businesses.test.ts#persists place content and is readable after upsert (DATA-03) — run against real Neon test database"
        status: pass
    human_judgment: false
  - id: D2
    description: "upsertBusiness refreshes content fields (businessName/phone) and advances lastSeenAt on a second sighting for the same placeId, while notes/contacted/firstSeenAt set outside upsertBusiness survive unchanged — proving the CRM-preserving upsert works end-to-end against real Postgres, not just by code inspection — DATA-01"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "tests/integration/db/businesses.test.ts#refreshes content but preserves notes/contacted/firstSeenAt across a re-sighting (DATA-01) — run against real Neon test database"
        status: pass
    human_judgment: false
  - id: D3
    description: "insertLeadSnapshot called twice with the identical (jobId, placeId) throws no error and leaves exactly one row — proving idempotency under a simulated worker retry"
    requirement: DATA-02
    verification:
      - kind: integration
        ref: "tests/integration/db/leads.test.ts#is idempotent under a simulated worker retry: no error, exactly one row — run against real Neon test database"
        status: pass
    human_judgment: false
  - id: D4
    description: "insertLeadSnapshot with a second distinct placeId under the same job coexists with the first — dedup is scoped to the exact (job, place) pair, not a global collapse across different places in the same job"
    requirement: DATA-02
    verification:
      - kind: integration
        ref: "tests/integration/db/leads.test.ts#scopes dedup to the exact (job, place) pair, not a global collapse — run against real Neon test database"
        status: pass
    human_judgment: false
  - id: D5
    description: "A leads-to-businesses join by placeId (no FK, shared value only) returns a combined row, proving leads and businesses can be joined for CRM display/export as DATA-02 requires"
    requirement: DATA-02
    verification:
      - kind: integration
        ref: "tests/integration/db/leads.test.ts#joins to businesses by placeId at query time for CRM display/export — run against real Neon test database"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-03
status: complete
---

# Phase 01 Plan 05: Integration Tests Against Real Neon Postgres Summary

**Real, re-runnable Vitest integration tests against the actual Neon test database proving the businesses/leads DAL's core behaviors — CRM-field-preserving upsert, durable content persistence, and idempotent per-job snapshot insert — closing out Phase 1's Walking Skeleton "real DB read/write round-trip" requirement.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-03T02:56:00Z (approx)
- **Completed:** 2026-07-03T02:59:30Z (approx)
- **Tasks:** 2
- **Files modified:** 2 created (tests/integration/db/businesses.test.ts, tests/integration/db/leads.test.ts)

## Accomplishments

- `tests/integration/db/businesses.test.ts`: two tests against the real Neon test database. Test 1 (DATA-03) inserts a full place payload via `upsertBusiness` and reads every content field back by direct `db.select()`. Test 2 (DATA-01) upserts once, directly writes `notes`/`contacted` via `db.update(businesses)` (simulating a future CRM Server Action), then re-upserts the same `placeId` with different content — asserting content fields refresh, `lastSeenAt` advances, and `notes`/`contacted`/`firstSeenAt` are untouched.
- `tests/integration/db/leads.test.ts`: three tests against the real Neon test database. Test 1 proves `insertLeadSnapshot` called twice with the identical `(jobId, placeId)` throws no error and leaves exactly one row (worker-retry idempotency). Test 2 proves dedup is scoped to the exact pair — a second distinct `placeId` under the same job coexists rather than being collapsed. Test 3 proves a `leads`-to-`businesses` join by `placeId` (no FK, shared value only) returns a combined row for CRM display/export.
- Both files were re-run twice in a row with no leftover-row interference, confirming per-test `afterEach` cleanup keeps the shared test database idempotent across repeated runs.
- Ran the full suite (`pnpm vitest run`) covering all of Phase 1 and Phase 2: 9 test files, 43 tests, all passing. `pnpm run typecheck` and `pnpm run lint` both clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: businesses.test.ts — upsert preserves CRM fields, persists content (DATA-01, DATA-03)** - `696ae25` (test)
2. **Task 2: leads.test.ts — idempotent per-job snapshot insert, businesses join (DATA-02)** - `a9ce29e` (test)

**Plan metadata:** per this plan's explicit instructions, this executor did not update STATE.md/ROADMAP.md — that update is deferred to the orchestrator.

## Files Created/Modified

- `tests/integration/db/businesses.test.ts` - two integration tests proving DATA-01 (CRM-field-preserving upsert) and DATA-03 (durable content persistence) against the real Neon test database
- `tests/integration/db/leads.test.ts` - three integration tests proving DATA-02 (idempotent per-job snapshot insert, pair-scoped dedup, leads-businesses join) against the real Neon test database

## Decisions Made

- Fixed, dedicated `placeId` values per test file (`test-place-businesses-01-05`, `test-place-leads-a`/`test-place-leads-b`) instead of randomly generated IDs, so any leftover row from a failed cleanup is trivially identifiable and hand-deletable rather than an opaque random string.

## Deviations from Plan

None - plan executed exactly as written. Both test files match the plan's `<behavior>` blocks task-for-task: businesses.test.ts's two tests and leads.test.ts's three tests are the exact scenarios specified, using the exact DAL functions (`upsertBusiness`, `insertLeadSnapshot`, `createJob`) and direct `db`/schema imports for assertions and cleanup.

## Issues Encountered

None. `.env.test`'s `TEST_DATABASE_URL` (already confirmed present and real per this plan's task briefing) worked on the first run — no connection issues, no schema mismatches (Plan 01-03's migration was already live on the test database).

## User Setup Required

None - `.env.test` was already populated with a real, isolated `TEST_DATABASE_URL` before this plan ran (confirmed in the task briefing: DATABASE_URL, TEST_DATABASE_URL, and PLACES_API_KEY all valid).

## Full Suite Verification (last plan in Phase 1)

Run at completion of this plan, covering Phase 1 + Phase 2 combined:

- `pnpm vitest run` — **9 test files, 43 tests, all passing** (includes this plan's 5 new integration tests plus all Phase 1 unit tests for `lib/env.ts` and all Phase 2 unit tests for the Places client/pagination/schema/locale/mapPlaceToLead).
- `pnpm run typecheck` — clean, no errors.
- `pnpm run lint` — clean, no errors.

## Next Phase Readiness

- DATA-01, DATA-02, and DATA-03 — this phase's core data-model success criteria — are now proven against a real Neon Postgres database via automated, re-runnable tests, not just code inspection. Phase 1's Walking Skeleton "real DB read/write round-trip" requirement is complete.
- This is the final plan in Phase 1 (Data Foundation & Security). All 5 phase requirements (DATA-01, DATA-02, DATA-03, SEC-01, SEC-02) have supporting evidence across Plans 01-01 through 01-05.
- Phase 2 (Places client, already built per the full-suite run above) and Phase 3 (job worker) can rely on this DAL as proven, not just typechecked — no further schema or DAL changes needed for `jobs`/`businesses`/`leads` beyond Phase 3's additive `leads_found`/`cursor`/`error_reason` columns (explicitly out of scope here, as documented in Plan 01-04's SUMMARY).

---
*Phase: 01-data-foundation-security*
*Completed: 2026-07-03*

## Self-Check: PASSED

Both created files confirmed on disk (tests/integration/db/businesses.test.ts, tests/integration/db/leads.test.ts). Both task commits (696ae25, a9ce29e) confirmed present in git log. Full test suite (9 files, 43 tests), typecheck, and lint all confirmed passing via direct command execution above.
