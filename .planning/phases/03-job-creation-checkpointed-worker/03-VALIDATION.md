---
phase: 03
slug: job-creation-checkpointed-worker
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-03
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already installed, wired in Phases 1-2) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm vitest run <file>` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | Unit tests: ~5-10s (no real timers/network/DB). Integration tests (03-03 Task 2): requires `TEST_DATABASE_URL` — blocked until Phase 1's env setup lands. |

---

## Sampling Rate

- **After every task commit:** Run `pnpm run typecheck` plus the task's own `pnpm vitest run <file>` where a test file exists
- **After every plan wave:** Run `pnpm vitest run` (full suite, including Phases 1-2's existing tests)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 1 task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 03-01 | 1 | JOB-02, JOB-03 | — | `buildTextQuery` composes category+location correctly; cursor shape `{pageToken, pagesFetched, done}` is well-formed | unit | `pnpm vitest run tests/unit/lib/jobs/checkpoint.test.ts tests/unit/lib/jobs/buildTextQuery.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | JOB-02, JOB-03 | — | Additive migration extends `jobs` (leads_found/cursor/error_reason) without altering shipped columns; `updateJobProgress` writes correctly | structural | `pnpm run typecheck`; migration applies cleanly once Phase 1's DB exists | ❌ W0 (blocked on Phase 1 DB existing to actually run) | ⬜ pending |
| 03-02-T1 | 03-02 | 2 | JOB-02, JOB-03, JOB-07 | T-*-worker-error | Checkpoints after every unit; stops cleanly at the safety window and marks `partial`; a thrown `PlacesApiError` mid-loop results in `status: 'error'` with a safe `errorReason`, never a silently stuck job; real Places-composition glue (`defaultFetchOnePage`) is exercised by at least one test, not only the higher-level `fetchOnePage` injection seam | unit | `pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 03-03-T1 | 03-03 | 3 | SCRAPE-01, JOB-01 | V5 (input validation) | `POST /api/jobs` validates category/location via Zod, inserts a `pending` row, returns `{jobId}` immediately (before the worker runs), schedules the worker via `after()` | unit | `pnpm vitest run tests/unit/app/api/jobs/route.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 03-03-T2 | 03-03 | 3 | JOB-02, JOB-03, JOB-07 | — | Full pipeline against a real test DB + Phase 2 fixtures completes with correct `leads`/`businesses` rows and `done` status; a simulated retry on the same `(jobId, placeId)` produces exactly one `leads` row | integration | `pnpm vitest run tests/integration/jobs/runScrapeJob.test.ts` | ❌ W0 → created this task, **blocked on Phase 1 env setup** | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/lib/jobs/checkpoint.test.ts`, `buildTextQuery.test.ts` (03-01)
- [ ] `tests/unit/lib/jobs/runScrapeJob.test.ts` — including the checkpoint-per-unit, safety-window, error-path, and real-composition-glue cases (03-02)
- [ ] `tests/unit/app/api/jobs/route.test.ts` (03-03)
- [ ] `tests/integration/jobs/runScrapeJob.test.ts` — requires `TEST_DATABASE_URL`; blocked until Phase 1's Neon setup lands (03-03)
- [x] `lib/places/paginate.ts`'s Pitfall 5 fix + regression test — already resolved before this phase's plans were written (commit `4ab1a23`); no new work needed here

---

## Manual-Only Verifications

*All phase behaviors have automated verification* once Phase 1's env setup unblocks the integration tier. No behavior in this phase requires a human to manually click through anything — the only "manual" dependency is the same Neon/Google Cloud setup already tracked as a Phase 1 blocker, not a new manual step this phase introduces.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (4 new unit/integration test files, all mapped to a specific task above)
- [x] No watch-mode flags (`pnpm vitest run`, never `pnpm vitest` alone)
- [x] Feedback latency < 1 task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-03 (autonomous/yolo mode — no separate human sign-off gate configured for this project)
