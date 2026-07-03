---
phase: 05-crm-leads-dashboard
plan: 01
subsystem: database
tags: [drizzle, postgres, dal, scrape-07, jobs, businesses]

requires:
  - phase: 03-job-creation-checkpointed-worker
    provides: "lib/jobs/checkpoint.ts JobCursor/MAX_PAGES, lib/jobs/runScrapeJob.ts checkpointed worker loop, lib/db/jobs.ts updateJobProgress"
  - phase: 01-data-foundation-security
    provides: "lib/db/schema.ts jobs/businesses tables, lib/db/businesses.ts upsertBusiness idiom"
provides:
  - "lib/db/businesses.ts: listBusinesses, updateBusinessNotes, setBusinessContacted"
  - "lib/db/jobs.ts: listJobs; updateJobProgress accepts optional resultCapHit"
  - "lib/db/schema.ts: jobs.resultCapHit boolean column (additive migration 0002)"
  - "lib/jobs/checkpoint.ts: JobCursor.capHit field"
  - "lib/jobs/runScrapeJob.ts: computes capHit from raw pagination signal before closed-business filtering, persists on final done write"
affects: [05-03 (Leads page Server Actions — consumes listBusinesses/updateBusinessNotes/setBusinessContacted), 05-04 (Job History page — consumes listJobs/resultCapHit)]

tech-stack:
  added: []
  patterns:
    - "DAL mutation functions always set updatedAt: new Date() in the same .set() call as the mutated field — Drizzle does not auto-bump .defaultNow() columns on UPDATE, only INSERT"
    - "Pagination-cap signal computed from raw response.places.length/nextPageToken BEFORE any downstream filter (mapPlaceToLead) can hide it, then carried forward monotonically through checkpoints via cursor.capHit || newCapHit"

key-files:
  created:
    - tests/integration/db/jobs.test.ts
    - drizzle/0002_cute_maddog.sql
  modified:
    - lib/db/businesses.ts
    - lib/db/jobs.ts
    - lib/db/schema.ts
    - lib/jobs/checkpoint.ts
    - lib/jobs/runScrapeJob.ts
    - tests/integration/db/businesses.test.ts
    - tests/unit/lib/jobs/runScrapeJob.test.ts
    - tests/unit/lib/jobs/checkpoint.test.ts
    - tests/integration/jobs/runScrapeJob.test.ts

key-decisions:
  - "capHit computed as pagesFetched >= MAX_PAGES && Boolean(response.nextPageToken), read from the raw response before the mapPlaceToLead .filter() runs — exactly research Pitfall 1 Option B, not the naive post-filter leadsFound>=60 heuristic"
  - "resultCapHit is optional on updateJobProgress's params and only included in .set() when explicitly passed (via a conditional spread) — the two non-final 'running'/'partial' checkpoint calls and the 'error' call are unaffected, schema default (false) covers the very first row"
  - "Applied the new migration (0002_cute_maddog.sql) to both the real dev and test Neon databases via drizzle-orm's programmatic migrate() through a throwaway script, deleted immediately after use — drizzle-kit migrate's CLI spinner exits 1 on this Windows/non-TTY shell despite succeeding (same documented workaround as 01-03-SUMMARY.md)"

patterns-established:
  - "Additive jobs/businesses columns always paired with a grep-verifiable updatedAt discipline and an integration test against the real test DB, never a unit-mock-only assertion"

requirements-completed: []  # NOT [CRM-01..05, SCRAPE-07] despite this plan's own frontmatter listing them.
# This plan is backend-only plumbing (its own objective text: "no direct UI"). The requirement
# TEXT is UI-facing ("Leads list view...", "UI surfaces explicit messaging...") and is actually
# owned/completed by 05-03 (requirements: [CRM-01..04]) and 05-04 (requirements: [CRM-05,
# SCRAPE-07]) per their own frontmatter and this ROADMAP. Marking these complete here would
# false-positive verify-work's auto-pass on DAL/worker tests alone. See Deviations section.

