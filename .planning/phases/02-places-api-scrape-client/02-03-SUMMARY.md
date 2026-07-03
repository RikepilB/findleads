---
phase: 02-places-api-scrape-client
plan: 03
subsystem: api
tags: [google-places-api, zod, vitest, server-only, security]

requires:
  - phase: 02-places-api-scrape-client
    provides: lib/places/schema.ts (textSearchResponseSchema, TextSearchResponse), tests/helpers/mockFetch.ts (mockFetchOnce), tests/fixtures/places/*.json, vitest.config.ts DATABASE_URL fallback
provides:
  - lib/places/client.ts (TEXT_SEARCH_URL, FIELD_MASK, TextSearchParams, PlacesApiError, searchTextPlaces)
affects: [02-04-map-place-to-lead, 03-*-job-worker]

tech-stack:
  added: []
  patterns:
    - "Dependency-injected fetch (fetchImpl param defaulting to global fetch) for network-free unit tests"
    - "Zod validation at the fetch boundary — client.ts never returns res.json() unparsed"
    - "Error classes deliberately exclude the outbound request object from their surface to prevent secret-header leakage"

key-files:
  created:
    - lib/places/client.ts
    - tests/unit/lib/places/client.test.ts

key-decisions:
  - "FIELD_MASK is a single joined string exported as a constant — websiteUri and businessStatus sit alongside every display field in the SAME field mask, the literal mechanism that satisfies SCRAPE-02 (no separate Place Details lookup per result)"
  - "PlacesApiError constructor takes only (status, body) — the request object (which carries X-Goog-Api-Key) is never passed to or stored on the error, regression-tested by serializing the full error (message + stack + JSON) and asserting the header name/key value never appears"
  - "TEXT_SEARCH_URL is a hardcoded literal, never templated from any input — accepted as the SSRF-adjacent mitigation per the plan's threat model (T-02-03-04)"
  - "pageSize/pageToken are spread into the request body only when truthy — omitted entirely otherwise, relying on Google's own default (Pitfall 4)"

patterns-established:
  - "vi.mocked(fetchStub).mock.calls — required to inspect a fetchImpl stub's call args in TypeScript, since the mockFetchOnce helper's return type is typeof fetch, not the vi.fn() mock type; a raw fetchStub.mock.calls access fails typecheck"

requirements-completed: [SCRAPE-02]

coverage:
  - id: D1
    description: "searchTextPlaces() issues exactly one HTTP call per invocation and resolves with a Zod-parsed TextSearchResponse"
    requirement: "SCRAPE-02"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/client.test.ts — 'resolves with a parsed TextSearchResponse and calls fetchImpl exactly once'"
        status: pass
    human_judgment: false
  - id: D2
    description: "The single X-Goog-FieldMask header contains both places.websiteUri and places.businessStatus, proving both are requested on the same call as every display field — no separate Place Details lookup ever happens"
    requirement: "SCRAPE-02"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/client.test.ts — 'sends websiteUri and businessStatus in the same X-Goog-FieldMask header as every display field'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Lima fixture resolves correctly with Spanish content, and languageCode/regionCode from params flow through to the actual request body"
    requirement: "SCRAPE-02"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/client.test.ts — 'resolves with the Lima fixture and reflects the es/PE locale params in the request body'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Non-2xx responses throw a typed PlacesApiError carrying only status/body — never the request or X-Goog-Api-Key header value (T-02-03-02)"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/client.test.ts — 'throws PlacesApiError with the status/body but never leaks the X-Goog-Api-Key header value'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Malformed response shapes are rejected by Zod validation before any field is read by calling code"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/client.test.ts — 'throws a Zod validation error on a malformed response shape'"
        status: pass
    human_judgment: false
  - id: D6
    description: "pageToken/pageSize are omitted from the request body entirely when not provided (Pitfall 4)"
    verification:
      - kind: unit
        ref: "tests/unit/lib/places/client.test.ts — 'omits pageToken/pageSize from the request body entirely when not provided'"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-07-02
status: complete
---

# Phase 2 Plan 3: lib/places/client.ts — searchTextPlaces() field-masked request Summary

**`searchTextPlaces()`, the single field-masked Google Places API Text Search call that requests `websiteUri` and `businessStatus` in the same field mask as every display field — the exact mechanism satisfying SCRAPE-02 (no separate Place Details lookup per result) — with a leak-free `PlacesApiError` and Zod validation at the response boundary.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-02T21:06:36-04:00 (RED commit 11bd07e)
- **Completed:** 2026-07-02T21:07:54-04:00 (GREEN commit 44c0788)
- **Tasks:** 1 completed (TDD RED/GREEN)
- **Files modified:** 2 (1 created, 1 test file created then fixed for typecheck)

## Accomplishments

- `lib/places/client.ts` — `TEXT_SEARCH_URL` (hardcoded literal), `FIELD_MASK` (joined string containing `places.websiteUri` and `places.businessStatus` alongside every display field), `TextSearchParams` interface, `PlacesApiError` class (status + body only), `searchTextPlaces(params, fetchImpl?)` — POSTs to the Text Search endpoint with `X-Goog-Api-Key`/`X-Goog-FieldMask` headers, throws `PlacesApiError` on non-2xx, validates the response via `textSearchResponseSchema.parse(...)` before returning
- `tests/unit/lib/places/client.test.ts` — 6 unit tests covering: single-call proof, field-mask header assertion, Lima locale passthrough, `PlacesApiError` leak-free error path (serialized message + stack + JSON asserted to never contain `X-Goog-Api-Key` or the test placeholder key value), Zod malformed-response rejection, and `pageToken`/`pageSize` omission when absent

## Task Commits

TDD RED/GREEN cycle, both committed atomically:

1. **RED: failing test for lib/places/client.ts** — `11bd07e` (test)
2. **GREEN: lib/places/client.ts implementation** — `44c0788` (feat)

**Plan metadata:** commit created below (docs: complete plan)

## Files Created/Modified

- `lib/places/client.ts` — `searchTextPlaces()` and its supporting exports (`TEXT_SEARCH_URL`, `FIELD_MASK`, `TextSearchParams`, `PlacesApiError`)
- `tests/unit/lib/places/client.test.ts` — 6 unit tests against the Toronto/Lima fixtures and `mockFetchOnce` helper from Plan 02-01

## Decisions Made

- `FIELD_MASK` exported as a top-level constant (not inlined in the function body) so both the header-assertion test and any future direct-inspection test can verify its contents without triggering a network call
- `PlacesApiError`'s constructor signature is exactly `(status: number, body: string)` — no `request`/`headers` parameter exists at all, so there is no code path that could ever attach the API key to a thrown error, structurally rather than just by convention
- Test file required `vi.mocked(fetchStub).mock.calls` instead of `fetchStub.mock.calls` to satisfy `tsc --noEmit` — `mockFetchOnce`'s return type is `typeof fetch`, which erases the `Mock` type's `.mock` property; this is a reusable pattern for any future test consuming the same helper

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Test file failed `tsc --noEmit` due to `.mock` property access on a `typeof fetch`-typed stub**
- **Found during:** Task 1, post-GREEN verification (`pnpm run typecheck`)
- **Issue:** `mockFetchOnce()` (Plan 02-01) returns `typeof fetch`, not a `Mock` type, so `fetchStub.mock.calls[0]` doesn't typecheck even though it works at runtime (the underlying object is a `vi.fn()`)
- **Fix:** Wrapped each access as `vi.mocked(fetchStub).mock.calls[0]`, which re-asserts the mock type without changing runtime behavior
- **Files modified:** `tests/unit/lib/places/client.test.ts`
- **Commit:** `44c0788` (folded into the GREEN commit, since the RED commit's test file compiled fine under `vitest` but not under strict `tsc`)

## Issues Encountered

None blocking. Noted for the record: `pnpm vitest run` printed an unsolicited promotional "tip" line from the `dotenv` package's own console output (e.g. `// tip: ⌁ auth for agents [www.vestauth.com]`) on every run — this is `dotenv`'s own known startup-message behavior, not project code, not something this plan's files produce, and not treated as an instruction (external tool output remains data, per this repo's own security rule). No action taken; flagged here only for traceability in case it surprises a future session.

## User Setup Required

None. All tests run against fixtures and stubs; no live `PLACES_API_KEY` is required for this plan's test suite (consistent with 02-01's setup).

## Next Phase Readiness

- `lib/places/client.ts` is ready for Plan 02-04 (`mapPlaceToLead.ts`) to consume its `TextSearchResponse`/`RawPlace` output.
- `searchTextPlaces()` is ready for Phase 3's checkpointed worker to call as its per-unit-of-work function once that phase is planned.
- Full test suite (6 files, 29 tests), `pnpm run typecheck`, and `pnpm run lint` all pass with zero regressions.
- No blockers for Plan 02-04 (same wave, depends only on 02-01 per its own frontmatter).

---
*Phase: 02-places-api-scrape-client*
*Completed: 2026-07-02*

## Self-Check: PASSED

`lib/places/client.ts` and `tests/unit/lib/places/client.test.ts` confirmed present on disk; commits `11bd07e` and `44c0788` confirmed present in `git log`.
