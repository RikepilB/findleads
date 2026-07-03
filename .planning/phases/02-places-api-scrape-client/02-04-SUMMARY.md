---
phase: 02-places-api-scrape-client
plan: 04
subsystem: api
tags: [zod, vitest, places-api, mapping]

requires:
  - phase: 02-places-api-scrape-client (Plan 02-01)
    provides: "lib/places/schema.ts — RawPlace/TextSearchResponse Zod types, businessStatus as .optional() (never .default())"
provides:
  - "lib/places/mapPlaceToLead.ts — pure mapPlaceToLead(place: RawPlace): MappedLead | null"
  - "Closed-business exclusion (CLOSED_PERMANENTLY/CLOSED_TEMPORARILY) via an exclusion Set, never an inclusion allowlist"
  - "Tier-1 classification with exact literal tierReason 'no website found on Google' when websiteUri is absent"
affects: [phase-3-worker, phase-5-ui-tier-copy]

tech-stack:
  added: []
  patterns:
    - "Exclusion-set filtering (CLOSED_STATUSES.has(...)) instead of inclusion allowlist — prevents over-exclusion when businessStatus is entirely absent (Pitfall 3)"
    - "Immutable mapping — mapPlaceToLead always returns a new object, never mutates the input RawPlace"

key-files:
  created:
    - lib/places/mapPlaceToLead.ts
    - tests/unit/lib/places/mapPlaceToLead.test.ts
  modified: []

key-decisions:
  - "Followed 02-RESEARCH.md Code Example 5 verbatim — no deviations in the mapping/filter/classification logic itself"

patterns-established:
  - "Exclusion-set-not-allowlist is the required pattern for any future filter over an optional enum field that Google omits (rather than defaults) when unknown"

requirements-completed: [SCRAPE-04, SCRAPE-05]

coverage:
  - id: D1
    description: "mapPlaceToLead excludes CLOSED_PERMANENTLY and CLOSED_TEMPORARILY businesses (returns null), while a businessStatus-absent place is still included (Pitfall 3 regression)"
    requirement: SCRAPE-04
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/mapPlaceToLead.test.ts#returns null for a permanently closed business"
        status: pass
      - kind: unit
        ref: "tests/unit/lib/places/mapPlaceToLead.test.ts#returns null for a temporarily closed business"
        status: pass
      - kind: unit
        ref: "tests/unit/lib/places/mapPlaceToLead.test.ts#includes a business whose businessStatus is entirely absent (Pitfall 3 regression)"
        status: pass
      - kind: unit
        ref: "tests/unit/lib/places/mapPlaceToLead.test.ts#includes a business with businessStatus OPERATIONAL"
        status: pass
    human_judgment: false
  - id: D2
    description: "mapPlaceToLead classifies tier-1 with exact tierReason 'no website found on Google' when websiteUri is absent, and null/null when present"
    requirement: SCRAPE-05
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/mapPlaceToLead.test.ts#classifies tier-1 with exact tierReason copy when websiteUri is absent"
        status: pass
      - kind: unit
        ref: "tests/unit/lib/places/mapPlaceToLead.test.ts#sets tier and tierReason to null when websiteUri is present"
        status: pass
    human_judgment: false
  - id: D3
    description: "Optional fields (phone/address/website/rating/reviewCount) default to null (never undefined); businessName defaults to '' when displayName absent; input RawPlace is never mutated"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/mapPlaceToLead.test.ts#maps absent optional fields to null (never undefined) and businessName to empty string when displayName is absent"
        status: pass
      - kind: unit
        ref: "tests/unit/lib/places/mapPlaceToLead.test.ts#does not mutate the input RawPlace object"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 4: mapPlaceToLead Summary

**Pure `mapPlaceToLead` mapper that excludes closed businesses via an exclusion set (never an allowlist) and classifies tier-1 leads with the exact "no website found on Google" signal copy.**

## Performance

- **Duration:** 15 min
- **Completed:** 2026-07-02
- **Tasks:** 1
- **Files modified:** 2 (both new)

## Accomplishments
- `lib/places/mapPlaceToLead.ts` maps a validated `RawPlace` (Plan 02-01's `schema.ts`) to `MappedLead`, returning `null` for `CLOSED_PERMANENTLY`/`CLOSED_TEMPORARILY` businesses (SCRAPE-04)
- Closed-business filter uses an exclusion `Set`, not an inclusion allowlist — the Pitfall 3 regression case (`businessStatus` entirely absent) is correctly included, not dropped
- Tier-1 classification (SCRAPE-05) sets `tier: 'tier-1'` and `tierReason: 'no website found on Google'` (exact literal, asserted via `toBe`, not substring) when `websiteUri` is absent; both `null` when present
- All optional output fields default to `null` (never `undefined`); `businessName` defaults to `''`; input `RawPlace` is never mutated

## Task Commits

TDD task, committed as RED then GREEN:

1. **Task 1 (RED):** add failing test for mapPlaceToLead mapping, closed-business filter, tier-1 classification - `561f4fc` (test)
2. **Task 1 (GREEN):** implement mapPlaceToLead — closed-business filter and tier-1 classification - `1f7a5a9` (feat)

_No REFACTOR commit — implementation matched the RESEARCH.md code example on first pass, nothing to clean up._

## Files Created/Modified
- `lib/places/mapPlaceToLead.ts` - `MappedLead` interface + `mapPlaceToLead(place: RawPlace): MappedLead | null`, `CLOSED_STATUSES` exclusion set
- `tests/unit/lib/places/mapPlaceToLead.test.ts` - 8 unit test cases covering all behaviors in the plan's `<behavior>` block

## Decisions Made
None - followed 02-RESEARCH.md Code Example 5 exactly as written, no deviations.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

Both gates present in git log, in order:
- RED: `561f4fc test(02-04): add failing test for mapPlaceToLead...` — confirmed failing (`Cannot find package '@/lib/places/mapPlaceToLead'`) before the implementation file existed
- GREEN: `1f7a5a9 feat(02-04): implement mapPlaceToLead...` — confirmed all 8 tests pass after implementation

## Issues Encountered
Two ESLint `no-unused-vars` warnings on destructured-and-dropped fixture fields (`businessStatus`, `websiteUri`) in two test cases — not a plan deviation, just test-authoring cleanup. Fixed by asserting the dropped value with `expect(...).toBeDefined()` instead of prefixing with `_` (keeps the variable "used" without an eslint-disable comment). Lint is clean (0 warnings, 0 errors) after the fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `lib/places/{client,locale,paginate,schema,mapPlaceToLead}.ts` — all five modules from 02-RESEARCH.md's recommended structure now exist; Phase 2 is complete (all 4 plans done)
- `MappedLead`'s field names (`placeId`, `businessName`, `phone`, `address`, `website`, `rating`, `reviewCount`) already match Phase 1's planned `businesses`/`leads` column shape — no rework expected once `lib/db/schema.ts` lands
- Phase 3's checkpointed worker can call `searchTextPlaces` → `fetchNextPage` → `mapPlaceToLead` directly; no blockers
- SCRAPE-05's "on Google" UI copy is Phase 5's responsibility to render — this phase only produces the `tier`/`tierReason` data

---
*Phase: 02-places-api-scrape-client*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: lib/places/mapPlaceToLead.ts
- FOUND: tests/unit/lib/places/mapPlaceToLead.test.ts
- FOUND: 561f4fc (RED commit)
- FOUND: 1f7a5a9 (GREEN commit)
