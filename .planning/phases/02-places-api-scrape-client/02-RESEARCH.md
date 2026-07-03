# Phase 2: Places API Scrape Client - Research

**Researched:** 2026-07-02
**Domain:** Google Places API (New) Text Search integration — field masking, locale handling, pagination retry, response mapping/classification, and testing without a live API key
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase (`/gsd-discuss-phase` has not been run) — all decisions below
are at Claude's discretion within the locked project-level constraints already recorded in
`PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` Phase 2 success criteria, and `.claude/CLAUDE.md`
(see `## Project Constraints (from CLAUDE.md)` below, which carries the same binding weight as a
locked CONTEXT.md decision for this phase). The free-text-location locale heuristic (Q1 below) is
flagged explicitly as a discretionary design choice the planner/user should sanity-check, not a
verified external fact.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCRAPE-02 | Every scrape request field-masks `websiteUri` and `business_status` on the same call (no separate Place Details lookup per result) | Q1 (exact request shape + field mask string), Code Example 1 |
| SCRAPE-03 | Scrape requests wire `languageCode`/`regionCode` per target market so Lima isn't silently under-served by an English/Canada default | Q2 (locale heuristic), Code Example 2 |
| SCRAPE-04 | Scrape excludes closed businesses using the `business_status` field (`CLOSED_PERMANENTLY`/`CLOSED_TEMPORARILY`) | Q4 (mapping + filter logic), Code Example 5, Pitfall 3 |
| SCRAPE-05 | Each lead is classified tier-1 ("no website found on Google") when `websiteUri` is absent — UI/export copy states it as a signal, not a verified fact | Q4 (mapping/classification), Code Example 5 |
| SCRAPE-06 | Text Search pagination retries `nextPageToken` with backoff (~2-5s) instead of assuming immediate availability | Q3 (pagination retry as pure function), Code Example 3 |
</phase_requirements>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Places API request construction (field mask, headers, body) | API / Backend | External Service (Google Places API) | Server-only `fetch` call built and issued from `lib/places/*`; never reaches the browser — SEC-01 from Phase 1 already locks this boundary |
| Locale inference from free-text location | API / Backend | — | Pure function, no I/O, no DB — runs in the same server-side module that builds the request, before the request is sent |
| Pagination retry/backoff | API / Backend | — | Pure, time-injectable function; no DB writes happen here (checkpointing/persistence is Phase 3's job, not this phase's) |
| Response validation + mapping to lead shape | API / Backend | Database / Storage (shape target) | Validates and reshapes Google's response into the `businesses`/`leads` column shape Phase 1 already defined, but this phase does not write to Postgres — it hands a validated, mapped object to whatever calls it (Phase 3's worker) |
| Tier-1 classification + closed-business filter | API / Backend | — | Pure business logic over the mapped shape; no UI copy lives in this phase (SCRAPE-05's UI-facing wording belongs to Phase 5, this phase only produces the `tier`/`tierReason` data the UI will render) |

**Single-tier note:** this entire phase is backend-only groundwork (per `ROADMAP.md`'s own framing:
"Phases 1-2 are necessarily backend-only groundwork"). It has no DB writes and no UI — it produces a
pure, testable module (`lib/places/*`) that Phase 3's checkpointed worker will call as its
unit-of-work. Every function in this phase's scope should be testable with fixture JSON and no
network, DB, or live API key, which materially shapes the Validation Architecture section below.
</architectural_responsibility_map>

<research_summary>
## Summary

This phase builds `lib/places/*` — a pure, server-only client module for Google's Places API (New)
Text Search endpoint. Five concrete implementation questions were researched and are answered below.

**Request shape (Q1):** `POST https://places.googleapis.com/v1/places:searchText` with
`X-Goog-Api-Key` and `X-Goog-FieldMask` headers and a JSON body of `textQuery`, `languageCode`,
`regionCode`, `pageSize`, `pageToken`. The exact field mask string needed for this phase's fields is
`places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,nextPageToken` — all in one call, satisfying SCRAPE-02's "no separate Place Details lookup" requirement directly. `websiteUri` forces Enterprise-tier billing for the whole request regardless of which other fields are masked (already documented in project-level `PITFALLS.md` Pitfall 3 — not re-litigated here, only re-confirmed against the field-by-field pricing table).

**Locale (Q2):** the location field is free-text, not an enum, so there's no structured field to
switch on. The recommended approach is a small, explicit lookup table (city/country name →
`languageCode`/`regionCode`) matched via case-insensitive substring/word matching against the raw
location string, falling back to a default (`en`/`CA`) when nothing matches. This is a pure,
unit-testable function (`inferLocale(location: string)`) — not a geocoding dependency. It is
explicitly flagged as a discretionary design choice (Open Question 1), not a verified external
standard, because Google's own docs don't prescribe how to derive `languageCode`/`regionCode` from
free text — that mapping is this app's own responsibility.

**Pagination retry (Q3):** built as a pure function that takes an injectable `sleep` function and a
`fetchPage` callback, so it's testable with a fake clock (a `sleep` stub that resolves immediately
but records the requested delay) and a stubbed `fetchPage` that fails N times before succeeding —
no real timers, no live API key, no `vi.useFakeTimers()` global-timer coupling required.

**Mapping (Q4):** a single `mapPlaceToLead` pure function takes a Zod-validated raw place object and
returns either `null` (closed business, excluded per SCRAPE-04) or a mapped object matching Phase
1's `businesses`/`leads` column shape (`businessName`, `phone`, `address`, `website`, `rating`,
`reviewCount`, `placeId`) plus `tier`/`tierReason` fields for SCRAPE-05. Response validation happens
through a Zod schema at the fetch boundary (per this project's own "validate at boundaries" rule and
`STACK.md`'s existing recommendation to parse Places API responses through Zod) — the raw response is
never trusted as pre-shaped.

**Testing without a live key (Q5):** hand-authored, sanitized fixture JSON files matching the
documented response schema exactly (cross-checked against official docs fetched this session), paired
with `vi.fn()`-based `fetch` stubbing via dependency injection (the client function accepts an
optional `fetchImpl` parameter defaulting to global `fetch`). No MSW — for a single endpoint with a
handful of test cases, standing up a service worker/interceptor is more machinery than this phase
needs; a plain stub matches this project's own established minimalism (see `STACK.md`'s
`csv-stringify`-over-heavier-alternatives reasoning, same judgment call pattern).

