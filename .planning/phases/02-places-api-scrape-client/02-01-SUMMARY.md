---
phase: 02-places-api-scrape-client
plan: 01
subsystem: api
tags: [zod, vitest, google-places-api, testing-infra]

requires:
  - phase: 01-data-foundation-security
    provides: lib/env.ts (DATABASE_URL/PLACES_API_KEY Zod boundary), vitest.config.ts test harness
provides:
  - lib/places/schema.ts (rawPlaceSchema, textSearchResponseSchema, RawPlace, TextSearchResponse)
  - Four schema-accurate fixture JSON files under tests/fixtures/places/
  - tests/helpers/mockFetch.ts (mockFetchOnce fetch-stub helper)
  - vitest.config.ts DATABASE_URL fallback fix (unblocks any test importing lib/env.ts transitively)
affects: [02-03-places-client, 02-04-map-place-to-lead]

tech-stack:
  added: []
  patterns:
    - "Zod validation at every external API response boundary (businessStatus .optional(), never .default())"
    - "Dependency-injected fetch via mockFetchOnce for network-free unit tests"

key-files:
  created:
    - lib/places/schema.ts
    - tests/unit/lib/places/schema.test.ts
    - tests/fixtures/places/text-search-toronto-page1.json
    - tests/fixtures/places/text-search-lima-page1.json
    - tests/fixtures/places/text-search-with-closed-business.json
    - tests/fixtures/places/text-search-empty.json
    - tests/helpers/mockFetch.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "businessStatus is z.enum(...).optional() with no .default(...) — an absent field parses to undefined, never coerced to 'OPERATIONAL' or any closed value (Pitfall 3)"
  - "websiteUri validated as a loose z.string().optional(), not z.url() — lenient parsing of an external API's URI field per 02-RESEARCH.md's own judgment call"
  - "vitest.config.ts DATABASE_URL fallback kept additive (process.env.TEST_DATABASE_URL || placeholder) so Plan 01-05's real-database integration path is unaffected once .env.test exists"

patterns-established:
  - "Fixture JSON files are hand-authored and cross-checked against rawPlaceSchema/textSearchResponseSchema field-by-field, not captured from a live API (no PLACES_API_KEY available yet)"

requirements-completed: [SCRAPE-02, SCRAPE-04]

coverage:
  - id: D1
    description: "lib/places/schema.ts Zod schemas validate the Places API response shape at the boundary, with businessStatus correctly optional (never defaulted)"
    requirement: "SCRAPE-04"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/schema.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Four schema-accurate fixture JSON files (Toronto, Lima, closed-business mix, empty) ready for Plan 02-03's client.test.ts"
    requirement: "SCRAPE-02"
    verification:
      - kind: unit
        ref: "ad-hoc scratch vitest run parsing all four fixtures through textSearchResponseSchema.parse() — all passed, scratch file removed after verification (not a plan deliverable)"
        status: pass
    human_judgment: false
  - id: D3
    description: "tests/helpers/mockFetch.ts exports mockFetchOnce(status, body) matching the Response shape client.ts (Plan 02-03) will call"
    verification: []
    human_judgment: true
    rationale: "No consumer exists yet in this plan (client.ts is Plan 02-03) — structural correctness confirmed by TypeScript typecheck only, not exercised by a running test in this plan"
  - id: D4
    description: "vitest.config.ts DATABASE_URL falls back to a valid Postgres URL when TEST_DATABASE_URL is unset, preventing a module-load-time Zod throw for any future test importing lib/env.ts transitively"
    verification:
      - kind: unit
        ref: "tests/unit/lib/env.test.ts (unaffected, still passes)"
        status: pass
      - kind: other
        ref: "node -e fallback-parses-as-valid-URL check specified in 02-01-PLAN.md Task 3 <verify>"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 1: Places API schema, test fixtures, and vitest DATABASE_URL fix Summary

**Zod validation boundary for Google Places API (New) Text Search responses (`lib/places/schema.ts`), four schema-accurate fixture files, a shared `mockFetchOnce` stub helper, and a `vitest.config.ts` fix so tests importing `lib/env.ts` transitively no longer crash at module-load time.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-02T20:52:xx-04:00 (first commit a1d5350)
- **Completed:** 2026-07-02T20:55:45-04:00 (last commit 5559634)
- **Tasks:** 3 completed
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments
- `lib/places/schema.ts` — `businessStatusSchema`, `rawPlaceSchema`, `textSearchResponseSchema` (Zod), plus `RawPlace`/`TextSearchResponse` inferred types; correctly encodes Pitfall 3 (`businessStatus` optional, never defaulted)
- Four hand-authored, schema-accurate fixture JSON files under `tests/fixtures/places/` covering Toronto (English), Lima (Spanish), a mixed OPERATIONAL/CLOSED_PERMANENTLY/status-absent set, and the empty-results case
- `tests/helpers/mockFetch.ts` — shared `mockFetchOnce(status, body)` fetch-stub helper for Plan 02-03's `client.test.ts`
- `vitest.config.ts`'s `test.env.DATABASE_URL` now falls back to a valid placeholder Postgres URL when `TEST_DATABASE_URL` is unset, removing a landmine that would otherwise crash any test transitively importing `lib/env.ts`

