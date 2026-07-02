---
phase: 01
slug: data-foundation-security
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (not yet installed — Wave 1 installs it) |
| **Config file** | `vitest.config.ts` (created in Wave 1) |
| **Quick run command** | `pnpm vitest run <file>` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~15-30 seconds (integration tests hit a real Neon test branch) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm run typecheck` (every task) plus the task's own `pnpm vitest run <file>` where a test file exists
- **After every plan wave:** Run `pnpm vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 1 task (no task goes more than one step without a typecheck or test signal)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01-01 | 1 | SEC-01 | — | Scaffold merge preserves existing `.claude/`/`docs/`/`tests/` (no destructive overwrite) | structural | `git diff --quiet -- .claude docs tests` | ✅ | ⬜ pending |
| 01-01-T2 | 01-01 | 1 | SEC-01 | — | `server-only`/`vitest` legitimacy reviewed before install (checkpoint:human-verify) | manual | — | N/A | ⬜ pending |
| 01-01-T3 | 01-01 | 1 | SEC-01 | — | pnpm scripts + Vitest wired | structural | `pnpm run typecheck` | ✅ Wave 1 | ⬜ pending |
| 01-02-T1 | 01-02 | 2 | SEC-01 | — | `DATABASE_URL`/`TEST_DATABASE_URL` resolved via Neon, never committed | structural | `git check-ignore .env` | ✅ Wave 2 | ⬜ pending |
| 01-02-T2 | 01-02 | 2 | SEC-02 | T-02-01 | Google Cloud API key restricted to Places API only | manual + automated negative check | curl positive (Places) + curl negative (Geocoding, expect `REQUEST_DENIED`) | N/A — external console action | ⬜ pending |
| 01-02-T3 | 01-02 | 2 | SEC-01 | — | `lib/env.ts` throws on missing/malformed secrets; no `NEXT_PUBLIC_*` prefix on server secrets | unit | `pnpm vitest run tests/lib/env.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 01-03-T1 | 01-03 | 3 | DATA-01/02/03 | — | `jobs`/`leads`/`businesses` schema, Drizzle client, drizzle-kit config | structural | `pnpm run typecheck` | ✅ Wave 3 | ⬜ pending |
| 01-03-T2 | 01-03 | 3 | DATA-01/02/03 | — | First migration generated and applied (dev DB); real insert/select round-trip | integration | `drizzle-kit generate && drizzle-kit migrate` (dev); round-trip proven transitively by 01-05 against `TEST_DATABASE_URL` | ❌ W0 → created this task | ⬜ pending |
| 01-04-T1 | 01-04 | 4 | DATA-01/02 | — | `jobs.ts` CRUD — `createJob`/`getJob` round-trip | structural | `pnpm run typecheck` | ✅ Wave 4 | ⬜ pending |
| 01-04-T2 | 01-04 | 4 | DATA-01/02 | T-04-01, T-04-02 | `upsertBusiness` omits `notes`/`contacted`/`firstSeenAt` from `onConflictDoUpdate.set`; `insertLeadSnapshot` uses `onConflictDoNothing` | structural (grep) + typecheck | `pnpm run typecheck`; `! grep -A 15 'onConflictDoUpdate' lib/db/businesses.ts \| grep -E '^\s*(notes\|contacted\|firstSeenAt):'` | ✅ Wave 4 | ⬜ pending |
| 01-05-T1 | 01-05 | 5 | DATA-01, DATA-03 | — | Upsert preserves CRM fields across re-sighting; place content persists and is readable | integration | `pnpm vitest run tests/db/businesses.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 01-05-T2 | 01-05 | 5 | DATA-02 | — | Idempotent per-job snapshot insert; `businesses` join proves the identity/sighting split | integration | `pnpm vitest run tests/db/leads.test.ts` | ❌ W0 → created this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` + `vitest.config.ts` — no test framework exists yet (Wave 1, Task 3)
- [ ] `tests/lib/env.test.ts` — covers SEC-01 (Wave 2, Task 3)
- [ ] `tests/db/businesses.test.ts` — covers DATA-01, DATA-03 (Wave 5, Task 1)
- [ ] `tests/db/leads.test.ts` — covers DATA-02 (Wave 5, Task 2)
- [ ] Integration-test database strategy decided: dedicated Neon test branch (`TEST_DATABASE_URL`), injected only into the Vitest process — resolved in Wave 2, Task 1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google Cloud API key restricted to Places API only | SEC-02 | External account-console action — no API/CLI surface for Cloud Console key restriction is exercised by this plan; the automated curl checks in 01-02-T2 verify the *effect* (restriction is in place) but the *action itself* (clicking "Restrict key" in Console) is not automatable | 1. Open Google Cloud Console → APIs & Services → Credentials → the Places API key. 2. Under "API restrictions," select "Restrict key" and choose Places API (New) only. 3. Save. 4. Run the positive check: `curl` a real Places Text Search call with the key — expect success. 5. Run the negative check: `curl` a Geocoding API call with the same key — expect `REQUEST_DENIED`. |
| `server-only`/`vitest` package-legitimacy human review | SEC-01 (supply chain) | `gsd-tools query package-legitimacy check` flagged both `[SUS]` ("too-new" heuristic) — a human judgment call on well-known-but-recently-versioned packages, not something the executor should auto-approve silently | Review `01-RESEARCH.md`'s package-legitimacy audit table; confirm `server-only` (Vercel/Next.js team) and `vitest` (Vite team) are legitimate despite the heuristic flag, then approve the checkpoint in 01-01 Task 2. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (2 tasks are manual-only by nature — SEC-02 console action, package-legitimacy human review — documented above, not silently skipped)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every non-manual task runs at least `pnpm run typecheck`)
- [x] Wave 0 covers all MISSING references (vitest install, 3 new test files, DB strategy decision — all mapped to a specific wave/task above)
- [x] No watch-mode flags (`pnpm vitest run`, never `pnpm vitest` alone)
- [x] Feedback latency < 1 task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-02 (autonomous/yolo mode — no separate human sign-off gate configured for this project)