**Primary recommendation:** build `lib/places/{client,locale,paginate,schema,mapPlaceToLead}.ts` as
five small, pure, independently-testable modules with no DB or live-network dependency in their test
suites — dependency-inject `fetch` and `sleep` everywhere I/O or timing would otherwise make a
function hard to test deterministically.
</research_summary>

<standard_stack>
## Standard Stack

### Core

No new runtime dependencies are required for this phase. Everything below is already installed
(confirmed via `package.json`, read this session) or is native platform capability.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| native `fetch` | Node/Next.js built-in | Places API (New) is a plain REST/JSON API — no client library needed | Already the project-level recommendation in `STACK.md`; confirmed again this session against the live docs — a simple `POST` with two headers, no OAuth/ADC |
| `zod` | 4.4.3 `[VERIFIED: npm registry — already installed in package.json]` | Validate the raw Places API response at the fetch boundary before mapping | Already installed for Phase 1's `lib/env.ts`; this phase extends the same "validate at boundaries" pattern to the Places API response, exactly as `STACK.md` anticipated |
| `server-only` | 0.0.1 `[VERIFIED: npm registry — already installed]` | Guard `lib/places/client.ts` (holds `PLACES_API_KEY`) from ever being importable client-side | Same mechanism Phase 1 established for `lib/db/client.ts` and `lib/env.ts` |

### Supporting

None required. `vitest` (4.1.9, already installed) and the existing `tests/unit/` convention cover
this phase's entire test surface — see Validation Architecture below.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled pagination retry (recommended) | `p-retry` (8.0.0, confirmed current on npm registry `[VERIFIED: npm registry]`) | `p-retry` is a fine, well-maintained library, but this phase's retry need is narrow (one specific error condition — token-not-yet-active — with a fixed small `maxAttempts`) and the hand-rolled version is easier to make deterministically testable via constructor-injected `sleep`, matching the pattern Phase 1 already established (inject dependencies rather than reach for a library when the surface is this small). Reconsider `p-retry` only if retry logic needs to grow to cover more error classes/backoff strategies later. |
| Fixture JSON + `vi.fn()` fetch stub (recommended) | `msw` (2.14.6, confirmed current on npm registry `[VERIFIED: npm registry]`) | MSW is the standard choice when many endpoints/many test files need consistent interception, or when integration tests exercise code that calls `fetch` indirectly through several layers. This phase has exactly one endpoint and a handful of direct unit tests — a plain `fetchImpl` injection parameter is simpler, has zero extra dependency, and keeps the "who calls fetch" fact explicit in each test rather than implicit via a global interceptor. |

**Installation:** none — no new packages required.
</standard_stack>

<package_legitimacy_audit>
## Package Legitimacy Audit

No new packages are being installed in this phase — `zod`, `server-only`, and `vitest` are already
present in `package.json` (installed during Phase 1) and native `fetch` requires no package at all.
The two alternatives considered above (`p-retry`, `msw`) were checked against the npm registry for
version-currency purposes only (to make an honest "what would the alternative cost" comparison) and
are explicitly **not** being recommended for installation — no legitimacy audit disposition is
required for packages this research recommends against using.

**Packages removed due to `[SLOP]` verdict:** none — none were candidates for removal (none proposed).
**Packages flagged as suspicious `[SUS]`:** none.
</package_legitimacy_audit>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
                         (Phase 3 worker calls this module — not built yet)
                                          │
                                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  lib/places/  (server-only, no DB, no UI)                              │
