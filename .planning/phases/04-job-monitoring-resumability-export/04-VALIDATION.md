---
phase: 04
slug: job-monitoring-resumability-export
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-03
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.9 (already installed, wired in Phases 1-3) |
| **Config file** | `vitest.config.ts` (unchanged by this phase) |
| **Quick run command** | `pnpm vitest run <file>` |
| **Full suite command** | `pnpm vitest run` (or `pnpm test -- --run`) |
| **Estimated runtime** | Unit tests: ~5-10s (no real timers/network/DB). Integration tests: run against the real `TEST_DATABASE_URL` Neon database, already available (confirmed via Phase 3's own passing integration tests). No test in this phase waits out a real multi-minute watchdog window or simulates a race via `setTimeout` staggering — staleness is proven via direct SQL timestamp injection and the claim race via real `Promise.all` concurrency against Postgres row locking. |

---

## Sampling Rate

- **After every task commit:** Run `pnpm run typecheck` plus the task's own `pnpm vitest run <file>` where a test file exists
- **After every plan wave:** Run `pnpm vitest run` (full suite, including Phases 1-3's existing tests)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 1 task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | JOB-04, JOB-05 | T-04-01, T-04-02 | `claimPartialJob` claims a `partial` row exactly once under a real concurrent race; `flagStaleJob` flips a stale `pending`/`running` job to `error` with a human-readable reason and leaves a recent job untouched | integration | `pnpm vitest run tests/integration/jobs/claimPartialJob.test.ts`; `pnpm vitest run tests/integration/jobs/flagStaleJob.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 04-01-T2 | 04-01 | 1 | JOB-04, JOB-05, JOB-06 | T-04-01, T-04-02, T-04-03 | `GET /api/jobs/:id` 404s on a missing job; reflects a watchdog flip; schedules `after(() => runScrapeJob(id))` exactly once on a won claim (never awaited) and not again on a lost race; a `{status:'done', leadsFound:0}` response is distinct from an `error` response; response never contains `cursor` | unit | `pnpm vitest run "tests/unit/app/api/jobs/[id]/route.test.ts"` | ❌ W0 → created this task | ⬜ pending |
| 04-02-T2 | 04-02 | 1 | EXPORT-02 | T-04-05 | `sanitizeCsvCell` prefixes values with a leading `=`/`+`/`-`/`@` and leaves other values (including mid-string occurrences and the empty string) byte-for-byte unchanged | unit | `pnpm vitest run tests/unit/lib/csv/sanitize.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 04-02-T3 | 04-02 | 1 | EXPORT-01, EXPORT-02 | T-04-05, T-04-06 | `buildJobLeadsCsv` joins `leads`→`businesses` on `place_id` scoped to `job_id`, includes current `notes`/`contacted`; a formula-injection fixture (`=SUM(A1:A9)`) is sanitized in the real generated CSV output, not only at the unit level; `website: null` renders as "no website found on Google" | integration | `pnpm vitest run tests/integration/jobs/export.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 04-02-T3 | 04-02 | 1 | EXPORT-01 | — | `GET /api/jobs/:id/export` returns 404/409/200+CSV exactly per status, never calling `buildJobLeadsCsv` on the 404/409 paths | unit | `pnpm vitest run "tests/unit/app/api/jobs/[id]/export/route.test.ts"` | ❌ W0 → created this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note on JOB-06:** this requirement has no dedicated code artifact — Phase 3's shipped
`runScrapeJob` already writes `status: 'done'` regardless of `leadsFound` (verified directly
against the shipped file during research). Its entire deliverable in this phase is the response
*shape* asserted by 04-01-T2's "zero-result done job" test case — do not let this requirement
evaporate for lack of a standalone file; the gate above IS its coverage.

---

## Wave 0 Requirements

- [ ] `tests/integration/jobs/claimPartialJob.test.ts` — none exists yet (04-01)
- [ ] `tests/integration/jobs/flagStaleJob.test.ts` — none exists yet (04-01)
- [ ] `tests/unit/app/api/jobs/[id]/route.test.ts` — none exists yet, including the JOB-06
      zero-result-vs-error response case (04-01)
- [ ] `tests/unit/lib/csv/sanitize.test.ts` — none exists yet (04-02)
- [ ] `tests/integration/jobs/export.test.ts` — none exists yet, including the formula-injection
      fixture case proven in real generated CSV output (04-02)
- [ ] `tests/unit/app/api/jobs/[id]/export/route.test.ts` — none exists yet (04-02)
- [x] `lib/jobs/checkpoint.ts`'s `SAFETY_WINDOW_MS`, `lib/db/jobs.ts`'s `getJob`/
      `updateJobProgress`, `lib/jobs/runScrapeJob.ts`'s `runScrapeJob` — already shipped and
      verified by Phase 3; this phase only adds to them, no Wave 0 gap here

---

## Manual-Only Verifications

*All phase behaviors have automated verification.* The one human-in-the-loop step this phase
introduces is the `csv-stringify` package-legitimacy checkpoint (04-02 Task 1) — a one-time
install-approval gate, not a manual functional-verification step; the CSV output itself is fully
proven by `tests/integration/jobs/export.test.ts` against real seeded data.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (6 new unit/integration test files, all mapped to a
      specific task above)
- [x] No watch-mode flags (`pnpm vitest run`, never `pnpm vitest` alone)
- [x] Bracketed dynamic-route test paths (`[id]`) verified this session to resolve correctly when
      quoted (`pnpm vitest run "tests/unit/app/api/jobs/[id]/route.test.ts"` confirmed against a
      throwaway probe file, then removed) — not a blind trust in the research's suggested command
- [x] Feedback latency < 1 task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-03 (autonomous/yolo mode — no separate human sign-off gate
configured for this project; the `csv-stringify` legitimacy checkpoint remains a real blocking
gate per protocol regardless of yolo mode).
