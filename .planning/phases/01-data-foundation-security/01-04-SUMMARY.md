---
phase: 01-data-foundation-security
plan: 04
subsystem: database
tags: [drizzle-orm, data-access-layer, upsert, idempotency]

# Dependency graph
requires:
  - phase: 01-data-foundation-security (Plan 01-03)
    provides: "lib/db/schema.ts (jobs/leads/businesses tables), lib/db/client.ts (server-only neon-http Drizzle client), first migration applied to real dev + test Neon databases"
provides:
  - "lib/db/jobs.ts — createJob, getJob (minimal CRUD)"
  - "lib/db/businesses.ts — upsertBusiness (onConflictDoUpdate, CRM-field-preserving)"
  - "lib/db/leads.ts — insertLeadSnapshot (onConflictDoNothing, idempotent)"
affects: [Phase 1 Plan 01-05 (integration tests against test DB), Phase 2 (Places client calls these DAL functions), Phase 3 (job worker calls createJob/getJob)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "upsertBusiness's onConflictDoUpdate set object is hand-written, never a generic getTableColumns()/excluded.* helper — omission of notes/contacted/firstSeenAt from set is what makes DATA-01 hold"
    - "insertLeadSnapshot uses onConflictDoNothing (declarative) instead of try/catch around a plain insert — avoids silent error swallowing per this repo's own guardrails"
    - "getJob returns undefined for a nonexistent id rather than throwing — a query-level 'no result' case, not an error"

key-files:
  created:
    - lib/db/jobs.ts
    - lib/db/businesses.ts
    - lib/db/leads.ts
  modified: []

key-decisions:
  - "createJob uses db.insert(jobs).values(...).returning({ id: jobs.id }) rather than a separate select-after-insert — one round trip, matches Drizzle's standard pattern for returning a generated column."

requirements-completed: [DATA-01, DATA-02]

coverage:
  - id: D1
    description: "createJob inserts a jobs row (status defaults to 'pending' via the schema's own column default) and returns the generated uuid id; getJob selects by id and returns undefined (not a throw) when the row doesn't exist"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "pnpm run typecheck (tsc --noEmit, clean pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "upsertBusiness's onConflictDoUpdate set object refreshes businessName/phone/address/website/rating/reviewCount/lastSeenAt/updatedAt but omits notes/contacted/firstSeenAt, so a re-sighting cannot reset existing CRM state"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "pnpm run typecheck (tsc --noEmit, clean pass)"
        status: pass
      - kind: other
        ref: "grep -A 15 'onConflictDoUpdate' lib/db/businesses.ts | grep -E '^\\s*(notes|contacted|firstSeenAt):' — zero matches (CLEAN)"
        status: pass
    human_judgment: false
  - id: D3
    description: "insertLeadSnapshot writes a leads row per job scrape event using onConflictDoNothing targeting the composite (jobId, placeId) key, so a worker retry/resume re-processing the same page is a silent no-op rather than a thrown unique-violation error"
    requirement: DATA-02
    verification:
      - kind: unit
        ref: "pnpm run typecheck (tsc --noEmit, clean pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-07-03
status: complete
---

# Phase 01 Plan 04: Data Access Layer (jobs, businesses, leads) Summary

**Three server-only DAL modules — jobs.ts (minimal CRUD), businesses.ts (CRM-preserving upsert), leads.ts (idempotent per-job snapshot insert) — implementing the identity/sighting split DATA-01/DATA-02 require, built exactly on the Plan 01-03 schema.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-03T06:52:27Z (approx, from prior plan's completion)
- **Completed:** 2026-07-03T06:55:46Z
- **Tasks:** 2
- **Files modified:** 3 created (lib/db/jobs.ts, lib/db/businesses.ts, lib/db/leads.ts)

## Accomplishments

- Created `lib/db/jobs.ts` with `createJob({ category, location })` (inserts, returns generated `id` via `.returning()`) and `getJob(id)` (selects by id, returns `undefined` — not a throw — when not found). Scope intentionally limited to minimal CRUD per plan; `leads_found`/`cursor`/`error_reason` columns and their update functions are explicitly deferred to Phase 3.
- Created `lib/db/businesses.ts` with `upsertBusiness(place)` matching research Code Example 1 exactly: inserts with `firstSeenAt`/`lastSeenAt` set to now, then `onConflictDoUpdate({ target: businesses.placeId, set: {...} })` where `set` refreshes content fields (`businessName`, `phone`, `address`, `website`, `rating`, `reviewCount`, `lastSeenAt`, `updatedAt`) but deliberately omits `notes`, `contacted`, `firstSeenAt` — verified by the plan's own negative grep.
- Created `lib/db/leads.ts` with `insertLeadSnapshot(jobId, place)` matching research Code Example 2 exactly: `onConflictDoNothing({ target: [leads.jobId, leads.placeId] })`, making a worker retry/resume a silent no-op instead of a unique-violation error.
- Both `pnpm run typecheck` and the plan's `! grep -A 15 'onConflictDoUpdate' lib/db/businesses.ts | grep -E '^\s*(notes|contacted|firstSeenAt):'` verify passed cleanly.

## Task Commits

Each task was committed atomically:

1. **Task 1: jobs.ts — minimal CRUD supporting the leads foreign key** - `704f01c` (feat)
2. **Task 2: businesses.ts and leads.ts — the identity/sighting split** - `1a14176` (feat)

**Plan metadata:** per this plan's explicit instructions, this executor did not update STATE.md/ROADMAP.md — that update is deferred to the orchestrator.

## Files Created/Modified

- `lib/db/jobs.ts` - `createJob`, `getJob`; server-only, imports `db` from `@/lib/db/client` and `jobs` from `@/lib/db/schema`
- `lib/db/businesses.ts` - `upsertBusiness`; server-only, hand-written `onConflictDoUpdate` set object (no generic column-spread helper)
- `lib/db/leads.ts` - `insertLeadSnapshot`; server-only, `onConflictDoNothing` on the composite `(jobId, placeId)` key

## Decisions Made

- `createJob` uses `.returning({ id: jobs.id })` on the insert rather than a separate select-by-known-value — one round trip, the standard Drizzle pattern for retrieving a DB-generated column (here, `uuid().defaultRandom()`).

## Deviations from Plan

None - plan executed exactly as written. Both DAL modules match the research's Code Examples 1 and 2 verbatim (function signatures, field lists, the deliberate omission of CRM columns from `businesses`'s `set` object).

## Issues Encountered

None.

## User Setup Required

None - both modules build directly on the already-live schema/client from Plan 01-03; no new environment variables or external service configuration needed.

## Next Phase Readiness

- `lib/db/jobs.ts`, `lib/db/businesses.ts`, `lib/db/leads.ts` are all importable, typecheck cleanly, and match the exact function signatures Plan 01-05's integration tests (against the real Neon test database) expect: `createJob`, `getJob`, `upsertBusiness`, `insertLeadSnapshot`.
- DATA-01 and DATA-02 are now implemented as callable, server-only functions — Plan 01-05 provides the concrete proof (via integration tests against a real Neon database) that the upsert-preserving-CRM-fields and idempotent-snapshot-insert behaviors work end-to-end, not just typecheck.
- Phase 2 (Places client) and Phase 3 (job worker) can call these DAL functions directly once built — no further DAL work needed for `jobs`/`businesses`/`leads` beyond Phase 3's additive `leads_found`/`cursor`/`error_reason` columns (out of this plan's scope by design).

---
*Phase: 01-data-foundation-security*
*Completed: 2026-07-03*

## Self-Check: PASSED

All created files confirmed on disk (lib/db/jobs.ts, lib/db/businesses.ts, lib/db/leads.ts, this SUMMARY.md). Both task commits (704f01c, 1a14176) confirmed present in git log.
