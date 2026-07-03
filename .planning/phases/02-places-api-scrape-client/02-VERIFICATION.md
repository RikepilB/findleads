---
phase: 02-places-api-scrape-client
verified: 2026-07-02T21:20:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Places API Scrape Client Verification Report

**Phase Goal:** A field-masked, locale-aware Places API client reliably fetches and classifies business data for any category+location query.
**Verified:** 2026-07-02
**Status:** passed
**Re-verification:** No — initial verification
**Mode:** mvp (ROADMAP marks Phase 2 `Mode: mvp`, but the phase goal is a technical backend capability, not a `As a ... I want ... so that ...` user story — 02-01/02-03/02-04-PLAN.md `<mvp_note>` blocks explicitly record this and route verification to the 5 ROADMAP Success Criteria instead. Not applying the User Story Flow Coverage format; verifying against the 5 SCs, which is the correct contract for backend-only groundwork per ROADMAP's own phase framing ("Phases 1-2 are necessarily backend-only groundwork").)

## Goal Achievement

### Observable Truths (ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A search for category+location returns field-masked results including `websiteUri` and `business_status` in a single call, no separate Place Details lookup per result | VERIFIED | `lib/places/client.ts:12-22` `FIELD_MASK` includes `places.websiteUri` and `places.businessStatus` alongside every display field, sent in one `X-Goog-FieldMask` header on the single `POST .../v1/places:searchText` call (`TEXT_SEARCH_URL`, line 7). `client.test.ts` ("sends websiteUri and businessStatus in the same X-Goog-FieldMask header as every display field") asserts both substrings are present in the actual outbound header, not just the constant. Negative half confirmed by grep: no Place Details endpoint (`places.googleapis.com/v1/places/{id}` or similar) referenced anywhere in `lib/places/` — only the one Text Search URL exists in the module. |
| 2 | Lima queries use Peru-appropriate `languageCode`/`regionCode` instead of silently defaulting to English/Canada | VERIFIED | `lib/places/locale.ts` `LOCALE_RULES` maps `lima\|peru` → `es`/`PE`. `locale.test.ts` proves: `"Lima, Peru"` → `es/PE`, `"lima"` (bare, case-insensitive) → `es/PE`, `"restaurants in Lima"` (embedded mid-string) → `es/PE`, and — the accented-fix case explicitly asked about — `"Arequipa, Perú"` → `es/PE`, exercised via `stripDiacritics()` (NFD-normalize + strip U+0300–U+036F combining marks, `locale.ts:20-34`) since JS `\b` doesn't treat `ú` as a word char. Toronto: `"Toronto, ON"` → `en/CA`; unmatched (`"Vancouver"`) and empty string both fall back to `en/CA` default, never throw. |
| 3 | Businesses with `business_status` `CLOSED_PERMANENTLY`/`CLOSED_TEMPORARILY` excluded; `businessStatus`-absent businesses NOT excluded | VERIFIED | `mapPlaceToLead.ts:24` `CLOSED_STATUSES` is a `Set` checked via `place.businessStatus && CLOSED_STATUSES.has(...)` — an exclusion test, not an inclusion allowlist (confirmed by reading the actual conditional, not just the comment). `mapPlaceToLead.test.ts` proves both closed statuses map to `null`, and the Pitfall-3 regression case (`businessStatus` key deleted entirely) still returns a non-null mapped lead — the exact scenario an inclusion-allowlist bug would fail. `schema.ts`'s `businessStatusSchema` is `.optional()` with no `.default(...)`, confirmed by `schema.test.ts` ("parses successfully with businessStatus left undefined when entirely absent"), so the exclusion-set contract holds end-to-end from parse to filter. |
| 4 | Missing `websiteUri` → tier-1 with exact copy "no website found on Google" | VERIFIED | `mapPlaceToLead.ts:36-48`: `tier: hasWebsite ? null : 'tier-1'`, `tierReason: hasWebsite ? null : 'no website found on Google'`. Test asserts via `toBe` (exact string equality, not substring) on both the absent-website case and confirms `null`/`null` when present. |
| 5 | Text Search pagination retries `nextPageToken` with backoff (~2-5s) instead of assuming immediate availability | VERIFIED | `lib/places/paginate.ts` `fetchNextPage` calls `sleep` unconditionally before every attempt including the first (`for` loop, `await sleep(...)` precedes `fetchPage()` on iteration 1). `paginate.test.ts` proves the ordering invariant directly via `sleepStub.mock.invocationCallOrder[0] < fetchPage.mock.invocationCallOrder[0]` — a genuine behavioral/ordering assertion, not just presence. Retry-on-`INVALID_REQUEST` (up to `DEFAULT_PAGE_TOKEN_RETRY.maxAttempts = 3`), rethrow of last error after exhaustion, and immediate rethrow on a non-token error (no silent swallow, no extra retry) are each covered by a dedicated passing test. `delayMs: 3000` is within the required ~2-5s window. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/places/schema.ts` | Zod validation boundary (`rawPlaceSchema`, `textSearchResponseSchema`) | VERIFIED | Exists, substantive, wired into `client.ts` and `mapPlaceToLead.ts`; `schema.test.ts` (6 tests) exercises full/minimal/missing-id/absent-status cases |
| `lib/places/locale.ts` | `inferLocale()` free-text → locale | VERIFIED | Exists, substantive, wired (return type matches `TextSearchParams` shape client.ts expects); `locale.test.ts` (7 tests) |
| `lib/places/paginate.ts` | `fetchNextPage()` retry/backoff | VERIFIED | Exists, substantive; generic `<T>` `fetchPage` callback designed to wrap `searchTextPlaces` (composition deferred to Phase 3's worker per RESEARCH.md's architecture map — by design, not orphaned); `paginate.test.ts` (5 tests) |
| `lib/places/client.ts` | `searchTextPlaces()` field-masked request | VERIFIED | Exists, substantive, wired to `schema.ts` and `lib/env.ts`; `client.test.ts` (6 tests) including field-mask header assertion and API-key-leak-prevention assertion |
| `lib/places/mapPlaceToLead.ts` | `mapPlaceToLead()` filter + classify | VERIFIED | Exists, substantive, wired to `schema.ts`'s `RawPlace` type; `mapPlaceToLead.test.ts` (8 tests) |
| `tests/fixtures/places/*.json` (4 files) | Schema-accurate fixtures | VERIFIED | All 4 present (`text-search-toronto-page1.json`, `text-search-lima-page1.json`, `text-search-with-closed-business.json`, `text-search-empty.json`); manually read Lima and closed-business fixtures — content matches the schema field-by-field, Lima fixture uses real Spanish business names/addresses with `Perú` accented text, closed-business fixture includes one `CLOSED_PERMANENTLY` and one status-absent place exactly as the Pitfall 3 regression test needs |
| `tests/helpers/mockFetch.ts` | Shared fetch-stub helper | VERIFIED | Exists, used by `client.test.ts` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `client.ts` | `schema.ts` | `textSearchResponseSchema.parse(await res.json())` | WIRED | Confirmed in source; malformed-shape test proves it actually throws, not just present |
| `client.ts` | `lib/env.ts` | `env.PLACES_API_KEY` in request header | WIRED | Confirmed; `PlacesApiError` deliberately excludes the request object from its error surface — verified by a test that serializes the error and asserts the API key string never appears |
| `mapPlaceToLead.ts` | `schema.ts` | `RawPlace` type import | WIRED | Confirmed |
| `locale.ts` | `client.ts` (future caller) | Output shape `{languageCode, regionCode}` matches `TextSearchParams` fields | STRUCTURALLY COMPATIBLE | Not directly imported by `client.ts` in this phase (by design — Phase 3's worker composes `inferLocale` → `searchTextPlaces`, per RESEARCH.md's architecture diagram); shape match confirmed by reading both type definitions |
| `paginate.ts` | `client.ts` (future caller) | Generic `fetchPage: () => Promise<T>` callback designed to wrap `searchTextPlaces` | STRUCTURALLY COMPATIBLE | Same as above — composition is explicitly Phase 3's responsibility, not a Phase 2 gap |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCRAPE-02 | 02-01, 02-03 | Field-mask `websiteUri`+`business_status` on same call | SATISFIED | Truth #1 above |
| SCRAPE-03 | 02-02 | `languageCode`/`regionCode` per target market | SATISFIED | Truth #2 above |
| SCRAPE-04 | 02-01, 02-04 | Exclude closed businesses via `business_status` | SATISFIED | Truth #3 above |
| SCRAPE-05 | 02-04 | Tier-1 classification, exact copy | SATISFIED | Truth #4 above |
| SCRAPE-06 | 02-02 | `nextPageToken` retry with backoff | SATISFIED | Truth #5 above |

No orphaned requirements — all 5 requirement IDs mapped to this phase in `.planning/REQUIREMENTS.md`'s traceability table appear in at least one plan's `requirements:` frontmatter (SCRAPE-02 appears in both 02-01 and 02-03, which is expected — schema-boundary half in 02-01, request-construction half in 02-03).

### Anti-Patterns Found

None. Grep for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|placeholder|coming soon|not yet implemented|not available` (case-insensitive) across `lib/places/*.ts` returned zero matches. No empty implementations, no hardcoded-empty stubs, no `console.log`.

### Behavioral Spot-Checks / Full Suite

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Full unit suite | `pnpm vitest run` | 7 test files, 37 tests, all passed, 597ms | PASS |
| Typecheck | `pnpm run typecheck` (`tsc --noEmit`) | exit 0, no output | PASS |
| Lint | `pnpm lint` (`eslint`) | exit 0, no output | PASS |

Full test file breakdown (verbose run, confirmed actual assertions, not just file existence): `schema.test.ts` (6), `locale.test.ts` (7), `paginate.test.ts` (5), `client.test.ts` (6), `mapPlaceToLead.test.ts` (8), `env.test.ts` (4, Phase 1), `smoke.test.ts` (1) = 37.

### Phase 1 Regression Check

`lib/env.ts` itself was **not modified** this phase. However, `vitest.config.ts` (a Phase 1 test-infra artifact) **was modified** in Plan 02-01 (commit `5559634`) to add a `DATABASE_URL` fallback. Read the current file directly (not trusted from SUMMARY): `test.env.DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://user:pass@localhost:5432/testdb'` — confirmed additive (`||`, not a replacement), so a real `TEST_DATABASE_URL` from `.env.test` is never masked. `lib/env.test.ts`'s 4 tests (all in Phase 1's original surface: missing `DATABASE_URL`, missing `PLACES_API_KEY`, invalid URL, valid parse) all still pass in the full suite run above — no regression.

### Human Verification Required

None. This phase is deliberately pure-function/fixture-testable per its own Validation Architecture (02-VALIDATION.md) — no UI, no live API key needed, no runtime behavior outside what the 37 automated tests already exercise.

### Gaps Summary

None. All 5 ROADMAP Success Criteria are verified with genuine behavioral test evidence (not mere presence): the field-mask header content, the diacritic-stripping locale fix, the exclusion-set-not-allowlist filter semantics (with the exact Pitfall-3 regression case), the exact tier-1 copy string, and the sleep-before-fetch ordering invariant for pagination retry are all independently exercised and passing. `pnpm vitest run`, `pnpm run typecheck`, and `pnpm lint` are all clean. All 5 requirement IDs (SCRAPE-02 through SCRAPE-06) are genuinely implemented in `lib/places/*.ts`, not just referenced in plan frontmatter. No Phase 1 regression.

---

*Verified: 2026-07-02*
*Verifier: Claude (gsd-verifier)*