## Task Commits

Each task was committed atomically (Task 1 followed the TDD RED/GREEN cycle):

1. **Task 1 (RED): failing tests for lib/places/schema.ts** - `a1d5350` (test)
2. **Task 1 (GREEN): lib/places/schema.ts implementation** - `99aff8f` (feat)
3. **Task 2: test fixtures + mockFetch helper** - `0ed7d80` (feat)
4. **Task 3: vitest.config.ts DATABASE_URL fallback fix** - `5559634` (fix)

**Plan metadata:** commit created below (docs: complete plan)

## Files Created/Modified
- `lib/places/schema.ts` - Zod schemas (`rawPlaceSchema`, `textSearchResponseSchema`) and inferred types for the Places API Text Search response boundary
- `tests/unit/lib/places/schema.test.ts` - 6 unit tests covering full/minimal/missing-id/absent-businessStatus place cases and present/fully-absent-key response cases
- `tests/fixtures/places/text-search-toronto-page1.json` - 4 English-language places, mixed websiteUri presence, all OPERATIONAL
- `tests/fixtures/places/text-search-lima-page1.json` - 4 Spanish-language places (Lima, Perú addresses), mixed websiteUri presence, all OPERATIONAL
- `tests/fixtures/places/text-search-with-closed-business.json` - one OPERATIONAL, one CLOSED_PERMANENTLY, one with `businessStatus` entirely absent (Pitfall 3 regression fixture)
- `tests/fixtures/places/text-search-empty.json` - `{ "places": [] }`, no `nextPageToken`
- `tests/helpers/mockFetch.ts` - `mockFetchOnce(status, body): typeof fetch` stub helper
- `vitest.config.ts` - `test.env.DATABASE_URL` now falls back to `postgresql://user:pass@localhost:5432/testdb` when `TEST_DATABASE_URL` is unset

## Decisions Made
- `businessStatus` encoded as `.optional()` with no `.default(...)` — the exact mechanism Pitfall 3 requires; an absent field must never be coerced to `'OPERATIONAL'` or any closed value
- `websiteUri` validated as a loose `z.string().optional()` rather than `z.url()` — lenient parsing of a third-party field per the research's own judgment call
- `vitest.config.ts`'s fallback kept additive (`process.env.TEST_DATABASE_URL || placeholder`), not a replacement, so Plan 01-05's real-database integration-test path is unaffected once `.env.test` is eventually provisioned

## Deviations from Plan

None - plan executed exactly as written. One verification-only addition: a temporary scratch test file was created to confirm all four fixture files parse successfully through `textSearchResponseSchema.parse()` (beyond the plan's own `node -e` Task 2 verify command, which only checks `places` is an array) — it was deleted immediately after confirming all four fixtures pass, and is not part of this plan's committed deliverables.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. `.env.test`/real `PLACES_API_KEY` provisioning remains blocked per Phase 1's existing checkpoint (01-02-SUMMARY.md) and is not required for this plan or for Plan 02-03/02-04's fixture-based test suites.

## Next Phase Readiness

- `lib/places/schema.ts` is ready for Plan 02-03 (`client.ts`) and Plan 02-04 (`mapPlaceToLead.ts`) to import as their shared contract.
- All four fixture files and `tests/helpers/mockFetch.ts` are ready for Plan 02-03's `client.test.ts` to consume directly.
- The `vitest.config.ts` `DATABASE_URL` fallback unblocks Plan 02-03's `client.test.ts` from a module-load-time crash (it imports `lib/env.ts` transitively via `client.ts`'s `import { env } from '@/lib/env'`).
- No blockers for Wave 2 (Plans 02-03/02-04, which depend on this plan per `depends_on`).

---
*Phase: 02-places-api-scrape-client*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 9 created/modified files confirmed present on disk; all 4 task commits (a1d5350, 99aff8f, 0ed7d80, 5559634) confirmed present in git log.
