---
phase: 04-job-monitoring-resumability-export
verified: 2026-07-03T15:05:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 4: Job Monitoring, Resumability & Export Verification Report

**Phase Goal:** Richard can watch a job through to completion — including automatic
resumption and honest failure/zero-result states — and pull finished results out as CSV.
**Verified:** 2026-07-03T15:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Polling a `partial` job's status endpoint triggers continuation, guarded by an atomic claim so two concurrent polls can't double-continue | VERIFIED | `lib/db/jobs.ts:55-62` `claimPartialJob` is a single conditional `UPDATE ... WHERE status='partial' RETURNING *` (Postgres row-level locking, no app mutex). `tests/integration/jobs/claimPartialJob.test.ts` runs a real `Promise.all([claimPartialJob(id), claimPartialJob(id)])` against the real Neon test DB and asserts exactly 1 of 2 concurrent calls wins the race — genuine race-safety proof, not simulated timing. Wired into `app/api/jobs/[id]/route.ts:30-39`: only a won claim schedules `after(() => runScrapeJob(id))`, confirmed by `tests/unit/app/api/jobs/[id]/route.test.ts` (won-race schedules exactly once, lost-race schedules zero times). |
| 2 | A stale `pending`/`running` job auto-flips to `error` with a human-readable reason on next read | VERIFIED | `lib/db/jobs.ts:69-87` `flagStaleJob` — conditional `UPDATE ... WHERE status IN ('pending','running') AND updated_at < now() - WATCHDOG_MS`. `WATCHDOG_MS = SAFETY_WINDOW_MS * 2` = 500,000ms (`lib/jobs/checkpoint.ts:23`). `tests/integration/jobs/flagStaleJob.test.ts` against real Neon test DB: directly SQL-writes a fake stale `updated_at`, then confirms the flip to `error` with reason matching `/timed out/i`; also confirms a recent `updated_at` is untouched, and a `partial`/`done` row is never touched even if stale (disjoint status sets from the claim). Wired into `route.ts:25-26` — runs before the claim check on every GET. |
| 3 | A job that legitimately finds zero leads is a valid completed outcome, distinguished from a real failure | VERIFIED | `route.ts:45-55` always returns `{status, leadsFound, errorReason}` together — a real Route Handler, not mocked at this level. `tests/unit/app/api/jobs/[id]/route.test.ts:115-124` asserts `{status:'done', leadsFound:0}` is returned distinctly from the `{status:'error', errorReason:'...'}` shape produced by the watchdog-flip test in the same file — same endpoint, both shapes proven present and distinguishable. |
| 4 | A completed job's leads can be exported to CSV, joined to current `businesses` CRM state | VERIFIED | `lib/csv/export.ts:26-53` `buildJobLeadsCsv` — `leads INNER JOIN businesses ON place_id`, pulling `notes`/`contacted` from `businesses` (leads has no such columns — Phase 1 identity/sighting split). `tests/integration/jobs/export.test.ts` seeds real `leads`+`businesses` rows in the real Neon test DB with divergent CRM state (`notes`, `contacted: true`) and asserts the actual generated CSV string reflects `businesses`' current state, not `leads`' snapshot. `app/api/jobs/[id]/export/route.ts` 404s on missing job, 409s on non-`done` status (never calling `buildJobLeadsCsv`), 200s with correct `Content-Type`/`Content-Disposition` on `done`. |
| 5 | CSV cells starting with `=+-@` are sanitized against formula injection | VERIFIED | `lib/csv/sanitize.ts:8-14` `sanitizeCsvCell` — prefixes (never strips) any value starting with `=`,`+`,`-`,`@` with a leading `'`. `tests/unit/lib/csv/sanitize.test.ts` (7 tests): one per dangerous character, a mid-string non-trigger case (`"A+ Auto Repair"` unchanged), and empty-string. `tests/integration/jobs/export.test.ts` proves the mitigation survives the full join+CSV-generation pipeline against a real `=SUM(A1:A9)` fixture, asserting `csv.toContain("'=SUM(A1:A9)")` and `csv.not.toMatch(/[^']=SUM\(A1:A9\)/)` (no unescaped occurrence anywhere in the output). |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/jobs/checkpoint.ts` (WATCHDOG_MS) | Watchdog threshold constant | VERIFIED | Line 23, `SAFETY_WINDOW_MS * 2` = 500,000ms, documented rationale in comment. |
| `lib/db/jobs.ts` (claimPartialJob) | Atomic conditional claim | VERIFIED | Lines 55-62, single conditional UPDATE...RETURNING, proven race-safe against real DB. |
| `lib/db/jobs.ts` (flagStaleJob) | Atomic conditional stale-flip | VERIFIED | Lines 69-87, single conditional UPDATE...RETURNING, proven against real DB. |
| `app/api/jobs/[id]/route.ts` | GET handler: watchdog + claim + shaped response | VERIFIED | Full Route Handler, real logic, no stub returns. `cursor` deliberately omitted from response (internal detail). |
| `lib/csv/sanitize.ts` | sanitizeCsvCell | VERIFIED | 14 lines, real OWASP prefix mitigation, 7 unit tests. |
| `lib/csv/export.ts` | buildJobLeadsCsv | VERIFIED | Real DB query (INNER JOIN), real stringify() call, explicit column tuple (no raw row spread). |
| `app/api/jobs/[id]/export/route.ts` | GET handler: 404/409/200 CSV response | VERIFIED | Real Route Handler, correct status codes and headers. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `route.ts` GET | `claimPartialJob` | direct call gated by `current.status === 'partial'` | WIRED | Confirmed by unit test asserting exactly-once `after()` scheduling on a won claim. |
| `route.ts` GET | `flagStaleJob` | direct call on every GET before claim check | WIRED | Confirmed by unit test asserting watchdog-flip reflected in response. |
| `route.ts` GET | `runScrapeJob` | `after(() => runScrapeJob(id))`, only on won claim | WIRED | Never awaited synchronously (matches Phase 3's `after()` pattern); confirmed no second `after()` call on lost race. |
| `export/route.ts` GET | `buildJobLeadsCsv` | direct call, gated by `job.status === 'done'` | WIRED | Confirmed by unit test asserting `buildJobLeadsCsv` never called on 409 path. |
| `export.ts` | `sanitizeCsvCell` | applied per untrusted string column before `stringify()` | WIRED | Confirmed against real generated CSV output in integration test, not just isolated unit test. |
| `export.ts` | `leads`/`businesses` tables | Drizzle `.innerJoin(businesses, eq(leads.placeId, businesses.placeId))` | WIRED | Confirmed real join pulls `businesses`' current state over `leads`' own columns. |

### Behavioral Spot-Checks / Full Test Run

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `pnpm vitest run` | 83/83 passed, 20 test files, ~3.6s | PASS |
| Typecheck | `pnpm run typecheck` | Clean, no errors | PASS |
| Lint | `pnpm run lint` | Clean, no output | PASS |
| Concurrent claim race (real DB) | part of full suite — `claimPartialJob.test.ts` | Real `Promise.all` concurrent claim, exactly 1 wins | PASS |
| Stale watchdog flip (real DB) | part of full suite — `flagStaleJob.test.ts` | Real SQL-injected stale `updated_at`, flip confirmed | PASS |
| CSV join + sanitization (real DB) | part of full suite — `export.test.ts` | Real join + real formula-injection fixture sanitized in actual CSV output | PASS |

All of the above were re-run directly by this verifier (not taken from SUMMARY.md claims) — commands executed live against the actual codebase and a real Neon test database, matching the SUMMARY.md-claimed 83/83 and clean typecheck/lint.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| JOB-04 | 04-01-PLAN.md | Atomic-claim continuation on partial-job poll | SATISFIED | `claimPartialJob` + route wiring, real-DB race test |
| JOB-05 | 04-01-PLAN.md | Stale-job watchdog auto-flip to error | SATISFIED | `flagStaleJob` + route wiring, real-DB staleness test |
| JOB-06 | 04-01-PLAN.md | Zero-result vs. error response distinction | SATISFIED | Shaped response `{status, leadsFound, errorReason}`, unit-tested distinctly |
| EXPORT-01 | 04-02-PLAN.md | CSV export joined to current businesses CRM state | SATISFIED | `buildJobLeadsCsv` real INNER JOIN, real-DB integration test |
| EXPORT-02 | 04-02-PLAN.md | Formula-injection sanitization | SATISFIED | `sanitizeCsvCell`, 7 unit tests + real-DB integration proof |

Note: `.planning/REQUIREMENTS.md` still shows these 5 IDs as `[ ]`/"Pending" in its checkbox/status table — this is a documentation-sync gap (the requirements doc wasn't updated when the phase completed), not a functional gap. Recommend updating REQUIREMENTS.md checkboxes as part of phase close-out; not blocking (tracked as informational, not a gap, since the underlying capability is verified working).

### Anti-Patterns Found

None. Grep for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented|coming soon` across all Phase 4 source files (`lib/csv/sanitize.ts`, `lib/csv/export.ts`, `app/api/jobs/[id]/route.ts`, `app/api/jobs/[id]/export/route.ts`, `lib/jobs/checkpoint.ts`, `lib/db/jobs.ts`) returned zero matches. No empty implementations, no hardcoded-empty stub returns, no console.log-only handlers.

### Human Verification Required

None. All 5 truths have concrete automated evidence (real Postgres integration tests for the race-safety/staleness/join/sanitization behaviors that matter most; unit tests with mocked DAL for the route-shaping logic) — no visual, real-time, or external-service-dependent behavior in this phase's scope.

### Gaps Summary

No gaps. All 5 ROADMAP Phase 4 success criteria are genuinely implemented, wired, and tested against real infrastructure where the behavior warrants it (concurrent race, time-based staleness, DB join, and end-to-end sanitization all proven against a real Neon test database rather than asserted by code inspection alone). Full test suite (83/83), typecheck, and lint were independently re-run by this verifier and confirmed green, matching but not merely trusting the SUMMARY.md claims. The only non-blocking observation is that `.planning/REQUIREMENTS.md`'s checkbox/status table for JOB-04/05/06 and EXPORT-01/02 was not updated to reflect completion — a documentation housekeeping item, not a functional deficiency.

---

_Verified: 2026-07-03T15:05:00Z_
_Verifier: Claude (gsd-verifier)_
