---
phase: 02
slug: places-api-scrape-client
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already installed, wired in Phase 1) |
| **Config file** | `vitest.config.ts` (Plan 02-01 Task 3 adds the `DATABASE_URL` fallback fix) |
| **Quick run command** | `pnpm vitest run <file>` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~5-10 seconds (all pure/fixture-based, no network, no DB, no real timers) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm run typecheck` plus the task's own `pnpm vitest run <file>` where a test file exists
- **After every plan wave:** Run `pnpm vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 1 task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | SCRAPE-02, SCRAPE-04 | — | `rawPlaceSchema`/`textSearchResponseSchema` validate at the response boundary; `businessStatus` is `.optional()`, never defaulted (Pitfall 3) | unit | `pnpm vitest run tests/unit/lib/places/schema.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | SCRAPE-02, SCRAPE-04, SCRAPE-05 | — | Fixtures (Toronto, Lima, closed-business, empty) + shared `mockFetch` helper exist and are schema-accurate | structural | `pnpm run typecheck` | ❌ W0 → created this task | ⬜ pending |
| 02-01-T3 | 02-01 | 1 | — (test-infra) | — | `vitest.config.ts` `DATABASE_URL` fallback doesn't mask a real value when `TEST_DATABASE_URL` is set; only supplies a placeholder when absent | structural | `pnpm run typecheck`; verified indirectly via 02-03's `client.test.ts` loading successfully | ✅ Wave 1 | ⬜ pending |
| 02-02-T1 | 02-02 | 1 | SCRAPE-03 | — | `inferLocale("Toronto, ON")` → `en`/`CA`; `inferLocale("Lima, Peru")` → `es`/`PE`; unmatched → default | unit | `pnpm vitest run tests/unit/lib/places/locale.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 02-02-T2 | 02-02 | 1 | SCRAPE-06 | — | `fetchNextPage` waits before first attempt, retries token-not-yet-active errors up to `maxAttempts`, rethrows other errors and exhausted-retry errors (no silent swallowing) | unit | `pnpm vitest run tests/unit/lib/places/paginate.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 02-03-T1 | 02-03 | 2 | SCRAPE-02 | T-*-01 (API key leak) | `searchTextPlaces` sends `websiteUri`+`businessStatus` in the field mask on the same call; `PlacesApiError` excludes the request/API-key header from its error surface | unit | `pnpm vitest run tests/unit/lib/places/client.test.ts` | ❌ W0 → created this task | ⬜ pending |
| 02-04-T1 | 02-04 | 2 | SCRAPE-04, SCRAPE-05 | — | Closed businesses (`CLOSED_PERMANENTLY`/`CLOSED_TEMPORARILY`) map to `null`; `businessStatus`-absent places are still included (Pitfall 3 regression case, exclusion set not allowlist); missing `websiteUri` → `tier: 'tier-1'`, `tierReason: 'no website found on Google'` | unit | `pnpm vitest run tests/unit/lib/places/mapPlaceToLead.test.ts` | ❌ W0 → created this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/places/text-search-toronto-page1.json` — hand-authored, schema-accurate (02-01 Task 2)
- [ ] `tests/fixtures/places/text-search-lima-page1.json` — Spanish content, exercises SCRAPE-03's real intent (02-01 Task 2)
- [ ] `tests/fixtures/places/text-search-with-closed-business.json` — includes a `CLOSED_PERMANENTLY` place and a `businessStatus`-absent place (02-01 Task 2)
- [ ] `tests/fixtures/places/text-search-empty.json` — zero-result response shape (02-01 Task 2)
- [ ] `tests/helpers/mockFetch.ts` — shared fetch-stub helper (02-01 Task 2)
- [ ] `tests/unit/lib/places/{schema,locale,paginate,client,mapPlaceToLead}.test.ts` — five new test files, none exist yet (02-01/02-02/02-03/02-04)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.* This phase is deliberately designed (per RESEARCH.md Pattern 1 — dependency-injected I/O) so every requirement is testable via fixtures and stubs with no live Places API key, no DB, and no real timers. The one real-key-dependent step (diffing a hand-authored fixture against one real captured response) is an explicitly deferred nice-to-have, not a phase-gating manual verification — see RESEARCH.md Code Example 6 note and Assumptions Log A4.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (4 fixtures, 1 helper, 5 test files — all mapped to a specific task above)
- [x] No watch-mode flags (`pnpm vitest run`, never `pnpm vitest` alone)
- [x] Feedback latency < 1 task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-02 (autonomous/yolo mode — no separate human sign-off gate configured for this project)
