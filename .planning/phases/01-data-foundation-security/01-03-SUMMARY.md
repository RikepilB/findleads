---
phase: 01-data-foundation-security
plan: 03
subsystem: database
tags: [drizzle-orm, neon, postgres, drizzle-kit, migrations]

# Dependency graph
requires:
  - phase: 01-data-foundation-security (Plan 01-02)
    provides: "lib/env.ts (zod-validated DATABASE_URL/PLACES_API_KEY), .env with real dev DATABASE_URL, .env.test with real TEST_DATABASE_URL"
provides:
  - "lib/db/schema.ts — jobs/leads/businesses Drizzle table definitions (array-form table config)"
  - "lib/db/client.ts — server-only neon-http Drizzle client instance"
  - "drizzle.config.ts — drizzle-kit CLI config (generate + migrate)"
  - "drizzle/0000_lethal_whizzer.sql — first migration, applied to both real dev and test Neon databases"
affects: [Phase 1 Plan 01-04 (DAL functions), Phase 1 Plan 01-05 (integration tests against test DB), Phase 2 (Places client writes leads/businesses), Phase 3 (job worker writes jobs)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Array-form drizzle-kit table config exclusively: (table) => [ unique(...).on(...) ] — never the deprecated object-return form"
    - "jobs.id is uuid().defaultRandom() (not serial) — exposed unauthenticated in a polled URL from Phase 3 onward"
    - "leads.rating/businesses.rating use real, not numeric — numeric infers as TS string, mismatching number | null"
    - "drizzle-kit generate+migrate (never push) from the first migration onward, per this repo's additive-migrations rule"

key-files:
  created:
    - lib/db/schema.ts
    - lib/db/client.ts
    - drizzle.config.ts
    - drizzle/0000_lethal_whizzer.sql
    - drizzle/meta/0000_snapshot.json
    - drizzle/meta/_journal.json
  modified: []

key-decisions:
  - "Applied the migration to both dev and test Neon databases via drizzle-orm's programmatic migrator (drizzle-orm/neon-http/migrator) instead of the drizzle-kit CLI's `migrate` subcommand for the second (test) application, after the CLI subcommand exited 1 on this Windows/non-TTY shell despite the underlying migration succeeding — see Deviations."

patterns-established:
  - "Real round-trip smoke tests against a live Neon DB must run with NODE_OPTIONS=--conditions=react-server (or vitest's ssr.resolve.conditions) so the server-only guard in lib/db/client.ts resolves correctly outside Next.js's own build pipeline."

requirements-completed: [DATA-01, DATA-02, DATA-03]

coverage:
  - id: D1
    description: "jobs/leads/businesses schema defined in lib/db/schema.ts with array-form table config, uuid job IDs, and the leads (job_id, place_id) composite unique constraint"
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "pnpm run typecheck (tsc --noEmit, clean pass)"
        status: pass
      - kind: other
        ref: "grep -q ') => \\[' lib/db/schema.ts (array-form table config present)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Neon Drizzle client (lib/db/client.ts) reads DATABASE_URL exclusively via lib/env.ts, never process.env directly"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "pnpm run typecheck (tsc --noEmit, clean pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "First migration (drizzle/0000_lethal_whizzer.sql) generated and applied to both the real dev and real test Neon databases — jobs/leads/businesses tables live on Postgres, not just TypeScript"
    requirement: DATA-03
    verification:
      - kind: integration
        ref: "information_schema.tables query against both DATABASE_URL and TEST_DATABASE_URL confirming jobs/leads/businesses present in both"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real insert/select/delete round-trip against the dev database via lib/db/client.ts — proves the schema is functionally live, not just structurally present"
    requirement: DATA-02
    verification:
      - kind: integration
        ref: "one-off tsx script (deleted after verification) inserting a __walking_skeleton_smoke_test__ jobs row, selecting it back by id, confirming field match, deleting it, then re-querying to confirm zero residual rows (DEV jobs row count: 0)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-03
status: complete
---

# Phase 01 Plan 03: Schema, Drizzle Client, First Migration Summary

**jobs/leads/businesses Drizzle schema with the identity/sighting split, a neon-http server-only client, and the first migration applied to both real dev and test Neon Postgres databases with a proven insert/select/delete round-trip.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-03T06:37:39Z (approx, from prior handoff commit)
- **Completed:** 2026-07-03T06:52:27Z
- **Tasks:** 2
- **Files modified:** 6 created (lib/db/schema.ts, lib/db/client.ts, drizzle.config.ts, drizzle/0000_lethal_whizzer.sql, drizzle/meta/0000_snapshot.json, drizzle/meta/_journal.json)

## Accomplishments

- Defined `jobStatusEnum` + `jobs`/`leads`/`businesses` tables exactly per research Code Example 3: `jobs.id` as `uuid().defaultRandom()`, `leads.placeId` as `text` (no max length), `rating` as `real` (not `numeric`), composite unique `(jobId, placeId)` on `leads` using the current array-form table-config callback.
- Created `lib/db/client.ts` (server-only `neon-http` Drizzle instance importing `env` from `lib/env.ts`, never reading `process.env` directly) and `drizzle.config.ts` (`drizzle-kit` CLI config for `generate`+`migrate`, never `push`).
- Generated the first migration (`drizzle/0000_lethal_whizzer.sql`) and read the SQL before applying — confirmed it contains only `CREATE TYPE`/`CREATE TABLE`/`ALTER TABLE ... ADD CONSTRAINT` statements, no unexpected drops.
- Applied the migration to **both** the real dev (`DATABASE_URL`) and real test (`TEST_DATABASE_URL`) Neon Postgres databases. Verified live via a direct `information_schema.tables` query against both databases: `jobs`, `leads`, `businesses` present in both.
- Proved a real insert/select/delete round-trip against the dev database using `lib/db/client.ts`: inserted a throwaway `jobs` row (`category: "__walking_skeleton_smoke_test__"`, `location: "n/a"`), selected it back by id and confirmed field-level match, deleted it, then re-queried to confirm zero residual rows (`DEV jobs row count: 0`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema, Drizzle client, and drizzle-kit config** - `d4359b3` (feat)
2. **Task 2: Generate and apply the first migration; prove a real round-trip** - `e15600b` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP updates, made by the orchestrator per this plan's instructions — this executor was told not to update STATE.md/ROADMAP.md)

## Files Created/Modified

- `lib/db/schema.ts` - `jobStatusEnum` pg enum; `jobs` (uuid PK), `leads` (serial PK, composite unique job_id+place_id, FK to jobs), `businesses` (serial PK, unique place_id) table definitions
- `lib/db/client.ts` - server-only `neon-http` Drizzle client instance, imports `env` from `lib/env.ts`
- `drizzle.config.ts` - `drizzle-kit` CLI config (`out: './drizzle'`, `dialect: 'postgresql'`, `dbCredentials.url` from `process.env.DATABASE_URL`)
- `drizzle/0000_lethal_whizzer.sql` - first migration: `CREATE TYPE job_status`, `CREATE TABLE businesses/jobs/leads`, `ALTER TABLE leads ADD CONSTRAINT ... FOREIGN KEY`
- `drizzle/meta/0000_snapshot.json`, `drizzle/meta/_journal.json` - drizzle-kit migration bookkeeping

## Decisions Made

- Applied the migration to the test database via drizzle-orm's programmatic `migrate()` (from `drizzle-orm/neon-http/migrator`) rather than a second `drizzle-kit migrate` CLI invocation, because the CLI subcommand's spinner exited with code 1 on this Windows/non-TTY shell (see Deviations below) even though the migration itself succeeded. The programmatic migrator is the same underlying code path `drizzle-kit migrate` calls internally, so this is not a deviation in mechanism — just in invocation surface.
- Round-trip smoke test was written as a temporary `scripts-tmp-roundtrip.ts` file, run once via `NODE_OPTIONS=--conditions=react-server pnpm exec tsx`, then deleted immediately after — it was not meant to be a permanent test (Plan 01-05 owns the real integration test suite against the test database). `git status --short` confirmed it left no trace.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `drizzle-kit migrate` CLI exits 1 on this Windows/non-TTY shell despite migration succeeding**
- **Found during:** Task 2, applying the migration to the test database (and confirmed on a dev re-run too)
- **Issue:** `DATABASE_URL="..." pnpm exec drizzle-kit migrate` printed `[⣷] applying migrations...` and then exited with code 1, with no error text on stdout or stderr — no explanation. The first dev-database run happened to print `[✓] migrations applied successfully!` before this behavior appeared on the second (test-database) invocation and on a dev re-run (idempotent no-op), suggesting a spinner/TTY-detection bug in `drizzle-kit`'s CLI wrapper on this environment (`ora`-style spinner + Windows/non-TTY Bash), not an actual migration failure.
- **Fix:** Verified the underlying migration mechanism directly — used `drizzle-orm/neon-http/migrator`'s programmatic `migrate(db, { migrationsFolder: './drizzle' })` function (the same code the CLI calls) against `TEST_DATABASE_URL`, which completed and logged `MIGRATE_OK`. Independently confirmed via a raw `information_schema.tables` query against both `DATABASE_URL` and `TEST_DATABASE_URL` that `jobs`/`leads`/`businesses` exist in both databases with the correct shape.
- **Files modified:** None (no source change required — this was a CLI invocation issue, not a schema/config bug)
- **Verification:** `information_schema.tables` query returned `["businesses","jobs","leads"]` for both DEV and TEST connection strings; the plan's acceptance criterion ("both dev and test Neon databases have the jobs/leads/businesses schema live") is independently confirmed regardless of the CLI's exit code.
- **Committed in:** e15600b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, CLI environment quirk, not a code defect)
**Impact on plan:** No functional impact — both databases carry the identical, correct schema. Future plans invoking `drizzle-kit migrate` on Windows should be aware the CLI's spinner may report exit code 1 on a successful migration in a non-TTY shell; verify via `information_schema` or the programmatic migrator rather than trusting the CLI's exit code alone in this environment.

## Issues Encountered

- `pnpm exec tsx` alone could not import `lib/db/client.ts` because the `server-only` package's `react-server` export condition isn't set by tsx's default Node resolution, throwing "This module cannot be imported from a Client Component module." Resolved by running with `NODE_OPTIONS=--conditions=react-server` (the same condition `vitest.config.ts`'s `ssr.resolve.conditions` already sets for the test suite). Running the round-trip through `vitest` directly was avoided because `vitest.config.ts`'s `test.env.DATABASE_URL` always overrides to `TEST_DATABASE_URL`, which would have proven the wrong database against the plan's explicit "against the dev database" requirement.