│                                                                          │
│  category + free-text location                                         │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────┐   languageCode/regionCode   ┌──────────────────────┐  │
│  │ locale.ts   │ ───────────────────────────▶│ client.ts            │  │
│  │ inferLocale │                              │ searchTextPlaces()   │  │
│  └─────────────┘                              │ (builds request,     │  │
│                                                │  fetches, validates  │  │
│                                                │  raw JSON via Zod)   │  │
│                                                └──────────┬───────────┘  │
│                                                            │             │
│                                     ┌──────────────────────┘             │
│                                     │ if nextPageToken present           │
│                                     ▼                                    │
│                          ┌──────────────────────┐                       │
│                          │ paginate.ts           │                       │
│                          │ fetchNextPage()        │ ── retry/backoff ──▶ │
│                          │ (wraps client.ts call) │   (2-5s, capped)     │
│                          └──────────┬─────────────┘                     │
│                                     │ validated TextSearchResponse       │
│                                     ▼                                    │
│                          ┌──────────────────────┐                       │
│                          │ mapPlaceToLead.ts     │                       │
│                          │ per-place: exclude    │                       │
│                          │ closed, classify tier │                       │
│                          └──────────┬─────────────┘                     │
│                                     ▼                                    │
│                     MappedLead[] — Phase 1 businesses/leads shape        │
│                     (returned to caller; this phase does not persist)   │
└───────────────────────────────────────────────────────────────────────┘
```

A reader tracing "category + Lima free-text location in, mapped leads out": `inferLocale("Lima,
Peru")` → `{ languageCode: 'es', regionCode: 'PE' }` → `searchTextPlaces` builds and sends the
field-masked request → Zod validates the raw JSON shape → if `nextPageToken` is present and more
pages are wanted, `fetchNextPage` retries with backoff → each `RawPlace` in the validated response
passes through `mapPlaceToLead`, which returns `null` for closed businesses (SCRAPE-04) or a mapped
lead with `tier`/`tierReason` set (SCRAPE-05).

### Recommended Project Structure

```
lib/
└── places/
    ├── client.ts          # searchTextPlaces() — request construction, fetch, Zod validation
    ├── locale.ts           # inferLocale() — free-text location → languageCode/regionCode
    ├── paginate.ts          # fetchNextPage() — retry/backoff wrapper around client.ts
    ├── schema.ts              # Zod schemas: rawPlaceSchema, textSearchResponseSchema
    └── mapPlaceToLead.ts       # mapPlaceToLead() — validated place → mapped lead | null
tests/
└── unit/
    └── lib/
        └── places/
            ├── client.test.ts
            ├── locale.test.ts
            ├── paginate.test.ts
            └── mapPlaceToLead.test.ts
tests/fixtures/
└── places/
    ├── text-search-toronto-page1.json   # hand-authored, sanitized, schema-accurate
    ├── text-search-lima-page1.json
    ├── text-search-with-closed-business.json
    └── text-search-empty.json
```

### Pattern 1: Dependency-injected I/O for pure testability

**What:** every function that would otherwise be hard to unit-test because it calls `fetch` or waits
on a timer takes that capability as an optional parameter, defaulting to the real implementation.
**When to use:** `searchTextPlaces(params, fetchImpl = fetch)` and
`fetchNextPage(token, fetchPage, sleep = realSleep, retryConfig)` — both from this phase.
**Example:**
```typescript
// lib/places/client.ts
export async function searchTextPlaces(
  params: TextSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<TextSearchResponse> {
  const res = await fetchImpl(TEXT_SEARCH_URL, { /* ... */ })
  // ...
}
```
In tests: `searchTextPlaces(params, mockFetchOnce(200, fixtureJson))` — no global mock needed,
no cleanup between tests, no risk of one test's stub leaking into another.

### Pattern 2: Validate the external response shape before touching it

**What:** `client.ts` never returns `res.json()` directly — the raw JSON is parsed through
`textSearchResponseSchema.parse(...)` (Zod) first. A malformed/unexpected response throws
immediately at the boundary rather than propagating an `any`-typed surprise into `mapPlaceToLead`.
**When to use:** every external API response, per this repo's own `coding-rules.md` ("Validate at
boundaries. Never trust external input... Fail fast.") and `STACK.md`'s existing recommendation.
**Example:** see Code Example 4 below.

### Anti-Patterns to Avoid
- **Calling `nextPageToken` immediately after receiving it:** confirmed again this session — Google's
  own docs state the token becomes usable only after a short delay; a naive immediate retry loop
  intermittently returns `INVALID_REQUEST`. See Pitfall 1.
- **Fetching Place Details per result to check for a website:** already an established anti-pattern
  in project-level `ARCHITECTURE.md` — `websiteUri` is available directly on the Text Search field
  mask (confirmed again this session against the official field-mask reference), so no per-result
  extra call is ever needed here.
- **Treating an absent `businessStatus` field as "closed":** confirmed this session — Google's docs
  state `businessStatus` is omitted entirely when operational status is unknown, not returned as a
  `CLOSED_*` value. Filtering logic must treat "field absent" as "include," not "exclude." See
  Pitfall 3.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validating the shape of Google's JSON response | Manual `if (!data.places) throw ...` checks scattered through the mapping code | A single Zod schema (`textSearchResponseSchema`) parsed once at the fetch boundary | One declarative schema catches every malformed-field case at once (missing `id`, wrong type for `rating`, etc.) instead of N manual guards that are easy to miss one of |
| General-purpose exponential backoff/retry | A configurable multi-strategy retry engine | A narrow, purpose-built `fetchNextPage` retry loop (fixed delay ~2-5s, small `maxAttempts`, retries only on the specific token-not-yet-active condition) | The actual requirement (SCRAPE-06) is one specific, well-documented API quirk with a known delay window — a general retry library adds configuration surface this phase doesn't need; revisit only if retry needs grow (see Alternatives Considered) |
| Free-text geocoding/locale detection | A full geocoding API call or NLP-based location parser just to pick `languageCode`/`regionCode` | A small, explicit lookup table matched by substring, with a documented default fallback | The actual requirement is narrow (Toronto vs. Lima, two known validation markets, free-text field) — a geocoding dependency is a large hammer for a two-entry lookup table; see Open Question 1 for the extensibility tradeoff this accepts |

**Key insight:** every item above is really the same insight — this phase's actual requirements are
narrower than the general version of each problem (arbitrary retry policies, arbitrary geocoding,
arbitrary JSON validation), so the right-sized solution is a small, purpose-built, testable function,
not an imported general-purpose engine. This mirrors Phase 1's own established judgment calls
(`csv-stringify` over heavier alternatives, hand-rolled `lib/env.ts` over a validation-wrapper
library).
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: `nextPageToken` returns `INVALID_REQUEST` if called too soon
**What goes wrong:** calling the search endpoint with a freshly-received `pageToken` immediately
(within ~1-2s) reliably fails with `INVALID_REQUEST`. Already documented in project-level
`PITFALLS.md` Pitfall 4 and `ARCHITECTURE.md`; re-confirmed this session against the official Text
Search (New) docs, which describe the `nextPageToken` field but do not publish an exact activation
delay — the ~2-5s window is an empirically-observed community/third-party figure (MEDIUM confidence
per project-level `PITFALLS.md`'s own sourcing), not a number Google's docs state directly.
**Why it happens:** legacy Places API behavior that carried over into the New API; the actual
server-side propagation delay isn't documented, only observed.
**How to avoid:** `fetchNextPage` (Code Example 3) always waits before its *first* attempt too, not
just between retries — treat the delay as mandatory, not just a retry-backoff.
**Warning signs:** intermittent `INVALID_REQUEST` on page 2/3 of a dense-query test, but never on
page 1 (which has no token to wait on).

### Pitfall 2: `websiteUri` absence is a signal, not proof of "no website"
**What goes wrong:** already documented in project-level `PITFALLS.md` Pitfall 2 — treating a
missing `websiteUri` field as ground truth "this business has no website" rather than "Google has no
record of one." This phase's `mapPlaceToLead` function is the exact place this distinction has to be
encoded correctly (SCRAPE-05's own wording — "no website found on Google" — is itself the
mitigation).
**Why it happens:** the field's absence is free (no extra API cost), which makes it tempting to treat
as authoritative.
**How to avoid:** `tierReason` in Code Example 5 is hardcoded to the literal string "no website found
on Google" — not "no website" — so the signal-vs-fact distinction is baked into the data this phase
produces, not left for a later UI layer to remember to phrase correctly.
**Warning signs:** any `tierReason`/UI copy elsewhere in the codebase that drops the "on Google"
qualifier.

### Pitfall 3: `businessStatus` is *omitted*, not set to a closed value, when unknown
**What goes wrong:** confirmed this session via cross-referenced official Google client-library docs
(`docs.cloud.google.com` Go client reference) — when a business's operational status is unknown,
Google does not return a `businessStatus` field at all (neither `OPERATIONAL` nor
`BUSINESS_STATUS_UNSPECIFIED` is guaranteed present). A filter written as `if (place.businessStatus
!== 'OPERATIONAL') exclude` would incorrectly drop every business with unknown status — a much larger
false-exclusion than SCRAPE-04 intends (which only wants `CLOSED_PERMANENTLY`/`CLOSED_TEMPORARILY`
excluded).
**Why it happens:** it's a natural but wrong assumption that "not operational" and "not
`CLOSED_*`" are the same test; the field's optionality is easy to miss without checking a live
response or reading a secondary source (it's not stated on the primary Text Search page fetched this
session, only surfaced via a cross-referenced client-library reference).
**How to avoid:** filter on an explicit exclusion set (`CLOSED_PERMANENTLY`, `CLOSED_TEMPORARILY`),
never an inclusion allowlist of `OPERATIONAL` only. See Code Example 5.
**Warning signs:** a test fixture with `businessStatus` entirely absent from a place object getting
incorrectly filtered out — this is the exact regression test to write for SCRAPE-04.

### Pitfall 4: `pageSize` max is 20 — three pages, not one page of 60
**What goes wrong:** assuming `pageSize` can be set to `60` to get everything in one call.
`pageSize` accepts a maximum of 20 (confirmed this session against the official request-body
reference); reaching the documented 60-result cap always requires the full three-call
page/token/page/token/page sequence, never a single larger request.
**Why it happens:** the 60-result *total* cap and the 20-result *per-page* cap are easy to conflate
when skimming the docs quickly.
**How to avoid:** default `pageSize` to 20 (or omit it, since 20 is already the documented default)
and rely on `nextPageToken` pagination — never attempt to request more than 20 in one call.
**Warning signs:** a `pageSize: 60` (or higher) request either erroring or silently being capped by
Google — don't rely on Google to correct an over-large `pageSize`, validate it client-side if it's
ever made configurable.
</common_pitfalls>

<code_examples>
## Code Examples

### 1. `lib/places/client.ts` — field-masked Text Search request (SCRAPE-02)
```typescript
// Source: developers.google.com/maps/documentation/places/web-service/text-search
// (endpoint, headers, body fields — fetched and confirmed this session)
import 'server-only'
import { env } from '@/lib/env'
import { textSearchResponseSchema, type TextSearchResponse } from './schema'

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

// One field mask, reused for every call — satisfies SCRAPE-02: websiteUri and
// businessStatus are requested on the SAME call as every display field, no
// separate Place Details lookup per result.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'nextPageToken',
].join(',')

export interface TextSearchParams {
  textQuery: string
  languageCode: string
  regionCode: string
  pageToken?: string
  pageSize?: number // max 20 — see Pitfall 4; omit to use Google's own default of 20
}

export class PlacesApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Places API request failed: ${status}`)
  }
}

