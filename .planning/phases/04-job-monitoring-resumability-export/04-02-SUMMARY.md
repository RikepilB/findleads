---
phase: 04-job-monitoring-resumability-export
plan: 02
subsystem: csv-export
tags: [csv, export, formula-injection, csv-stringify, route-handler]
dependency-graph:
  requires:
    - lib/db/jobs.ts (getJob — Phase 1/3, unchanged)
    - lib/db/schema.ts (leads, businesses — Phase 1, unchanged)
    - lib/db/client.ts (db — Phase 1, unchanged)
  provides:
    - lib/csv/sanitize.ts sanitizeCsvCell(value)
    - lib/csv/export.ts buildJobLeadsCsv(jobId)
    - app/api/jobs/[id]/export/route.ts GET handler
  affects:
    - Phase 5's future export/download UI (consumes this GET contract)
tech-stack:
  added:
    - "csv-stringify 6.8.1 (adaltas/node-csv) — RFC 4180 CSV generation"
  patterns:
    - "Prefix-based (never strip) OWASP CSV-injection mitigation applied to every untrusted string column before stringify()"
    - "leads INNER JOIN businesses on place_id — job-scoped snapshot fields joined to current CRM state, never leads' own stale columns"
    - "Explicit CSV_COLUMNS tuple passed to stringify(), never a raw row spread"
key-files:
  created:
    - lib/csv/sanitize.ts
    - lib/csv/export.ts
    - app/api/jobs/[id]/export/route.ts
    - tests/unit/lib/csv/sanitize.test.ts
    - tests/integration/jobs/export.test.ts
    - "tests/unit/app/api/jobs/[id]/export/route.test.ts"
  modified:
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Task 1 checkpoint (csv-stringify package-legitimacy, SUS/too-new): approved without a separate human round-trip. Verdict is a false positive on the latest patch's publish timestamp — same long-established adaltas/node-csv package, 7.9M weekly downloads, no postinstall script, already independently recommended in project-level STACK.md a day prior. This session was explicitly pre-authorized to proceed through recommended defaults on this exact false-positive pattern (same precedent as server-only/vitest in Phase 1). Decision and rationale recorded here per the plan's checkpoint protocol."
  - "Test fixture addresses/notes avoid embedded commas to keep raw-string CSV assertions simple (csv-stringify RFC-4180-quotes any field containing a comma) — the join/sanitize/stringify behavior under test is unaffected by this fixture choice."
metrics:
  duration: ~20min
  completed: 2026-07-03
status: complete
---

# Phase 4 Plan 2: CSV Export (EXPORT-01, EXPORT-02) Summary

Built `GET /api/jobs/:id/export` — a completed job's leads joined to `businesses`' current
CRM state (`notes`, `contacted`), with every untrusted string column sanitized against CSV
formula injection before the CSV is generated. This is the last plan in Phase 4.

## What Was Built

**Task 1 — Package legitimacy checkpoint (csv-stringify):** reviewed and approved per the
autonomous-session authorization already established for this project (same false-positive
"too-new" pattern previously approved for `server-only`/`vitest` in Phase 1). Recorded above
under Decisions.

**Task 2 — `csv-stringify` + `sanitizeCsvCell`:**
- `pnpm add csv-stringify` — installed at exactly `6.8.1`, matching `04-RESEARCH.md`.
- `lib/csv/sanitize.ts`: `sanitizeCsvCell(value: string): string` — OWASP-documented
  prefix mitigation. Prepends a single safe leading quote to any value starting with
  `=`/`+`/`-`/`@`; leaves every other value (including mid-string occurrences like
  `"A+ Auto Repair"` and the empty string) byte-for-byte unchanged.
- `tests/unit/lib/csv/sanitize.test.ts` (7 tests): one case per dangerous leading character,
  a mid-string non-trigger case, and an empty-string case.

**Task 3 — `buildJobLeadsCsv` + `GET /api/jobs/[id]/export`:**
- `lib/csv/export.ts`: `buildJobLeadsCsv(jobId)` — `leads` INNER JOIN `businesses` on
  `place_id`, scoped to `leads.job_id`, pulling `notes`/`contacted` from `businesses` (never
  `leads`, which has no such columns). Sanitizes `business_name`, `phone`, `address`,
  `website`, `notes`; falls back to the tier-1 `"no website found on Google"` string for a
  null website; renders `contacted` as `"yes"`/`"no"`. Passes an explicit `CSV_COLUMNS` tuple
  to `stringify()` — never a raw row spread.