## User Setup Required

None - no external service configuration required. `.env` and `.env.test` were already populated by the user before this plan ran (verified at start: `DATABASE_URL`, `PLACES_API_KEY` in `.env`; `TEST_DATABASE_URL` in `.env.test`, distinct from `DATABASE_URL`).

## Next Phase Readiness

- `lib/db/schema.ts` and `lib/db/client.ts` are the exact shapes Plan 01-04 (DAL functions: `upsertBusiness`, `insertLeadSnapshot` per research Code Examples 1-2) will build directly on top of — no renegotiation needed.
- Both dev and test Neon databases carry the identical live schema, so Plan 01-05's integration tests can run against the test database immediately.
- DATA-03 (durable place content) is structurally satisfied: the columns exist and are proven durable via the round-trip. DATA-01/DATA-02 (implemented as DAL upsert/insert functions) are unblocked — this plan only proves the underlying table shapes and connection are correct, not the upsert-preserving-CRM-fields logic itself.

---
*Phase: 01-data-foundation-security*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created files confirmed on disk (lib/db/schema.ts, lib/db/client.ts, drizzle.config.ts,
drizzle/0000_lethal_whizzer.sql, drizzle/meta/0000_snapshot.json, drizzle/meta/_journal.json,
this SUMMARY.md). Both task commits (d4359b3, e15600b) confirmed present in git log.