export async function searchTextPlaces(
  params: TextSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<TextSearchResponse> {
  const res = await fetchImpl(TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.PLACES_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: params.textQuery,
      languageCode: params.languageCode,
      regionCode: params.regionCode,
      ...(params.pageSize ? { pageSize: params.pageSize } : {}),
      ...(params.pageToken ? { pageToken: params.pageToken } : {}),
    }),
  })

  if (!res.ok) {
    throw new PlacesApiError(res.status, await res.text())
  }

  // Validate at the boundary — never trust the raw JSON shape (coding-rules.md).
  return textSearchResponseSchema.parse(await res.json())
}
```

### 2. `lib/places/locale.ts` — free-text location → `languageCode`/`regionCode` (SCRAPE-03)
```typescript
// Design pattern, not sourced from Google docs (Google does not prescribe how to
// derive languageCode/regionCode from free text — this is this app's own logic).
// Flagged [ASSUMED] as a design choice — see Open Question 1.
interface LocaleRule {
  match: RegExp
  languageCode: string
  regionCode: string
}

// Seed list covers this phase's two explicit validation markets (Toronto,
// Lima). Extend this table as new markets are validated — do not build a
// geocoding dependency for this (see Don't Hand-Roll).
const LOCALE_RULES: LocaleRule[] = [
  { match: /\b(lima|per[uú])\b/i, languageCode: 'es', regionCode: 'PE' },
  { match: /\b(toronto|ontario|canada)\b/i, languageCode: 'en', regionCode: 'CA' },
]

const DEFAULT_LOCALE = { languageCode: 'en', regionCode: 'CA' } as const

export function inferLocale(freeTextLocation: string): {
  languageCode: string
  regionCode: string
} {
  const rule = LOCALE_RULES.find((r) => r.match.test(freeTextLocation))
  return rule
    ? { languageCode: rule.languageCode, regionCode: rule.regionCode }
    : DEFAULT_LOCALE
}
```

### 3. `lib/places/paginate.ts` — `nextPageToken` retry with backoff (SCRAPE-06)
```typescript
// Source: pattern derived from developers.google.com/maps/documentation/places/web-service/text-search
// (nextPageToken pagination) + project-level PITFALLS.md Pitfall 4 (~2-5s activation delay,
// MEDIUM-confidence community-observed figure — Google's own docs describe the token but not
// an exact delay).
export interface RetryConfig {
  maxAttempts: number
  delayMs: number
}

export const DEFAULT_PAGE_TOKEN_RETRY: RetryConfig = { maxAttempts: 3, delayMs: 3000 }

function isTokenNotYetActiveError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('INVALID_REQUEST')
}

