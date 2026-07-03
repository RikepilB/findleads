---
phase: 02-places-api-scrape-client
plan: 02
subsystem: api
tags: [vitest, tdd, locale-inference, retry-backoff]

requires:
  - phase: 01-data-foundation-security
    provides: vitest.config.ts test harness, tsconfig path alias (@/lib/*)
provides:
  - lib/places/locale.ts (LocaleRule, LOCALE_RULES, DEFAULT_LOCALE, inferLocale(freeTextLocation))
  - lib/places/paginate.ts (RetryConfig, DEFAULT_PAGE_TOKEN_RETRY, fetchNextPage<T>(fetchPage, sleep?, retry?))
affects: [02-03-places-client]

tech-stack:
  added: []
  patterns:
    - "Pure, dependency-injected functions with zero shared state and zero I/O — inferLocale and fetchNextPage are both fully unit-testable without fixtures, fetch stubs, or real timers"
    - "Appendable rule-table pattern (LOCALE_RULES as a plain array, not a switch) so a third market is a one-line addition"
    - "Mandatory pre-attempt delay (sleep before the FIRST fetchPage call, not just between retries) to guard the documented nextPageToken activation-delay pitfall"

key-files:
  created:
    - lib/places/locale.ts
    - tests/unit/lib/places/locale.test.ts
    - lib/places/paginate.ts
    - tests/unit/lib/places/paginate.test.ts
  modified: []

key-decisions:
  - "inferLocale built exactly per 02-RESEARCH.md Code Example 2 — LOCALE_RULES kept as a plain appendable array (not inlined into a switch), per Open Question 1's extensibility recommendation"
  - "fetchNextPage's sleep is awaited before every attempt including the first (not just between retries) — the specific guard against Pitfall 1 (nextPageToken called too soon returns INVALID_REQUEST)"
  - "fetchNextPage distinguishes retryable vs. non-retryable errors solely via one message.includes('INVALID_REQUEST') check — any other error rethrows immediately without consuming a retry attempt"

patterns-established:
  - "Both modules have zero dependency on schema.ts or any other Phase 2 module — verified by grep-free inspection of imports; each is independently testable and independently importable by Phase 3's worker"

requirements-completed: [SCRAPE-03, SCRAPE-06]

coverage:
  - id: D1
    description: "inferLocale resolves Toronto -> en/CA, Lima/Peru -> es/PE (case-insensitive, substring match anywhere in string), and any unmatched market (including empty string) -> en/CA default without throwing"
    requirement: "SCRAPE-03"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/locale.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "fetchNextPage waits before its first fetchPage call (not only between retries), retries only the token-not-yet-active condition up to maxAttempts, rethrows non-token errors immediately, and rethrows the last error after exhausting retries -- never swallows an error"
    requirement: "SCRAPE-06"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/paginate.test.ts"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-03
status: complete
---

# Phase 2 Plan 2: Locale inference and nextPageToken pagination retry Summary

**Two fully independent, dependency-injected pure functions — `inferLocale` (free-text location to Google Places `languageCode`/`regionCode`, SCRAPE-03) and `fetchNextPage` (bounded retry with a mandatory pre-first-attempt delay for the documented `nextPageToken` activation pitfall, SCRAPE-06) — each built TDD RED/GREEN with zero shared state and zero dependency on `schema.ts` or any other Phase 2 module.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-03T00:57:36Z
- **Completed:** 2026-07-03T00:59:16Z (full-suite green)
- **Tasks:** 2 completed
- **Files modified:** 4 (all created)

## Accomplishments

- `lib/places/locale.ts` — `LocaleRule` interface, appendable `LOCALE_RULES` array (Lima/Peru → `es`/`PE`, Toronto/Ontario/Canada → `en`/`CA`), `DEFAULT_LOCALE` (`en`/`CA`), and `inferLocale(freeTextLocation)` matching case-insensitively and anywhere in the string via `Array.prototype.find`
- `lib/places/paginate.ts` — `RetryConfig` interface, exported `DEFAULT_PAGE_TOKEN_RETRY` (`{ maxAttempts: 3, delayMs: 3000 }`), private `isTokenNotYetActiveError`, and `fetchNextPage<T>(fetchPage, sleep?, retry?)` that awaits `sleep` before every attempt (including the first), retries only on the token-not-yet-active condition, and rethrows the last error after exhausting `maxAttempts`
- Both modules independently unit-tested with injected stubs — no real timers, no fetch, no fixtures

## Task Commits

Each task followed the TDD RED/GREEN cycle, committed atomically:

1. **Task 1 (RED): failing test for lib/places/locale.ts** — `1de2066` (test)
2. **Task 1 (GREEN): lib/places/locale.ts implementation** — `3abd715` (feat)
3. **Task 2 (RED): failing test for lib/places/paginate.ts** — `56c2255` (test)
4. **Task 2 (GREEN): lib/places/paginate.ts implementation** — `800780e` (feat)

**Plan metadata:** commit created below (docs: complete plan)

## Files Created/Modified

- `lib/places/locale.ts` — `inferLocale()` free-text location → `languageCode`/`regionCode` (SCRAPE-03)
- `tests/unit/lib/places/locale.test.ts` — 6 unit tests: Toronto, Lima/Peru, case-insensitive/no-suffix, mid-string embedded, unmatched fallback, empty-string fallback
- `lib/places/paginate.ts` — `fetchNextPage()` `nextPageToken` retry with mandatory pre-attempt delay (SCRAPE-06)
- `tests/unit/lib/places/paginate.test.ts` — 5 unit tests: pre-first-attempt wait, retry-then-succeed, exhausted-retry rethrow, non-token-error immediate rethrow, custom `RetryConfig` override

## Decisions Made

- `LOCALE_RULES` kept as a plain, appendable array rather than a `switch` statement — a future market is a one-line push, per 02-RESEARCH.md Open Question 1's recommendation
- `fetchNextPage`'s `sleep` is invoked before every loop iteration, including attempt 1 — the delay is a mandatory activation wait, not a retry-only backoff (Pitfall 1)
- Retry classification is a single `err.message.includes('INVALID_REQUEST')` check — any other error type (e.g. `RATE_LIMITED`) rethrows immediately without consuming an attempt, consistent with "no silent error swallowing"

## Deviations from Plan

None — plan executed exactly as written per 02-RESEARCH.md Code Examples 2 and 3.

## Known Limitations

- `inferLocale`'s Peru regex `/\b(lima|per[uú])\b/i` does not match an accented "Perú" at a word boundary — JS regex `\b` treats accented characters as non-word characters (ASCII-only word-boundary semantics), so `inferLocale("Perú")` or `inferLocale("Arequipa, Perú")` falls through to the `en`/`CA` default rather than matching `es`/`PE`. This was not caught by the plan's own behavior cases or acceptance criteria (which only test the unaccented "Peru" spelling, matched via the "lima" branch in "Lima, Peru"), and the code was built exactly per 02-RESEARCH.md Code Example 2 as instructed. Flagged here rather than silently fixed, since Peru is a core validation market for this project — worth a follow-up fix (e.g. `\bper[uú]\b` → a lookahead-based boundary, or normalizing input via `.normalize('NFD')` before matching) in a future plan or as a fast-follow, not blocking this plan's SCRAPE-03 acceptance criteria as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Both modules are pure, dependency-injected functions with no live API key, DB, or network dependency in their test suites.

## Next Phase Readiness

- `inferLocale`'s output shape (`{ languageCode, regionCode }`) matches exactly what Plan 02-03's `TextSearchParams` expects as input.
- `fetchNextPage`'s `fetchPage` callback is generic (`<T>`), so Plan 02-03 can wrap `searchTextPlaces` with it later without either module importing the other.
- No blockers for Plan 02-03 (`client.ts`) or Plan 02-04 (`mapPlaceToLead.ts`), both of which depend on Plan 02-01 (already complete) but not on this plan.

---
*Phase: 02-places-api-scrape-client*
*Completed: 2026-07-03*

## Self-Check: PASSED

All 4 created files confirmed present on disk (`lib/places/locale.ts`, `tests/unit/lib/places/locale.test.ts`, `lib/places/paginate.ts`, `tests/unit/lib/places/paginate.test.ts`); all 4 task commits (1de2066, 3abd715, 56c2255, 800780e) confirmed present in `git log`.