coverage:
  - id: D1
    description: "listBusinesses/updateBusinessNotes/setBusinessContacted (businesses.ts) and listJobs (jobs.ts) exist, are used by real-DB integration tests, and every mutation visibly bumps updatedAt"
    verification:
      - kind: integration
        ref: "tests/integration/db/businesses.test.ts#listBusinesses/updateBusinessNotes/setBusinessContacted (CRM-01..05)"
        status: pass
      - kind: integration
        ref: "tests/integration/db/jobs.test.ts#listJobs (CRM-01..05)"
        status: pass
    human_judgment: false
  - id: D2
    description: "jobs.resultCapHit is additive, migrated, and set to true on completion whenever a job genuinely exhausts the 3-page/60-result cap, independent of closed-business filtering reducing leadsFound"
    verification:
      - kind: unit
        ref: "tests/unit/lib/jobs/runScrapeJob.test.ts#flags resultCapHit=true on the final done write when the cap-genuinely-hit page also happens to contain a closed business (SCRAPE-07, Pitfall 1 Option B)"
        status: pass
      - kind: unit
        ref: "tests/unit/lib/jobs/runScrapeJob.test.ts#flags resultCapHit=false when pagination ends naturally (no nextPageToken) even at MAX_PAGES"
        status: pass
      - kind: unit
        ref: "tests/unit/lib/jobs/runScrapeJob.test.ts#preserves capHit=true across checkpoints once set, even after cursor is nulled on the final write"
        status: pass
      - kind: unit
        ref: "tests/unit/lib/jobs/checkpoint.test.ts#initialCursor returns the starting cursor shape"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-07-03
status: complete
---

# Phase 5 Plan 1: DAL Plumbing + SCRAPE-07 resultCapHit Fix Summary

**Added listBusinesses/updateBusinessNotes/setBusinessContacted (businesses.ts) and listJobs (jobs.ts), plus an additive `jobs.resultCapHit` boolean column computed in the worker from raw pagination signal (`pagesFetched >= MAX_PAGES && nextPageToken` truthy) before closed-business filtering can erase it — closing the SCRAPE-07 false-negative.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-03T19:44:00Z
- **Completed:** 2026-07-03T19:58:51Z
- **Tasks:** 2
- **Files modified:** 11 (2 created, 9 modified)

## Accomplishments
- `lib/db/businesses.ts`: `listBusinesses()` (ordered by `updatedAt` desc), `updateBusinessNotes(id, notes)` and `setBusinessContacted(id, contacted)` — both set only their target field plus `updatedAt: new Date()` in the same `.set()` call, mirroring `upsertBusiness`'s existing discipline (Drizzle does not auto-bump `.defaultNow()` columns on UPDATE)
- `lib/db/jobs.ts`: `listJobs()` (ordered by `createdAt` desc); `updateJobProgress` extended with an optional `resultCapHit` param, included in `.set()` only when explicitly passed
- `lib/db/schema.ts`: `jobs.resultCapHit boolean not null default false` — additive column, migration `drizzle/0002_cute_maddog.sql` generated and applied to both dev and test Neon databases
- `lib/jobs/checkpoint.ts`: `JobCursor.capHit: boolean`, initialized `false` in `initialCursor()`
- `lib/jobs/runScrapeJob.ts`: `defaultFetchOnePage` computes `capHit` from the raw `pagesFetched`/`response.nextPageToken` immediately after `pagesFetched` is derived — **before** the `mapPlaceToLead` filter runs — and carries it forward monotonically (`cursor.capHit || capHit`); the final `status: 'done'` write threads `resultCapHit: cursor.capHit` through to the DB
- New/extended tests prove all of the above against the real test database (DAL) and via mock-based unit tests exercising the real `defaultFetchOnePage` composition against the existing `text-search-with-closed-business.json` fixture (worker)

## Task Commits

Each task was committed atomically (TDD RED → GREEN per task):

1. **Task 1: Add listBusinesses/updateBusinessNotes/setBusinessContacted (businesses.ts) and listJobs (jobs.ts)**
   - `a6d815d` (test) — failing integration tests for all four functions
   - `b01283d` (feat) — implementation, tests green
2. **Task 2: SCRAPE-07 Option B — persist a genuine resultCapHit signal**
   - `76edada` (test) — failing unit tests for `capHit`/`resultCapHit`
   - `d4455ec` (feat) — schema/checkpoint/worker/DAL implementation + migration, tests green

**Plan metadata:** (this commit) `docs(05-01): complete DAL + SCRAPE-07 resultCapHit plan`

## Files Created/Modified
- `lib/db/businesses.ts` - added `listBusinesses`, `updateBusinessNotes`, `setBusinessContacted`
- `lib/db/jobs.ts` - added `listJobs`; `updateJobProgress` accepts optional `resultCapHit`
- `lib/db/schema.ts` - added `jobs.resultCapHit` boolean column
- `lib/jobs/checkpoint.ts` - added `JobCursor.capHit`, `initialCursor()` sets it `false`
- `lib/jobs/runScrapeJob.ts` - computes `capHit` from raw pagination signal before filtering, carries it forward, persists on final write
- `drizzle/0002_cute_maddog.sql` - new additive migration: `ALTER TABLE "jobs" ADD COLUMN "result_cap_hit" boolean DEFAULT false NOT NULL`
- `tests/integration/db/businesses.test.ts` - extended with a new `describe` block for the three new functions
- `tests/integration/db/jobs.test.ts` - new file: `listJobs` integration test
- `tests/unit/lib/jobs/runScrapeJob.test.ts` - extended with 3 new cases proving the SCRAPE-07 fix and capHit persistence
- `tests/unit/lib/jobs/checkpoint.test.ts` - extended `initialCursor` assertion to include `capHit: false`
- `tests/integration/jobs/runScrapeJob.test.ts` - minor fix (see Deviations): added `capHit: false` to a pre-existing stub cursor literal