/**
 * Fetches a page keyed by `pageToken`, retrying on the documented
 * "token not yet active" condition. Always waits before the FIRST attempt
 * too (Pitfall 1) — the delay is not just a retry backoff, it's a mandatory
 * activation wait.
 */
export async function fetchNextPage<T>(
  fetchPage: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  retry: RetryConfig = DEFAULT_PAGE_TOKEN_RETRY,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    await sleep(retry.delayMs)
    try {
      return await fetchPage()
    } catch (err) {
      if (!isTokenNotYetActiveError(err)) throw err
      lastError = err
    }
  }
  throw lastError
}
```

**Testability note:** `sleep` is injected precisely so this is a pure, fast unit test — a test stub
records the requested `ms` and resolves immediately, so the retry logic (attempt count, which errors
are retried, what happens after `maxAttempts`) is verifiable in milliseconds of real test time, not
seconds. See Validation Architecture for the corresponding test.

### 4. `lib/places/schema.ts` — Zod validation at the response boundary
```typescript
// Source: developers.google.com/maps/documentation/places/web-service/data-fields
// (field names/paths) + developers.google.com/maps/documentation/places/android-sdk/reference/.../BusinessStatus
// and docs.cloud.google.com Go client reference (enum values — cross-checked this session,
// businessStatus confirmed OPTIONAL: omitted, not defaulted, when unknown — see Pitfall 3)
import { z } from 'zod'

export const businessStatusSchema = z
  .enum(['BUSINESS_STATUS_UNSPECIFIED', 'OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'])
  .optional()

export const rawPlaceSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string(), languageCode: z.string().optional() }).optional(),
  formattedAddress: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  // Loose z.string() rather than z.url() — be lenient parsing an external API's
  // URI field; a minor formatting quirk in a third-party value shouldn't reject
  // the entire response. Judgment call, not a documented Google guarantee.
  websiteUri: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  businessStatus: businessStatusSchema,
})

export const textSearchResponseSchema = z.object({
  places: z.array(rawPlaceSchema).optional().default([]),
  nextPageToken: z.string().optional(),
})

export type RawPlace = z.infer<typeof rawPlaceSchema>
export type TextSearchResponse = z.infer<typeof textSearchResponseSchema>
```

### 5. `lib/places/mapPlaceToLead.ts` — mapping + tier-1 classification + closed-business filter (SCRAPE-04, SCRAPE-05)
```typescript
// Source: Phase 1's businesses/leads column shape (lib/db/schema.ts, per
// 01-RESEARCH.md Code Example 3) + this phase's SCRAPE-04/SCRAPE-05 requirements
import type { RawPlace } from './schema'

export interface MappedLead {
  placeId: string
  businessName: string
  phone: string | null
  address: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
  tier: 'tier-1' | null
  tierReason: string | null
}

// Exclusion set, not an inclusion allowlist — see Pitfall 3. A place with NO
// businessStatus field at all (unknown status) is correctly included here,
// since it will not match this Set.
const CLOSED_STATUSES = new Set(['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'])

/**
 * Maps a validated raw place to this app's lead shape, or returns null if the
 * business is closed (SCRAPE-04 — excluded from results entirely, not just
 * flagged).
 */
export function mapPlaceToLead(place: RawPlace): MappedLead | null {
  if (place.businessStatus && CLOSED_STATUSES.has(place.businessStatus)) {
    return null
  }

  const hasWebsite = Boolean(place.websiteUri)

  return {
    placeId: place.id,
    businessName: place.displayName?.text ?? '',
    phone: place.internationalPhoneNumber ?? null,
    address: place.formattedAddress ?? null,
    website: place.websiteUri ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    // Signal, not fact — the exact copy SCRAPE-05 requires (Pitfall 2).
    tier: hasWebsite ? null : 'tier-1',
    tierReason: hasWebsite ? null : 'no website found on Google',
  }
}
```

### 6. Test fixture + fetch stub pattern (Q5 — testing without a live key)
```typescript
// tests/helpers/mockFetch.ts
import { vi } from 'vitest'

export function mockFetchOnce(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch
}

// tests/unit/lib/places/client.test.ts
import { describe, it, expect } from 'vitest'
import { searchTextPlaces } from '@/lib/places/client'
import { mockFetchOnce } from '../../../helpers/mockFetch'
import torontoFixture from '../../../fixtures/places/text-search-toronto-page1.json'