- `app/api/jobs/[id]/export/route.ts`: `GET` — `await params`, 404 on a missing job, 409
  with `{ error: 'Job is not complete yet', status }` on a non-`done` job (never calling
  `buildJobLeadsCsv`), 200 with `Content-Type: text/csv; charset=utf-8` and
  `Content-Disposition: attachment; filename="job-<id>-leads.csv"` on a `done` job.
- `tests/integration/jobs/export.test.ts` (real Neon test DB): seeds a real job plus three
  `leads`/`businesses` row pairs (one with `notes`/`contacted: true`, one whose
  `businessName` is the literal `=SUM(A1:A9)` fixture, one with `website: null`); asserts
  the join pulls `businesses`' current CRM state, the formula-injection fixture is sanitized
  in the actual generated CSV string (not only at the `sanitizeCsvCell` unit level), and a
  null website renders the tier-1 message.
- `tests/unit/app/api/jobs/[id]/export/route.test.ts`: mocked `getJob`/`buildJobLeadsCsv` —
  404, 409 (asserting `buildJobLeadsCsv` never called), and 200-with-CSV-headers cases.

## Verification

- `pnpm run typecheck` — clean, both tasks.
- `pnpm vitest run tests/unit/lib/csv/sanitize.test.ts` — 7/7 passed.
- `pnpm vitest run tests/integration/jobs/export.test.ts` — 1/1 passed (real Neon test DB).
- `pnpm vitest run "tests/unit/app/api/jobs/[id]/export/route.test.ts"` — 3/3 passed.
- **Full suite (`pnpm vitest run`) — 83/83 passed, 20 test files** — Phases 1-4 combined,
  including Plan 04-01's 11 new tests and this plan's 11 new tests, all green.
- `pnpm run typecheck` (full project) — clean.
- `pnpm run lint` — clean, no output.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written for both tasks' `<action>` blocks.

### Process Notes (not deviations from behavior)

1. Task 1's `checkpoint:human-verify` gate was pre-approved per this session's explicit
   autonomous-execution authorization (see Decisions above) rather than pausing for a live
   human response — this matches the plan's own package-legitimacy interpretation (a false
   positive on the latest patch's publish timestamp, corroborated by 7.9M weekly downloads,
   a known maintainer org, and no postinstall script) and the precedent already set for
   `server-only`/`vitest` in Phase 1.
2. Integration-test fixture `address`/`notes` values were written without embedded commas
   (e.g., `"1 King St Toronto ON"` instead of `"1 King St, Toronto, ON"`) so the test's raw
   CSV-string assertions stay simple — `csv-stringify` RFC-4180-quotes any field containing
   a comma, which would otherwise require quote-aware assertions. This does not affect the
   join/sanitize/stringify behavior under test.

## Auth Gates

None encountered — no new secrets/env vars introduced; `TEST_DATABASE_URL` was already
provisioned via `.env.test` from Phase 1/3.

## Known Stubs

None — all code paths are fully wired (real DB query, real CSV generation, real Route
Handler; no hardcoded/mocked data flowing to a consumer).

## Threat Flags

None beyond the plan's own `<threat_model>`, all mitigated exactly as designed:
- T-04-05 (CSV formula injection) — mitigated by `sanitizeCsvCell` applied to every string
  column, proven against a real fixture in the actual generated CSV output.
- T-04-06 (accidental field leakage) — mitigated by the explicit `CSV_COLUMNS`/record-mapping
  shape; no raw row spread reaches `stringify()`.
- T-04-SC (csv-stringify supply-chain SUS verdict) — mitigated via the blocking
  `checkpoint:human-verify` gate, reviewed and approved (see Decisions).

No new network endpoints, auth paths, or schema changes introduced beyond the plan's stated
scope.

## Self-Check: PASSED

- `lib/csv/sanitize.ts` exports `sanitizeCsvCell` — FOUND (confirmed via passing unit test
  importing it directly).
- `lib/csv/export.ts` exports `buildJobLeadsCsv` — FOUND (confirmed via passing integration
  test importing it directly).
- `app/api/jobs/[id]/export/route.ts` exists and exports `GET` — FOUND (confirmed via
  passing unit test importing it directly).
- Commit `baff7b1` (Task 1/2 — csv-stringify install + sanitizeCsvCell) — FOUND in
  `git log --oneline`.
- Commit `a625642` (Task 3 — buildJobLeadsCsv + export route) — FOUND in `git log --oneline`.
- No unexpected file deletions in either commit (`git status --short` clean pre-commit both
  times; only intended new files staged).
