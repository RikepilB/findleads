---
phase: 01-data-foundation-security
verified: 2026-07-03T03:15:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Confirm the Google Cloud Places API key restriction (SEC-02) was actually saved in Cloud Console."
    expected: "Only Places API (New) selected under API restrictions, Save clicked."
    why_human: "Live Google Cloud Console configuration cannot be inspected or reproduced from the codebase; the session's own record was ambiguous (agent narrowed the restriction via Chrome automation but the user took over before the final Save)."
    result: "User explicitly confirmed via AskUserQuestion (2026-07-03) that the restriction was completed and saved in Cloud Console — 'Yes, restricted and saved.' Resolves the ambiguity the automated session record left open."
---

# Phase 1: Data Foundation & Security Verification Report

**Phase Goal:** The database schema and API key security model exist so every later scrape, job, and CRM feature has durable, secure storage to build on.
**Verified:** 2026-07-03T03:15:00Z
**Status:** passed
**Re-verification:** No — initial verification (SEC-02 human confirmation added post-verification, see frontmatter)

## Goal Achievement

### Observable Truths (ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A `businesses` row is created on first sighting of a `place_id` and upserted (not replaced) on every later sighting, without resetting existing `notes`/`contacted` state | ✓ VERIFIED | `lib/db/businesses.ts` `onConflictDoUpdate` set object omits `notes`/`contacted`/`firstSeenAt` by design. `tests/integration/db/businesses.test.ts` "refreshes content but preserves notes/contacted/firstSeenAt across a re-sighting (DATA-01)" — real Neon test DB: writes `notes`/`contacted` directly, re-upserts with different content, asserts content fields change while `notes`/`contacted`/`firstSeenAt` survive unchanged. Ran and passed (`pnpm vitest run` — 9 files/43 tests, all pass). |
| 2 | A `leads` row is written per job scrape event with `unique(job_id, place_id)`, kept separate from `businesses` so CRM state and per-job snapshots never collide | ✓ VERIFIED | `lib/db/schema.ts` line 28-30: `unique('leads_job_id_place_id_unique').on(table.jobId, table.placeId)`. `lib/db/leads.ts` `insertLeadSnapshot` uses `onConflictDoNothing({ target: [leads.jobId, leads.placeId] })`. `tests/integration/db/leads.test.ts` (real Neon test DB) proves: (a) duplicate insert is a no-op leaving exactly one row, (b) dedup is scoped to the exact pair not a global collapse, (c) `leads`⋈`businesses` join by `placeId` works for CRM display — all three passed against the live test database. |
| 3 | Place content (name/address/phone/rating/website) persists durably in Postgres and survives across job runs, per the accepted ToS-risk decision in PROJECT.md | ✓ VERIFIED | `tests/integration/db/businesses.test.ts` "persists place content and is readable after upsert (DATA-03)" writes a full place payload via `upsertBusiness` and reads every field back via a direct `db.select()` against the real Neon test DB — passed. `drizzle/0000_lethal_whizzer.sql` migration confirmed applied to both dev and test Neon databases per 01-03-SUMMARY.md's `information_schema.tables` check. |
| 4 | The Places API key never appears in any client-side bundle or `NEXT_PUBLIC_*` variable — all Places calls are proxied through server-side Node API routes | ✓ VERIFIED | `grep -rn "NEXT_PUBLIC" lib/ app/` → zero matches. `PLACES_API_KEY` is read exclusively in `lib/env.ts` (`import 'server-only'` line 1) and consumed only in `lib/places/client.ts`, which itself starts with `import 'server-only'` (line 3) — the module holding the key is structurally blocked from ever being bundled into a Client Component. No `app/` files contain `"use client"` yet (no UI exists in Phase 1), so there is no client-side surface at all currently. |
| 5 | The Google Cloud API key is restricted to the Places API only in Cloud Console | ✓ VERIFIED (human-confirmed) | Live Console setting, not inspectable from the codebase. Session record was ambiguous (agent narrowed the restriction, user took over before final Save) — resolved by explicit user confirmation via AskUserQuestion: "Yes, restricted and saved." See `human_verification` in frontmatter. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/env.ts` | server-only, zod-validated `DATABASE_URL`/`PLACES_API_KEY` boundary, no `NEXT_PUBLIC_` | ✓ VERIFIED | `import 'server-only'` line 1; `envSchema.parse(process.env)` at module scope; 4/4 unit tests pass (`tests/unit/lib/env.test.ts`). |
| `lib/db/schema.ts` | `jobs`/`leads`/`businesses` Drizzle tables, array-form config, composite unique on leads | ✓ VERIFIED | Present, array-form `(table) => [...]`, `uuid` job PK, `text` place_id, `real` rating — matches research exactly. |
| `lib/db/client.ts` | server-only neon-http Drizzle client, reads only via `lib/env.ts` | ✓ VERIFIED | `import 'server-only'`, imports `env` from `@/lib/env`, no direct `process.env` read. |
| `lib/db/jobs.ts` | `createJob`/`getJob` minimal CRUD | ✓ VERIFIED | Present, typechecks, exercised transitively by `leads.test.ts`'s `createJob` calls against real DB. |
| `lib/db/businesses.ts` | CRM-preserving `upsertBusiness` | ✓ VERIFIED | See Truth 1 above. |
| `lib/db/leads.ts` | idempotent `insertLeadSnapshot` | ✓ VERIFIED | See Truth 2 above. |
| `drizzle/0000_lethal_whizzer.sql` | first migration, applied to dev + test Neon DBs | ✓ VERIFIED | Confirmed live via `information_schema.tables` query against both databases (01-03-SUMMARY.md), and functionally exercised by every integration test in this verification run. |
| `tests/integration/db/businesses.test.ts`, `tests/integration/db/leads.test.ts` | real-DB proof of DATA-01/02/03 | ✓ VERIFIED (WIRED, data flowing) | Both files read directly, confirmed non-hollow (assertions genuinely check preserve/refresh and dedup/idempotency behavior), and re-ran successfully in this verification session. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/places/client.ts` | `lib/env.ts` | `import { env } from '@/lib/env'`, reads `env.PLACES_API_KEY` | ✓ WIRED | Confirmed at `lib/places/client.ts` line 4/58; module itself is `server-only`-guarded. |
| `lib/db/{jobs,businesses,leads}.ts` | `lib/db/client.ts` → `lib/env.ts` | `import { db } from '@/lib/db/client'` | ✓ WIRED | All three DAL modules import `db`, never read `process.env` directly. |
| `tests/integration/db/*.test.ts` | real Neon test database | `vitest.config.ts` injects `TEST_DATABASE_URL` as `DATABASE_URL` for the test process | ✓ WIRED | Confirmed by actually running `pnpm vitest run` — all 43 tests pass, including 5 integration tests hitting the live test DB. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-01 | 01-04, 01-05 | `businesses` upserted on every sighting, CRM state preserved | ✓ SATISFIED | Truth 1 above |
| DATA-02 | 01-03, 01-04, 01-05 | `leads` per-job snapshot, `unique(job_id, place_id)`, joins to `businesses` | ✓ SATISFIED | Truth 2 above |
| DATA-03 | 01-03, 01-05 | Place content stored durably | ✓ SATISFIED | Truth 3 above |
| SEC-01 | 01-02 | Places API key server-side only, no `NEXT_PUBLIC_*` | ✓ SATISFIED | Truth 4 above |
| SEC-02 | 01-02 | Google Cloud key restricted to Places API only | ? NEEDS HUMAN | Truth 5 above |

