---
phase: 04-job-monitoring-resumability-export
plan: 01
subsystem: job-monitoring-resumability
tags: [jobs, watchdog, atomic-claim, route-handler, next-server-after]
dependency-graph:
  requires:
    - lib/db/jobs.ts (getJob, createJob, updateJobProgress — Phase 1/3, unchanged)
    - lib/jobs/checkpoint.ts (SAFETY_WINDOW_MS, JobCursor, initialCursor — Phase 3, unchanged)
    - lib/jobs/runScrapeJob.ts (runScrapeJob — Phase 3, unchanged)
  provides:
    - lib/jobs/checkpoint.ts WATCHDOG_MS
    - lib/db/jobs.ts claimPartialJob(jobId)
    - lib/db/jobs.ts flagStaleJob(jobId, now?)
    - app/api/jobs/[id]/route.ts GET handler
  affects:
    - Phase 5's future job-progress poller (consumes this GET contract)
    - 04-02 (export route sits alongside this same [id] route family)
tech-stack:
  added: []
  patterns:
    - "Atomic conditional UPDATE ... WHERE status=... RETURNING * for race-safe state transitions (no app-level locks)"
    - "Watchdog-on-read: staleness flip piggybacks on existing poll traffic, no cron/scheduler"
    - "Explicitly shaped API response object (never a raw DB row spread) to prevent internal-field leakage"
key-files:
  created:
    - app/api/jobs/[id]/route.ts
    - tests/integration/jobs/claimPartialJob.test.ts
    - tests/integration/jobs/flagStaleJob.test.ts
    - "tests/unit/app/api/jobs/[id]/route.test.ts"
  modified:
    - lib/jobs/checkpoint.ts
    - lib/db/jobs.ts
decisions:
  - "WATCHDOG_MS = SAFETY_WINDOW_MS * 2 (500_000ms, ~8.3 min) — clear multiple of the safety window so a legitimately slow invocation is never false-flagged"
  - "Task's action bundled test-writing and implementation as one unit (plan frontmatter is type: execute, not type: tdd) — committed as two feat commits (one per task), not separate RED/GREEN/REFACTOR commits"
metrics:
  duration: ~25min
  completed: 2026-07-03
status: complete
---

# Phase 4 Plan 1: Watchdog + Atomic Claim + GET /api/jobs/:id Summary

Built the atomic-claim continuation trigger (JOB-04), stale-job watchdog (JOB-05), and
zero-result-vs-error response contract (JOB-06) on top of Phase 3's shipped `runScrapeJob`,
composing two new DAL primitives and the first dynamic-segment Route Handler in the codebase.

## What Was Built

**Task 1 — `WATCHDOG_MS` + `claimPartialJob` + `flagStaleJob`:**
- `lib/jobs/checkpoint.ts`: added `export const WATCHDOG_MS = SAFETY_WINDOW_MS * 2` (500,000ms).
- `lib/db/jobs.ts`: added `claimPartialJob(jobId)` — a single conditional
  `UPDATE jobs SET status='running', updated_at=now() WHERE id=$1 AND status='partial'
  RETURNING *`, relying on Postgres's own row-level locking to serialize concurrent claims.
- `lib/db/jobs.ts`: added `flagStaleJob(jobId, now = Date.now)` — a single conditional
  `UPDATE jobs SET status='error', error_reason=..., updated_at=now() WHERE id=$1 AND status
  IN ('pending','running') AND updated_at < now() - WATCHDOG_MS RETURNING *`.
- `tests/integration/jobs/claimPartialJob.test.ts` (2 tests) and
  `tests/integration/jobs/flagStaleJob.test.ts` (3 tests) — run against the real Neon test
  database (`TEST_DATABASE_URL`, injected via `.env.test` per `vitest.config.ts`), proving:
  the concurrent-race claim guarantee via real `Promise.all` (Postgres row locking, no
  simulated timing), the stale-flip via a directly SQL-injected fake `updated_at` (no real
  wait), the recent-job-untouched case, and that neither function touches a row outside its
  own disjoint status set (`partial` for the claim, `pending`/`running` for the watchdog).

**Task 2 — `GET /api/jobs/[id]` route:**
- `app/api/jobs/[id]/route.ts`: the codebase's first dynamic Route Handler segment. Reads
  `const { id } = await params` (Next.js 16's `params` is a `Promise`), 404s on a missing job,
  runs `flagStaleJob` before the claim check, claims a `partial` job via `claimPartialJob` and
  schedules `after(() => runScrapeJob(id))` only on a won claim (never awaited synchronously),
  and returns an explicitly shaped response object (`id, status, category, location,
  leadsFound, errorReason, createdAt, updatedAt`) that never spreads the raw DB row — so
  `cursor` (the internal Google `pageToken`) can never leak.
- `tests/unit/app/api/jobs/[id]/route.test.ts` (6 tests, mocked DAL + `after`): 404 on missing
  job, watchdog-flip reflected in response, claim-and-schedule-continuation-exactly-once on a
  won race, no second `after()` call on a lost race, `{status:'done', leadsFound:0}`
  distinctly present from an error response, and `cursor` absent from the response regardless
  of status.

## Verification

- `pnpm run typecheck` — clean, both tasks.
- `pnpm vitest run tests/integration/jobs/claimPartialJob.test.ts` — 2/2 passed (real Neon test DB).
- `pnpm vitest run tests/integration/jobs/flagStaleJob.test.ts` — 3/3 passed (real Neon test DB).
- `pnpm vitest run "tests/unit/app/api/jobs/[id]/route.test.ts"` — 6/6 passed.
- Full suite (`pnpm vitest run`) — 72/72 passed, 17 test files, including all Phase 1-3 tests
  unaffected.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written for both tasks' `<action>` blocks.

### Process Note (not a deviation from behavior, a deviation from strict RED/GREEN sequencing)

The plan's frontmatter is `type: execute` (not `type: tdd`), and each task's `<action>` block
bundles writing the implementation and its tests as one unit rather than specifying separate
RED/GREEN/REFACTOR steps. Both tasks were implemented and tested together, then committed as
a single `feat(04-01): ...` commit per task (two commits total), rather than splitting into
separate `test(...)` (RED) and `feat(...)` (GREEN) commits. All tests were verified to pass
against real infrastructure (real Neon test DB for integration tests, mocked DAL for the unit
test) before committing — behavior is fully proven either way; this only affects commit
granularity, not correctness.

## Auth Gates

None encountered — no new secrets/env vars introduced this plan; `TEST_DATABASE_URL` was
already provisioned via `.env.test` from Phase 1/3.

## Known Stubs

None — all code paths are fully wired (no hardcoded/mocked data flowing to a consumer;
`app/api/jobs/[id]/route.ts` is a real Route Handler, not a placeholder).

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-04-01, T-04-02, T-04-03
all mitigated exactly as designed — atomic claim, watchdog, explicit response shaping). No new
network endpoints, auth paths, or schema changes introduced beyond the plan's stated scope.

## Self-Check: PASSED

- `lib/jobs/checkpoint.ts` exports `WATCHDOG_MS` — FOUND (confirmed via typecheck + test import).
- `lib/db/jobs.ts` exports `claimPartialJob`, `flagStaleJob` — FOUND (confirmed via passing
  integration tests importing them directly).
- `app/api/jobs/[id]/route.ts` exists and exports `GET` — FOUND (confirmed via passing unit
  test importing it directly).
- Commit `cad9930` (Task 1) — FOUND in `git log --oneline`.
- Commit `76e8329` (Task 2) — FOUND in `git log --oneline`.
- No unexpected file deletions in either commit (`git diff --diff-filter=D` empty both times).