## Decisions Made
- `capHit` condition computed from the raw `pagesFetched`/`response.nextPageToken` — read directly off the API response before `mapPlaceToLead`'s closed-business filter runs — exactly research Pitfall 1's Option B, per the executor's explicit instruction not to deviate into the naive post-filter `leadsFound>=60` heuristic.
- `resultCapHit` is optional on `updateJobProgress`'s params, added to `.set()` via a conditional spread only when passed — keeps the two non-final `'running'`/`'partial'` checkpoint calls and the `'error'` call byte-identical to before this plan.
- Applied migration `0002_cute_maddog.sql` to both the real dev (`DATABASE_URL`) and test (`TEST_DATABASE_URL`) Neon databases via drizzle-orm's programmatic `migrate()` (from `drizzle-orm/neon-http/migrator`) through a throwaway script, deleted immediately after (`git status --short` confirmed no trace) — `drizzle-kit migrate`'s CLI spinner exits 1 on this Windows/non-TTY shell despite the migration succeeding, same documented workaround as `01-03-SUMMARY.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing integration test stub cursor missing the new required `capHit` field**
- **Found during:** Task 2, `pnpm typecheck` after widening `JobCursor` to require `capHit: boolean`
- **Issue:** `tests/integration/jobs/runScrapeJob.test.ts` (not in this plan's `files_modified` list, but a direct compile-time consequence of `JobCursor` gaining a required field) had a stub `nextCursor: { pageToken: null, pagesFetched: 1, done: true }` object literal that no longer satisfied the `JobCursor` type, failing `tsc --noEmit`.
- **Fix:** Added `capHit: false` to the stub literal (the stub represents a naturally-ended, non-cap-hit page).
- **Files modified:** `tests/integration/jobs/runScrapeJob.test.ts`
- **Verification:** `pnpm typecheck` passes; `pnpm test` (full suite) — 90/90 tests green, including this file.
- **Committed in:** `d4455ec` (Task 2 commit)

**2. [Rule 3 - Blocking] Migration needed to be applied, not just generated, for integration tests to pass**
- **Found during:** Task 2, running `pnpm test -- tests/unit/lib/jobs/*` after `pnpm drizzle-kit generate`
- **Issue:** The plan's `<action>` text only calls for generating the migration file; without applying it to the real test database, any integration test touching `jobs` (e.g. `tests/integration/jobs/flagStaleJob.test.ts`, `tests/integration/jobs/runScrapeJob.test.ts`) failed with `column "result_cap_hit" of relation "jobs" does not exist`.
- **Fix:** Applied `drizzle/0002_cute_maddog.sql` to both `TEST_DATABASE_URL` and `DATABASE_URL` via a throwaway programmatic-migrator script (see Decisions above), then deleted the script.
- **Files modified:** None (database schema only; no source change)
- **Verification:** Full `pnpm test` suite — 90/90 passing (previously 12 failing on `column ... does not exist`).
- **Committed in:** N/A (database-side change, not a file change)

**3. [Requirement-attribution correction] Did NOT mark CRM-01..05/SCRAPE-07 complete in REQUIREMENTS.md despite this plan's own frontmatter listing them**
- **Found during:** state_updates step, after running `requirements mark-complete` per the standard executor protocol and then cross-checking `05-03-PLAN.md`/`05-04-PLAN.md`'s own frontmatter.
- **Issue:** This plan's frontmatter declares `requirements: [CRM-01, CRM-02, CRM-03, CRM-04, CRM-05, SCRAPE-07]`, and the standard protocol says to mark all listed IDs complete on plan completion. But the requirement TEXT is UI-facing ("Leads list view reads from businesses...", "UI surfaces explicit messaging when the cap is hit...") and this plan ships **no UI** (its own objective text: "this plan has no direct UI"). `05-03-PLAN.md`'s frontmatter separately declares `requirements: [CRM-01, CRM-02, CRM-03, CRM-04]` and `05-04-PLAN.md`'s declares `requirements: [CRM-05, SCRAPE-07]` — those are the actual owning plans per `ROADMAP.md`, and neither has executed yet. Marking these six requirements `Complete` here would have been a false positive: `verify-work`'s deterministic coverage classifier auto-passes a requirement when `human_judgment: false` and every linked verification is `pass` — which would have suppressed real UAT for the Leads page and Job History page once 05-03/05-04 land.
- **Fix:** Reverted `requirements mark-complete`'s edits to `REQUIREMENTS.md` for all six IDs (checkboxes back to `[ ]`, traceability table rows back to `Pending`, with a note explaining why 05-01's frontmatter lists them without completing them). Set this SUMMARY's own `requirements-completed: []` and removed the `requirement:` links from the `coverage:` block's D1/D2 entries (the deliverables themselves — DAL functions, `resultCapHit` — remain accurately described and fully proven by passing tests; they're just not tied to a v1 requirement ID here).
- **Files modified:** `.planning/REQUIREMENTS.md`, this SUMMARY's frontmatter
- **Verification:** Confirmed via `grep -n "^requirements:" .planning/phases/05-crm-leads-dashboard/05-0{3,4}-PLAN.md` that 05-03/05-04 own these requirement IDs; `git diff .planning/REQUIREMENTS.md` shows only the six IDs reverted to `Pending`, SEC-03 (genuinely delivered by 05-02) left untouched at `Complete`.
- **Committed in:** plan-metadata commit (docs)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking, both required for tests to compile/pass) + 1 requirement-attribution correction (no scope creep, no architectural changes; this is a bookkeeping correction, not a code change)
**Impact on plan:** Both Rule-3 fixes were mechanical prerequisites for the plan's own stated verification to run at all. The requirement-attribution correction prevents this plan's backend-only work from prematurely marking six UI-facing requirements complete before their owning plans (05-03/05-04) execute.

## Issues Encountered

- A full `pnpm test` run mid-session showed 1 failing file, `tests/unit/app/leads/actions.test.ts` (`Cannot find package '@/app/leads/actions'`) — this is Plan 05-03's own TDD RED-phase test (a concurrent sibling plan being executed in parallel in this same working directory, confirmed via `git log -1 -- tests/unit/app/leads/actions.test.ts` showing its own `test(05-03): ...` commit), entirely outside this plan's file scope. A subsequent full-suite re-run showed it passing (22/22 files, 98/98 tests) once 05-03's concurrent GREEN-phase commit landed. Not touched, not caused by this plan — confirmed transient/concurrent, not a regression.

- The plan's acceptance criteria for Task 1 suggested `grep -c "updatedAt: new Date()" lib/db/businesses.ts` would return at least 3 (covering `upsertBusiness` plus the two new functions). The actual count is 2: `upsertBusiness` sets `updatedAt: now` (a variable holding `new Date()` captured once at the top of the function, for consistency with `firstSeenAt`/`lastSeenAt`/`lastSeenAt` in the same call), not the literal string `new Date()` inline. This is a pre-existing idiom in `upsertBusiness`, not something this plan touched or should have changed (plan's own `<read_first>` instructed mirroring `upsertBusiness`'s idiom exactly). The functional intent — every mutation bumps `updatedAt` on every call — is fully proven by the passing integration tests (`afterFirst.updatedAt.getTime()` / `afterSecond.updatedAt.getTime()` strictly increase across two `updateBusinessNotes` calls, and similarly for `setBusinessContacted`). No code change made; documenting the literal grep-count mismatch here since the plan text specified it as a checkable criterion.

## User Setup Required

None - no external service configuration required. (The migration was applied directly to the existing dev/test Neon databases as part of this plan's execution — no manual dashboard step needed.)

## Next Phase Readiness
- `listBusinesses`, `updateBusinessNotes`, `setBusinessContacted` are ready for Plan 05-03's Leads page Server Actions to call directly.
- `listJobs` and `jobs.resultCapHit` are ready for Plan 05-04's Job History page to read and render (e.g. a "hit result cap" badge distinct from a plain `leadsFound` count).
- No blockers.

---
*Phase: 05-crm-leads-dashboard*
*Completed: 2026-07-03*

## Self-Check: PASSED

- `lib/db/businesses.ts` — FOUND
- `lib/db/jobs.ts` — FOUND
- `lib/db/schema.ts` — FOUND
- `lib/jobs/checkpoint.ts` — FOUND
- `lib/jobs/runScrapeJob.ts` — FOUND
- `drizzle/0002_cute_maddog.sql` — FOUND
- `tests/integration/db/jobs.test.ts` — FOUND
- Commit `a6d815d` (Task 1 test) — FOUND in `git log --oneline --all`
- Commit `b01283d` (Task 1 feat) — FOUND in `git log --oneline --all`
- Commit `76edada` (Task 2 test) — FOUND in `git log --oneline --all`
- Commit `d4455ec` (Task 2 feat) — FOUND in `git log --oneline --all`
- No unexpected file deletions in any commit (`git status --short` before each commit showed only the intended staged files)