No orphaned requirements — REQUIREMENTS.md maps exactly these 5 IDs to Phase 1, all 5 accounted for.

### Anti-Patterns Found

None. `grep -rn "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across `lib/`, `tests/integration/`, `tests/unit/` returned zero matches. No empty handlers, no hardcoded-empty-with-no-source stubs found in any Phase 1 file.

### Automated Verification Run (this session, not trusted from SUMMARY claims)

- `pnpm vitest run` → **9 test files, 43 tests, all passing** (re-run directly, not copied from a SUMMARY).
- `pnpm run typecheck` → clean, exit 0.
- `pnpm lint` → clean, exit 0.

### Human Verification Required

### 1. SEC-02 — Google Cloud Places API key restriction

**Test:** Run the two-call completion check from `01-RESEARCH.md`'s `gcp_key_restriction` section:
```bash
curl -s -X POST https://places.googleapis.com/v1/places:searchText \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: $PLACES_API_KEY" \
  -H "X-Goog-FieldMask: places.displayName" \
  -d '{"textQuery":"restaurant in Toronto"}'
curl -s "https://maps.googleapis.com/maps/api/geocode/json?address=Toronto&key=$PLACES_API_KEY" \
  | grep -q 'REQUEST_DENIED'
```
**Expected:** First call returns a `places` array (Places API works). Second call matches `REQUEST_DENIED` (Geocoding is blocked — proves the restriction is live, not just configured-and-unsaved).
**Why human:** Live Cloud Console state cannot be inspected from the codebase, and this executor is correctly denied `.env*` read access. The session record itself is internally ambiguous — see frontmatter `human_verification` entry for the full evidentiary conflict between the two handoff sessions.

### Gaps Summary

No code-level gaps. Four of five Phase 1 success criteria are independently verified against real, running tests (not SUMMARY claims) — the full suite was re-executed in this session and passed, and the two integration test files were read in full to confirm they exercise the actual DATA-01/DATA-02 behavioral invariants (preserve-on-conflict, idempotent-dedup, pair-scoped-not-global) rather than merely asserting presence.

The sole open item is SEC-02, which is a live external Cloud Console setting outside this codebase's reach. Evidence trail: `docs/handoff/2026-07-02-crm-pivot-gsd-init/HANDOFF.md` documents the agent narrowing the API restriction to Places API (New) via Chrome automation but explicitly stopping before the final Save — the user took over the last steps directly. A later handoff entry claims "ALL secrets setup" finished and "confirmed by the user," but that statement's context is secret *presence* (unblocking `lib/env.ts`/Wave 3), not the restriction's Save state, so it does not resolve the ambiguity. This is exactly the class of finding Step 8 routes to human verification rather than a pass/fail code gap — it must not be silently marked complete.

**Note (not a gap):** `.planning/ROADMAP.md` still shows Phase 1 as "Not started (0/5)" and `.planning/STATE.md` still points `current_phase: 3`/`completed_phases: 1` inconsistently with Phase 1's actual 5/5 plans executed. Every 01-0X-SUMMARY.md explicitly states "this executor did not update STATE.md/ROADMAP.md — that update is deferred to the orchestrator." This is stale bookkeeping, not a phase-goal failure, and is not logged as a gap.

---

*Verified: 2026-07-03T03:15:00Z*
*Verifier: Claude (gsd-verifier)*