describe('searchTextPlaces', () => {
  it('parses a valid Toronto response and includes the required field mask', async () => {
    const fetchStub = mockFetchOnce(200, torontoFixture)
    const result = await searchTextPlaces(
      { textQuery: 'restaurant', languageCode: 'en', regionCode: 'CA' },
      fetchStub,
    )
    expect(result.places[0].id).toBeDefined()
    expect(fetchStub).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Goog-FieldMask': expect.stringContaining('places.websiteUri'),
        }),
      }),
    )
  })
})
```

**Fixture authoring note:** `tests/fixtures/places/*.json` are hand-authored this session's
knowledge did not include a live capture (no Places API key is provisioned yet, per this project's
current blocked state) — each fixture's field names and nesting were cross-checked field-by-field
against the official Text Search (New) request/response reference fetched this session, not
guessed. Once a real `PLACES_API_KEY` exists, capture one real (sanitized — strip any real business
PII if the fixture will be committed) response per target market and diff it against the
hand-authored fixture as a one-time confidence check; this is a "nice to have before shipping,"
not a blocker for building this phase.
</code_examples>

<validation_architecture>
## Validation Architecture

`workflow.nyquist_validation` is enabled (`.planning/config.json`) and not overridden — this section
is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` 4.1.9 (already installed and configured — `vitest.config.ts` read this session) |
| Config file | `vitest.config.ts` — already handles the `server-only` package's `react-server` export condition needed for any module (like `lib/places/client.ts`) that imports `server-only` |
| Quick run command | `pnpm vitest run <file>` |
| Full suite command | `pnpm vitest run` |

**Existing test-env detail relevant to this phase:** `vitest.config.ts` already injects
`PLACES_API_KEY: 'vitest-placeholder-not-a-real-key'` into the test environment (confirmed by
reading the file this session) — any test that imports `lib/env.ts` (transitively, via
`lib/places/client.ts`) will not throw on missing `PLACES_API_KEY`; the placeholder value is never
actually sent anywhere since `fetchImpl` is stubbed in every test from Code Example 6.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCRAPE-02 | Request includes `websiteUri` and `businessStatus` in the field mask on the same call | unit | `pnpm vitest run tests/unit/lib/places/client.test.ts -t "field mask"` | ❌ Wave 0 |
| SCRAPE-03 | `inferLocale("Toronto, ON")` → `en`/`CA`; `inferLocale("Lima, Peru")` → `es`/`PE`; unmatched input → default | unit | `pnpm vitest run tests/unit/lib/places/locale.test.ts` | ❌ Wave 0 |
| SCRAPE-04 | A place with `businessStatus: 'CLOSED_PERMANENTLY'` or `'CLOSED_TEMPORARILY'` maps to `null`; a place with `businessStatus` absent is still included (Pitfall 3 regression test) | unit | `pnpm vitest run tests/unit/lib/places/mapPlaceToLead.test.ts -t "business status"` | ❌ Wave 0 |
| SCRAPE-05 | A place with no `websiteUri` maps to `tier: 'tier-1'`, `tierReason: 'no website found on Google'`; a place with `websiteUri` maps to `tier: null` | unit | `pnpm vitest run tests/unit/lib/places/mapPlaceToLead.test.ts -t "tier"` | ❌ Wave 0 |
| SCRAPE-06 | `fetchNextPage` waits before the first attempt, retries on the token-not-yet-active error up to `maxAttempts`, throws after exhausting retries, does not retry on other error types | unit | `pnpm vitest run tests/unit/lib/places/paginate.test.ts` | ❌ Wave 0 |

All five requirements are fully coverable by fast, deterministic unit tests with no live API key, no
DB, and no real timers — a direct consequence of this phase's pure-function design (Pattern 1 above).
No integration or E2E tier is needed for this phase specifically (Phase 3's worker, which composes
these functions against a real or DB-backed flow, is where an integration tier becomes relevant).

### Sampling Rate
- **Per task commit:** the relevant `pnpm vitest run <file>` from the table above.
- **Per wave merge:** `pnpm vitest run` (full suite, including Phase 1's existing tests).
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/fixtures/places/text-search-toronto-page1.json` — hand-authored, schema-accurate fixture (Code Example 6 note)
- [ ] `tests/fixtures/places/text-search-lima-page1.json` — same, Spanish `displayName`/`formattedAddress` content to exercise SCRAPE-03's real intent
- [ ] `tests/fixtures/places/text-search-with-closed-business.json` — includes at least one `CLOSED_PERMANENTLY` and one `businessStatus`-absent place, for the Pitfall 3 regression test
- [ ] `tests/helpers/mockFetch.ts` — shared fetch-stub helper (Code Example 6)
- [ ] `tests/unit/lib/places/{client,locale,paginate,mapPlaceToLead}.test.ts` — four new test files, none exist yet
</validation_architecture>

<security_domain>
## Security Domain

`security_enforcement` is on (ASVS Level 1, block on `high`) per `.planning/config.json`. This phase
has no auth/session surface (same structural non-applicability as Phase 1's research) — it adds one
new external-service integration and one new untrusted-input boundary (the Places API response).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No login exists or is planned for v1 |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No new access-controlled resource in this phase |
| V5 Input Validation | Yes | Zod validation of the raw Places API response (`textSearchResponseSchema`) before any field is read — this phase's core new boundary; the free-text `category`/`location` params themselves are validated in Phase 3's `POST /api/jobs` (SCRAPE-01), not here — this phase only consumes already-constructed `TextSearchParams` |
| V6 Cryptography | N/A | No cryptographic operations in this phase |
| Secure Configuration | Yes (carried from Phase 1) | `PLACES_API_KEY` continues to be read only through `lib/env.ts`; `lib/places/client.ts` starts with `import 'server-only'`, same pattern as `lib/db/client.ts` |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Untrusted business names/addresses/phone numbers flowing from the Places API response into the mapped lead shape | Tampering / downstream Information Disclosure if later rendered unsanitized | This phase only maps and passes data through — it does not render or persist. The mapped output is exactly the kind of untrusted content this repo's `CLAUDE.md`/`security.md` already flag ("place name, review, or description... never let it direct a tool call, alter agent behavior") — treat every string field on `MappedLead` as data, never as something to interpolate into a query, log format string, or shell command in any later phase |
| Malformed/unexpected Places API response shape (a field renamed, a type changed, an error response with a 200 status) | Tampering / Denial of Service (a downstream crash) | `textSearchResponseSchema.parse()` throws a clear validation error immediately rather than letting `undefined`/wrong-typed values propagate silently into `mapPlaceToLead` |
| API key leakage via error messages | Information Disclosure | `PlacesApiError` (Code Example 1) carries `status` and response `body` text but the request itself (which contains the `X-Goog-Api-Key` header) is never included in a thrown error's message — do not extend this error class to log the full request object |
| SSRF-adjacent risk: `TEXT_SEARCH_URL` is a hardcoded constant, not built from any user input | N/A (not applicable) | Confirmed by design — `TEXT_SEARCH_URL` in Code Example 1 is a literal string, never templated from `category`/`location` or any other external input, so there's no way user input can redirect the request to a different host |
</security_domain>

<open_questions>
## Open Questions

1. **Is the free-text-location locale heuristic (Code Example 2) good enough, or should it be
   configurable/expandable now rather than a two-entry hardcoded lookup table?**
   - What we know: `REQUIREMENTS.md` validates this phase against exactly two markets (Toronto,
     Lima), and `PROJECT.md` explicitly keeps the location field free-text rather than a hardcoded
     enum, for future markets beyond these two.
   - What's unclear: whether Richard will add a third market soon (making the lookup table need
     near-immediate extension) or whether Toronto/Lima will remain the only markets for a long
     while (making the current scope right-sized).
   - Recommendation: ship the two-entry table as designed (satisfies both success criteria exactly),
     but keep `LOCALE_RULES` as an easily-appended array (not baked into a switch statement) so
     adding a third market later is a one-line change, not a refactor. Flag to the user/planner as a
     discretionary choice, not a verified requirement.

2. **Should `mapPlaceToLead` also compute the "hit the 60-result cap" signal SCRAPE-07 needs (Phase
   5), or is that Phase 3/4's responsibility?**
   - What we know: SCRAPE-07 ("60+ results found, showing first 60 — refine your search") is
     explicitly scoped to Phase 5 in `ROADMAP.md`/`REQUIREMENTS.md`, not this phase.
   - What's unclear: which phase's code should own detecting "exactly 60 results were returned
     across all pages" — this phase's client naturally has the page-count/result-count information
     as it paginates, but doesn't itself own multi-page orchestration (that composition happens in
     Phase 3's checkpointed worker, which calls this phase's functions per unit of work).
   - Recommendation: this phase's functions should return enough raw information (e.g., whether a
     `nextPageToken` was present after fetching page 3, or the count of places returned) for whichever
     phase does own multi-page orchestration to detect the cap — but computing and storing a
     `hitCap` boolean is out of this phase's scope. Confirm ownership explicitly when Phase 3 is
     planned, since Phase 3's own `ROADMAP.md` success criteria don't mention SCRAPE-07 either.

3. **The ~2-5s `nextPageToken` activation delay (Pitfall 1 / Code Example 3's `DEFAULT_PAGE_TOKEN_RETRY`)
   is not stated in Google's own primary docs — is 3000ms (this research's chosen default) the right
   number?**
   - What we know: project-level `PITFALLS.md` (MEDIUM confidence, third-party corroborated) and this
     session's own docs review agree the token needs a short wait; neither source states an exact,
     guaranteed number — it's described as "undocumented" and "appears to float ~2-5 seconds."
   - What's unclear: the true distribution of activation delays under real load; a fixed 3000ms could
     still occasionally be too short, requiring the retry loop (not just the initial wait) to matter
     in practice.
   - Recommendation: keep `DEFAULT_PAGE_TOKEN_RETRY` as a named, exported constant (not inlined) so
     it's a one-line tuning point if real-world testing against Toronto/Lima queries (once a live key
     exists) shows it needs adjustment — this is explicitly flagged for revisit once real API access
     is available, not treated as a settled number.
</open_questions>
</phase_requirements>

<assumptions_log>
## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The free-text-location locale heuristic (substring-match lookup table, `en`/`CA` default) is a reasonable design for SCRAPE-03 | Code Example 2, Open Question 1 | Low — pure function, cheap to change; worst case a third market briefly gets the wrong default until the table is extended, which is a one-line fix, not a redesign |
| A2 | ~3000ms is a reasonable default `nextPageToken` retry delay | Code Example 3, Open Question 3 | Low-medium — an under-estimate means occasional extra retry round-trips (still bounded by `maxAttempts`), not incorrect results; an over-estimate just adds latency, not a correctness bug |
| A3 | `msw` is not needed for this phase's test surface (plain `fetchImpl` injection is sufficient) | Standard Stack, Alternatives Considered | Low — if a future phase needs to mock many more endpoints, adding `msw` then is a self-contained decision that doesn't require unwinding this phase's tests |
| A4 | Hand-authored fixture JSON (schema-cross-checked, not a live API capture) is an acceptable substitute for a real captured response, given no live `PLACES_API_KEY` exists yet | Code Examples 6, Environment Availability | Medium — if the real API response has an undocumented quirk this session's schema review missed, tests could pass against a fixture that doesn't match reality; mitigated by the recommendation to diff against one real captured response once a key exists (Code Example 6 note) |

**If this table is empty:** N/A — see rows above.
</assumptions_log>

<environment_availability>
## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `PLACES_API_KEY` (real, working Google Cloud key) | Live end-to-end verification of this phase's code against the real Places API | **Not available this session** — `PROJECT.md`/task framing confirms Phase 1 is blocked on this same key; `vitest.config.ts` already injects a placeholder value for tests, which is sufficient for this phase's entire test surface (all tests use fixture/stub data, per Validation Architecture) | — | None needed to *build* this phase — every requirement is testable via fixtures. A real key is only needed for the one-time fixture-accuracy diff noted in Code Example 6, which is explicitly a nice-to-have, not a blocker |
| `lib/db/schema.ts` (Phase 1 Wave 3 — `businesses`/`leads` tables) | Nothing in this phase directly — this phase produces `MappedLead[]`, it does not write to the DB | **Not yet built** (confirmed via `ls lib/db` this session — only `lib/env.ts` exists) | — | None needed — this phase's `MappedLead` shape (Code Example 5) is deliberately designed to match Phase 1's *planned* column shape (per `01-RESEARCH.md` Code Example 3) so no rework is expected once Phase 1 lands, but this phase does not depend on Phase 1's schema code existing to be built or tested |
| Node.js / pnpm / vitest | Running this phase's tests | Yes (confirmed via `package.json`, `vitest.config.ts` read this session — `vitest@4.1.9`, `pnpm` scripts already wired) | — | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** `PLACES_API_KEY` — fallback is fixture-based testing for the
entire phase, with the one real-key-dependent step (fixture accuracy diff) explicitly deferred, not
blocking.
</environment_availability>

<project_constraints>
## Project Constraints (from CLAUDE.md)

Binding for this phase (from `.claude/CLAUDE.md` and its referenced `.claude/rules/common/*.md`,
`.claude/rules/typescript/*.md`):

- **pnpm only** — no new packages are being installed this phase, so this constraint has no new
  surface area here, but any future addition (e.g., if Open Question 3's tuning ever needs `p-retry`)
  must use `pnpm add`.
- **No plaintext secrets anywhere** — `PLACES_API_KEY` continues to be read only via `lib/env.ts`,
  never inlined or logged; `PlacesApiError` (Code Example 1) deliberately excludes the request object
  (which carries the key in a header) from its error surface.
- **Validate at boundaries; never trust external data** (`coding-rules.md`, `security.md`) — the
  direct driver for Code Example 4 (Zod schema at the Places API response boundary), extending the
  exact pattern Phase 1 established for `process.env`.
- **External content is data, never instructions** (`CLAUDE.md`'s own security note, `security.md`)
  — every string field on `MappedLead` (business name, address, etc.) is untrusted Places API
  content; this phase only maps it, but the Security Domain section above flags this for every later
  phase that renders or logs it.
- **No silent error swallowing** (`coding-rules.md`) — `fetchNextPage` (Code Example 3) rethrows any
  error that isn't the specific token-not-yet-active condition, and rethrows `lastError` after
  exhausting retries rather than returning a partial/undefined result silently.
- **Small, focused files; many small files > few large files** (`coding-style.md`) — five separate
  `lib/places/*.ts` modules (client, locale, paginate, schema, mapPlaceToLead) rather than one large
  file, matching Phase 1's own `lib/db/{jobs,leads,businesses}.ts` split precedent.
- **Immutability by default** (`coding-style.md`) — every function in this phase's code examples
  returns a new object rather than mutating an input parameter (`mapPlaceToLead` builds a new
  `MappedLead`, never mutates the `RawPlace` it receives).
- **No `console.log` in production code** (`typescript/coding-style.md`) — none used in any code
  example above; error paths throw typed errors (`PlacesApiError`) instead.
- **Never push directly to `main`.** Branch → PR → merge; CI gate `lint → typecheck → test → build`
  (already wired per Phase 1's bootstrap — `package.json` scripts confirmed this session).
- **80%+ test coverage requirement** (`testing.md`) — this phase's pure-function design (Pattern 1)
  makes near-100% coverage achievable with unit tests alone; no integration/E2E tier is claimed as
  satisfying this phase's own coverage (see Validation Architecture).
</project_constraints>

<sources>
## Sources

### Primary (HIGH confidence)
- `developers.google.com/maps/documentation/places/web-service/text-search` (fetched directly this
  session) — endpoint URL, required headers, JSON body fields (`textQuery`, `languageCode`,
  `regionCode`, `pageSize`, `pageToken`), field mask requirement, 60-result cap, `pageSize` max of 20
- `developers.google.com/maps/documentation/places/web-service/data-fields` (fetched directly this
  session) — field mask path strings for every field this phase needs, SKU/tier categorization
  (Enterprise tier for `internationalPhoneNumber`/`websiteUri`/`rating`/`userRatingCount`, confirming
  and extending project-level `PITFALLS.md` Pitfall 3)
- `docs.cloud.google.com/go/docs/reference/.../placespb` (Go client library reference, cross-checked
  via WebSearch this session) — `BusinessStatus` enum values (`BUSINESS_STATUS_UNSPECIFIED`,
  `OPERATIONAL`, `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`) and the field-omitted-when-unknown
  behavior that drives Pitfall 3/Code Example 5's exclusion-set (not allowlist) design
- `package.json`, `vitest.config.ts`, `lib/env.ts` (read directly from the repo this session) —
  confirmed already-installed dependency versions, existing test-environment conventions (the
  `react-server` condition workaround, the `PLACES_API_KEY` test placeholder), and that `lib/db/`
  does not yet exist
- `npmjs.com` registry (`npm view`, queried directly this session) — `msw` (2.14.6) and `p-retry`
  (8.0.0) current versions, used only for the honest alternatives-considered comparison

### Secondary (MEDIUM confidence)
- Project-level `.planning/research/PITFALLS.md` (Pitfalls 1-5) and `.planning/research/ARCHITECTURE.md`
  — already HIGH/MEDIUM-confidence per their own sourcing; supplied the ~2-5s `nextPageToken` delay
  figure (explicitly flagged there as community-observed, not Google-documented) and the
  Enterprise-tier billing implication, both re-confirmed rather than re-derived this session
- Project-level `.planning/research/STACK.md` — supplied the "raw `fetch`, not `@googlemaps/places`"
  and "validate Places responses via Zod" recommendations this phase's design directly extends

### Tertiary (LOW confidence — needs validation)
- The exact ~3000ms default retry delay (Code Example 3, `DEFAULT_PAGE_TOKEN_RETRY`) — no primary
  source states a guaranteed number; flagged in Open Question 3 and Assumptions Log A2 for revisit
  once real API access exists
- The free-text-location locale heuristic design (Code Example 2) — not sourced from any external
  reference (Google does not prescribe this); flagged in Open Question 1 and Assumptions Log A1 as
  this app's own discretionary design choice
</sources>

<metadata>
## Metadata

**Confidence breakdown:**
- Request shape / field masks / SKU tiers (SCRAPE-02): HIGH — fetched directly from official Google
  docs this session, cross-checked field-by-field
- `businessStatus` enum + omitted-when-unknown behavior (SCRAPE-04, Pitfall 3): HIGH — confirmed via
  a cross-referenced official Google client-library reference, not just the primary Text Search page
  (which doesn't state this nuance directly)
- Pagination retry mechanics (SCRAPE-06): MEDIUM — the need for a delay is HIGH confidence (documented
  token-based pagination pattern); the exact delay duration is MEDIUM (community-observed, not
  Google-documented), explicitly flagged as such in Open Question 3
- Locale heuristic (SCRAPE-03): MEDIUM — the `languageCode`/`regionCode` parameters themselves are
  HIGH confidence (official docs); the free-text-matching design to derive them is this app's own
  judgment call, not externally verified, flagged LOW/discretionary in the Assumptions Log
- Testing strategy (fixtures + fetch injection, no MSW): HIGH for the mechanics (matches existing
  `vitest.config.ts` conventions read directly this session), MEDIUM for the "MSW not needed"
  judgment call (a reasonable scope-fit decision, not a factual claim)

**Research date:** 2026-07-02
**Valid until:** 2026-08-01 (30 days — Places API (New) field/pricing structure has changed before
and could again; re-verify field mask strings and SKU tiers if Phase 2 execution starts more than a
few weeks after this research, per the same honesty-check pattern `STACK.md` applies to Drizzle)
</metadata>

---

*Phase: 02-places-api-scrape-client*
*Research completed: 2026-07-02*
*Ready for planning: yes*
</content>
