# Phase 3: Job Creation & Checkpointed Worker - Research

**Researched:** 2026-07-02
**Domain:** Next.js 16 App Router `after()` background execution + a checkpointed/resumable worker composing Phase 1's (interface-locked) DAL and Phase 2's (built, verified) Places API client
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase (`/gsd-discuss-phase` has not been run) — all decisions below
are at Claude's discretion within the locked project-level constraints already recorded in
`PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` Phase 3 success criteria, and `.claude/CLAUDE.md`
(see `## Project Constraints (from CLAUDE.md)` below, which carries the same binding weight as a
locked CONTEXT.md decision for this phase).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCRAPE-01 | User can create a scrape job by category + free-text location, validated against Toronto and Lima | Q1 (POST /api/jobs), Code Example 1; resolved ambiguity note below — "validated against" means QA markets, not a runtime allowlist (PROJECT.md Constraints already confirms free-text, not an enum) |
| JOB-01 | `POST /api/jobs` validates params (Zod), inserts a `pending` job row, returns `{ jobId }` immediately while the scrape runs via `after()` | Q1, Code Example 1, Pitfall 1 |
| JOB-02 | The scrape worker is checkpointed/resumable — one search call is one unit of work, progress (`leads_found`, cursor) persists after every unit | Q2, Q3, Code Examples 2-4 |
| JOB-03 | The worker stops cleanly near a safety-window threshold (~250s) and marks the job `partial` with a saved cursor | Q3, Code Example 3, Pitfall 2 |
| JOB-07 | Leads are deduped per job via `unique(job_id, place_id)` — no cross-job global dedup in v1 | Q4 — confirmed: `insertLeadSnapshot` (Phase 1 DAL, already built with `onConflictDoNothing`) is called as-is; this phase adds no new dedup logic |

**Note on SCRAPE-01 scope:** per `.planning/STATE.md` Blockers/Concerns, no job-creation *UI* is
required in this phase — SCRAPE-01 is satisfied entirely at the API layer (`POST /api/jobs`
accepting `category`/`location` in a JSON body). A form is incidental Phase 5 UI work.
</phase_requirements>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `POST /api/jobs` request validation + job-row creation | API / Backend | Database / Storage | Route Handler validates and calls the DAL; the DAL/Postgres owns the actual row |
| Checkpointed worker loop (`runScrapeJob`) | API / Backend | External Service (Google Places API) + Database / Storage | Pure server-side orchestration code; it calls out to the Places tier and writes to the DB tier but is itself neither |
| Elapsed-time safety check | API / Backend | — | A pure, in-process time comparison — no I/O, no persistence of its own (see Pitfall 4 on why no new DB column is needed for it) |
| Cursor persistence (`jobs.cursor` jsonb column) | Database / Storage | API / Backend | The column lives in Postgres; the shape/semantics of what's inside it is owned by application code (`lib/jobs/checkpoint.ts`) |
| `after()` scheduling | API / Backend | — (Next.js/Vercel platform primitive) | Framework-level primitive invoked from the Route Handler; not itself a tier, but its duration-sharing behavior with the parent request is the central constraint this phase designs around |

**Single-tier note:** like Phase 2, this phase is backend-only — no UI. It sits directly on top of
Phase 1's DAL (not yet executed, but interface-locked) and Phase 2's `lib/places/*` (built,
verified, unchanged by this phase).
</architectural_responsibility_map>

<research_summary>
## Summary

This phase wires two things together: a `POST /api/jobs` Route Handler (SCRAPE-01/JOB-01) and a
checkpointed worker (JOB-02/JOB-03) that composes Phase 2's `searchTextPlaces`/`fetchNextPage`/
`mapPlaceToLead`/`inferLocale` with Phase 1's `createJob`/`getJob`/`upsertBusiness`/
`insertLeadSnapshot`. Five things were confirmed this session against official sources:

**1. `after()` syntax (Q1).** Confirmed against Next.js's own official docs (fetched directly this
session, version 16.2.10 — same version this project uses): `import { after } from 'next/server'`,
called synchronously inside a Route Handler after the response-producing work is done, accepting a
callback (sync or async). Two behaviors are load-bearing for this phase's design: (a) `after` "will
run for the platform's default or configured max duration of your route" — it does **not** get a
separate time budget from the triggering request, confirming project-level `ARCHITECTURE.md`'s own
finding; (b) `after` "will be executed even if the response didn't complete successfully... including
when an error is thrown" inside the *route handler* — but this does not mean an error *inside the
`after()` callback itself* is surfaced anywhere; it is not (see Pitfall 1).

**2. Route Handler shape (Q1).** Confirmed against Next.js's official Route Handler reference: a
`POST` handler reads the body via the Web `Request.json()` method, returns `Response.json(...)` (or
`NextResponse.json(...)`), and the App Router's segment config exports (`export const maxDuration`,
`export const runtime`) apply per-route. No dynamic `[id]` segment is needed for this phase's only
route (`app/api/jobs/route.ts`) — `GET /api/jobs/:id` is Phase 4 scope.

**3. Checkpointed worker design (Q2/Q3).** Since SCRAPE-01 is a single category + single free-text
location per job (no multi-category/grid fan-out in this phase's scope — that fan-out concern in
project-level `ARCHITECTURE.md` is a *future* scaling lever, not v1 behavior), "one unit of work" is
concretely **one Text Search page fetch** (page 1 has no token; pages 2-3 go through
`fetchNextPage`'s retry/backoff, already built in Phase 2). Text Search's own documented cap is 3
pages / 60 results total (confirmed again in Phase 2's own research) — so a single job's worker loop
runs at most 3 iterations before reaching a natural `done` state. This has a direct consequence for
JOB-03's testability: **the safety-window threshold is not realistically reachable through normal
operation in this phase's scope** (worst case ~3 pages × Phase 2's retry ceiling is on the order of
tens of seconds, far under 250s) — it exists as required defensive behavior (JOB-03 is an explicit,
unconditional requirement) and must be tested by injecting a fake clock, not by waiting out a real
multi-minute job. See Q5/Validation Architecture.

**4. Cursor shape (Q3).** Because `category`/`location` already live on the `jobs` row (Phase 1
schema) and locale is a pure, deterministic function of `location` (`inferLocale`, Phase 2), the
cursor needs to encode only pagination state, not the full request: `{ pageToken: string | null,
pagesFetched: number, done: boolean }`. Elapsed-time tracking is **not** persisted at all — it's a
local `Date.now()` captured at the start of each `after()` invocation (matching project-level
`ARCHITECTURE.md`'s own Pattern 1 example), since each future continuation (Phase 4) is itself a new
serverless invocation with its own fresh duration budget. This resolves an open question from Phase
1's research: no `started_at` column is needed on `jobs` — only `leads_found`, `cursor`, and
`error_reason`, exactly as Phase 1's own `01-RESEARCH.md` schema comment anticipated.

**5. Dedup (Q4) — confirmed, no new code needed.** `insertLeadSnapshot(jobId, place)` (Phase 1 DAL,
interface-locked, uses `onConflictDoNothing({ target: [leads.jobId, leads.placeId] })`) is called
once per mapped lead inside the worker's per-unit loop. This phase's worker does not need — and must
not add — any dedup logic of its own; JOB-07 is fully satisfied by calling the existing function.

**6. Testing without waiting out a real timer or hitting the real API (Q5).** Mirrors Phase 2's own
dependency-injection convention (`fetchImpl`, `sleep`): `runScrapeJob(jobId, deps?)` accepts an
optional `now: () => number` and an optional `fetchOnePage` override (the function that performs one
unit of work — internally composing `searchTextPlaces`/`fetchNextPage`/`mapPlaceToLead`). Pure
checkpointing-logic unit tests fully mock both; a smaller integration-test tier (real test DB, per
Phase 1's established Neon-test-branch convention, but a *stubbed* Places `fetchImpl` per Phase 2's
established convention) proves the real wiring. No test in this phase should wait out a real
multi-second `sleep` or hit the real Places API — both are already-solved problems from Phase 2's own
test suite, reused here via the same injection seams.

**Primary recommendation:** build `lib/jobs/{checkpoint,buildTextQuery,runScrapeJob}.ts` +
`app/api/jobs/route.ts`, add three columns to the existing `jobs` table via an additive Drizzle
migration (`leads_found`, `cursor`, `error_reason` — never editing the Phase 1 migration file
itself), and extend `lib/db/jobs.ts` (Phase 1, not yet executed) with one new function,
`updateJobProgress`, that this phase's worker calls after every unit of work.
</research_summary>

<standard_stack>
## Standard Stack

### Core

No new runtime dependencies. Everything below is already installed (confirmed via `package.json`,
read this session) or is a Next.js/Node built-in.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` (`after`, Route Handlers) | 16.2.10 `[VERIFIED: npm registry — already installed in package.json]` | Post-response background execution + HTTP entry point | Already the project-level, locked design (`ARCHITECTURE.md`); `after()` syntax/semantics reconfirmed directly against official docs this session at the exact installed version |
| `zod` | 4.4.3 `[VERIFIED: npm registry — already installed]` | Validate `POST /api/jobs` request body (`category`, `location`) | Same "validate at boundaries" pattern Phase 1 (`lib/env.ts`) and Phase 2 (Places response) already established; this phase is the third and final planned application of that pattern per `STACK.md` |
| `drizzle-orm` / `drizzle-kit` | 0.45.2 / 0.31.10 `[VERIFIED: npm registry — already installed]` | Additive migration adding `leads_found`/`cursor`/`error_reason` to `jobs`; DAL extension (`updateJobProgress`) | Same Phase 1 pairing — this phase's schema change is additive, not a new tool |
| `server-only` | 0.0.1 `[VERIFIED: npm registry — already installed]` | Guards `lib/jobs/*.ts` (touches `PLACES_API_KEY` transitively via `lib/places/client.ts`, and the DB via `lib/db/*`) from ever being importable client-side | Same mechanism Phase 1/2 established |

### Supporting

None required. `vitest` 4.1.9 (already installed) and the existing `tests/unit/` +
`tests/integration/` split (established by Phase 1's plan, exercised for the first time by Phase 2's
unit tests) cover this phase's entire test surface.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local `Date.now()` captured per invocation (recommended) | A persisted `started_at` column, re-read each invocation | Adds a column and a read for no behavioral gain — each `after()` invocation already gets its own fresh duration budget from the platform, so "time since this invocation began" is correctly a local variable, not persisted state (see Summary point 4) |
| Hand-rolled `updateJobProgress` (recommended) | A generic "patch any subset of columns" helper | The set of fields this phase ever updates (`status`, `leadsFound`, `cursor`, `errorReason`) is small and fixed; a fully generic patch helper adds abstraction this phase's actual call sites don't need — matches Phase 1's own "hand-write the `set` object" precedent for `upsertBusiness` |

**Installation:** none — no new packages required.
</standard_stack>

<package_legitimacy_audit>
## Package Legitimacy Audit

No new packages are being installed in this phase — `next`, `zod`, `drizzle-orm`, `drizzle-kit`, and
`server-only` are already present in `package.json` (installed during Phase 1/2). No legitimacy
audit disposition is required.

**Packages removed due to `[SLOP]` verdict:** none — none were candidates for removal.
**Packages flagged as suspicious `[SUS]`:** none.
</package_legitimacy_audit>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
POST /api/jobs  (Zod: category, location)
        │
        ▼
  createJob({category, location})  ──▶  jobs row: status='pending'
        │
        ├── after(() => runScrapeJob(jobId))   [scheduled, NOT awaited]
        │
        ▼
  Response.json({ jobId }, { status: 201 })     ◀── returned to caller BEFORE
                                                      the callback below runs
   ════════════════ response sent ════════════════

  after() callback fires post-response:
        │
        ▼
  runScrapeJob(jobId)
        │
        ▼
  getJob(jobId) ──▶ cursor = job.cursor ?? initialCursor()   (resume point; on
        │                                                      first run this is
        │                                                      page 1, no token)
        ▼
  ┌─────────────────────────── loop: one iteration = one unit of work ───┐
  │  now() - startedAt > SAFETY_WINDOW_MS ?                              │
  │        │ yes                              │ no                       │
  │        ▼                                  ▼                          │
  │  updateJobProgress(status='partial',  fetchOnePage(category,         │
  │    leadsFound, cursor) ──▶ RETURN       location, cursor)            │
  │                                            │                          │
  │                              inferLocale(location) ─▶ searchTextPlaces│
  │                              / fetchNextPage (Phase 2, unchanged)     │
  │                                            │                          │
  │                              mapPlaceToLead per result (Phase 2)      │
  │                                            │                          │
  │                          for each mapped lead:                       │
  │                            upsertBusiness(lead)   (Phase 1 DAL)       │
  │                            insertLeadSnapshot(jobId, lead) (Phase 1)  │
  │                                            │                          │
  │                          updateJobProgress(status='running',          │
  │                            leadsFound += n, cursor = nextCursor)      │
  │                                            │                          │
  │                          cursor.done? ──── loop again if not ────────┘
  │                                │ yes
  │                                ▼
  │                  updateJobProgress(status='done', cursor=null)
  └────────────────────────────────────────────────────────────────────
        (any thrown error, anywhere in the loop, is caught once at the
         outer boundary and written as status='error' — see Pitfall 1)
```

A reader tracing "Richard submits a category+location job": `POST /api/jobs` validates and inserts a
`pending` row, schedules `runScrapeJob` via `after()`, and returns `{ jobId }` — all before any
Places API call happens. The worker then runs entirely post-response, one page fetch at a time,
persisting `leads_found`/`cursor` after each page, until either the job completes (`done`), the
250s-class safety window is hit (`partial`, resumable — actual resumption is Phase 4's `GET
/api/jobs/:id` continuation trigger, out of this phase's scope), or an unrecoverable error occurs
(`error`, with a reason).

### Recommended Project Structure

```
lib/
├── db/
│   ├── schema.ts            # MODIFIED (Phase 1 file): jobs gets leads_found/cursor/error_reason
│   └── jobs.ts               # MODIFIED (Phase 1 file, extended): + updateJobProgress
├── jobs/
│   ├── checkpoint.ts          # SAFETY_WINDOW_MS, JobCursor helpers, hasExceededSafetyWindow()
│   ├── buildTextQuery.ts       # pure: (category, location) -> textQuery string
│   └── runScrapeJob.ts          # the checkpointed worker loop (Code Example 3)
drizzle/
└── 0001_*.sql                # generated by `drizzle-kit generate` — additive, does not touch 0000_*.sql
app/
└── api/
    └── jobs/
        └── route.ts            # POST handler (Code Example 1)
tests/
├── unit/
│   └── lib/
│       └── jobs/
│           ├── checkpoint.test.ts
│           ├── buildTextQuery.test.ts
│           └── runScrapeJob.test.ts        # fully mocked deps — checkpointing logic only
├── integration/
│   └── jobs/
│       └── runScrapeJob.test.ts             # real test DB + stubbed Places fetchImpl
└── unit/
    └── app/
        └── api/
            └── jobs/
                └── route.test.ts             # calls POST() directly; mocks next/server's after
```

### Pattern 1: Checkpointed worker loop with injectable clock + search unit (JOB-02, JOB-03, Q5)

**What:** `runScrapeJob` takes optional `now` and `fetchOnePage` overrides, mirroring Phase 2's
`fetchImpl`/`sleep` injection convention exactly.
**When to use:** this is the only place in the codebase JOB-02/JOB-03's behavior lives — do not
duplicate the safety-window check anywhere else.
**Example:** see Code Example 3.

### Pattern 2: Additive migration extending a Phase 1 table (not a new table)

**What:** `jobs` already exists (Phase 1, not yet executed but interface-locked); this phase adds
three nullable-or-defaulted columns via a **new** migration file, never touching the first
migration.
**When to use:** exactly this situation — a later phase needs columns a prior phase's schema didn't
yet need. Confirmed compatible with this repo's own "additive migrations, never edit a shipped one"
rule (`coding-rules.md`) and with Phase 1's own research comment anticipating this exact addition.
**Example:** see Code Example 4.

### Pattern 3: Category+location composed into `textQuery`, not passed as separate geographic params

**What:** Google's Text Search (New) documented query format combines category and location into
one natural-language string — e.g. "pizza in New York", "shoe stores near Ottawa" (confirmed
directly against Google's own Text Search docs this session). Phase 2's locked `TextSearchParams`
interface has no `locationBias`/`locationRestriction` field (only `textQuery`, `languageCode`,
`regionCode`, `pageToken`, `pageSize`) — composing `${category} in ${location}` into `textQuery` is
therefore not just idiomatic, it's the *only* geographic-scoping mechanism available through the
already-built, already-locked Phase 2 client (`regionCode` alone is a soft ranking bias, not a hard
geographic filter — confirmed against Google's docs this session).
**When to use:** every call this worker makes to `searchTextPlaces`.
**Example:** see Code Example 2 (`buildTextQuery`).

### Anti-Patterns to Avoid
- **Persisting elapsed-time state to the DB:** the safety-window check is a local, per-invocation
  `Date.now()` comparison — not a DB column. See Summary point 4 / Pitfall 4.
- **Re-implementing dedup inside the worker:** `insertLeadSnapshot`'s `onConflictDoNothing` already
  satisfies JOB-07 — do not add a `Set<placeId>` check or similar inside `runScrapeJob`.
- **Awaiting `after()`'s callback, or doing any Places/DB work before calling `after()`:** defeats
  JOB-01's "returns `{ jobId }` immediately" requirement. `after(() => runScrapeJob(jobId))` must be
  scheduled (not awaited) and the response constructed and returned independently.
- **Testing JOB-03 by actually waiting ~250 real seconds:** inject `now` instead (Pattern 1) — see
  Validation Architecture.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-job lead dedup (JOB-07) | A `Set`/`Map` of seen `place_id`s inside the worker loop | `insertLeadSnapshot` (Phase 1 DAL, already `onConflictDoNothing` on `(jobId, placeId)`) | Already solved, atomically, at the DB layer — an in-memory Set would also silently reset on every new `after()` invocation (Phase 4 continuations), reintroducing exactly the bug a DB constraint prevents |
| Waiting for a real timer to test the safety-window cutoff (JOB-03) | `vi.useFakeTimers()` + real `setTimeout`/`Date.now()` coupling, or literally sleeping the test | Inject `now: () => number` into `runScrapeJob` (Pattern 1) | A real-timer-based test either takes ~250s to run or requires global fake-timer machinery Phase 2 deliberately avoided for the same reason (see Phase 2's own `sleep` injection rationale) |
| Locale/geographic scoping for the search query | A geocoding call, or a new `locationBias` field bolted onto Phase 2's locked client | `inferLocale(location)` (Phase 2, unchanged) + `buildTextQuery` composing category+location into one string (Pattern 3) | Phase 2's interface is locked and already handles locale; the documented Google pattern for category+location is string composition, not a separate API parameter this app doesn't have wired up |
| Multi-page pagination retry | A second retry/backoff implementation inside `runScrapeJob` | `fetchNextPage` (Phase 2, unchanged) — `runScrapeJob` calls it once per page ≥2, exactly as one unit of work | Phase 2 already built and tested this; re-implementing it here would both duplicate code and desynchronize from Phase 2's tuned `DEFAULT_PAGE_TOKEN_RETRY` |

**Key insight:** almost everything this phase's worker needs already exists in Phase 1 (DAL,
interface-locked) or Phase 2 (Places client, built and verified) — this phase's actual net-new code
is narrow: the checkpoint/loop orchestration, the `POST` route, and three new columns. Resist the
urge to re-solve anything Phase 1/2 already solved.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: An error thrown inside the `after()` callback is not surfaced anywhere except server logs
**What goes wrong:** Next.js's own docs (confirmed this session) state `after` runs even when the
route handler itself throws or the response fails — but that guarantee is about the *response path*,
not about errors thrown *inside the `after()` callback*. If `runScrapeJob` throws uncaught inside the
callback, there is no HTTP response left to attach the error to — Vercel/Next.js logs it server-side
and the job row is left exactly wherever it last was (e.g. still `pending` if the crash happened
before the first `updateJobProgress` call), with no `error` status and no reason, silently
contradicting the project's own stated intent ("Places API failures → job `status: error`, not a
silent empty result").
**Why it happens:** it's easy to assume "`after` survives errors" (true, per the docs) means "errors
inside `after` are handled" (false) — these are two different claims the docs' wording can blur.
**How to avoid:** wrap the *entire* loop body of `runScrapeJob` in a single `try { ... } catch (err) {
await updateJobProgress(jobId, { status: 'error', ... }) }` (Code Example 3) — the DB write for
`status: 'error'` must itself be the very last thing that can fail, since there's nowhere further to
report an error from at that point.
**Warning signs:** a job stuck in `pending`/`running` forever with no `error_reason`, no correlating
error visible anywhere in the UI/DB (only in server logs, if those are even being captured).

### Pitfall 2: `error_reason` storing a raw, unfiltered `err.message` can leak internal details
**What goes wrong:** `errorReason: err instanceof Error ? err.message : 'Unknown error'` is a
reasonable default for known error types, but an *unexpected* error (a Postgres driver error, a
Neon connection error) could have a `.message` containing partial connection-string details or other
internal information — which this phase's schema durably stores and a later phase (JOB-05/CRM-05)
will render directly in the UI.
**Why it happens:** `err.message` is the path of least resistance for "store something useful," and
it usually *is* useful (e.g. `PlacesApiError`'s message is deliberately just `Places API request
failed: ${status}` — safe, confirmed by reading Phase 2's actual code this session) — but "usually
safe" isn't "always safe" once error types outside this phase's own code can reach the catch block.
**How to avoid:** for known error classes (`PlacesApiError`, a Zod parse error) store the message as-is
(already designed to be safe); for anything else, store a generic `'Unexpected worker error'` and
rely on server-side logging (out of this phase's scope to build, but don't block on it — just don't
let unknown error messages reach the DB/UI raw).
**Warning signs:** an `error_reason` value in the DB containing a URL, a stack trace, or anything
that looks like a connection string.

### Pitfall 3: Building `textQuery` without the location silently returns unscoped/wrong-city results
**What goes wrong:** if `buildTextQuery` (or a call site) only passes `category` as `textQuery` and
relies on `regionCode` alone to scope the search, results will be biased toward the *whole country*
associated with `regionCode`, not the specific city in `location` — `regionCode` is a soft
formatting/ranking bias, not a geographic filter (confirmed against Google's own docs this session,
Pattern 3 above).
**Why it happens:** `regionCode`/`languageCode` are already being threaded through from
`inferLocale` for SCRAPE-03, making it easy to assume they also handle "which city" — they don't.
**How to avoid:** always compose `textQuery` as `${category} in ${location}` (Code Example 2) — never
send `category` alone.
**Warning signs:** a Toronto job returning results from Vancouver or Ottawa; a Lima job returning
results from another Peruvian city.

### Pitfall 5 (RESOLVED before Phase 3 planning — kept for history): `fetchNextPage`'s retry didn't fire against a real `PlacesApiError`
**Status: fixed at commit `4ab1a23`, before this phase's plans were written.** Originally found
this session by reading both files directly: `lib/places/paginate.ts`'s `isTokenNotYetActiveError`
matched on `err.message.includes('INVALID_REQUEST')`, but `lib/places/client.ts`'s `PlacesApiError`
constructed its `.message` as `` `Places API request failed: ${status}` `` with no body — the
literal string `'INVALID_REQUEST'` lived only in `.body`, never `.message`. The fix (applied
directly, not deferred to this phase) changed `PlacesApiError`'s constructor to
`` super(`Places API request failed: ${status}: ${body}`) `` — `.message` now includes the body
text, so the existing `err.message.includes('INVALID_REQUEST')` check works against a real
`PlacesApiError` without needing a `.body`-specific check or an `instanceof PlacesApiError` branch.
A regression test using a real `PlacesApiError` instance (not a generic `Error`) already exists in
`tests/unit/lib/places/paginate.test.ts` ("retries on a real PlacesApiError whose INVALID_REQUEST
reason lives in the response body, not message alone"). **No task in this phase's plans touches
`lib/places/paginate.ts` or `client.ts` — that is correct, not a gap.** Read the current
`lib/places/client.ts` before relying on this section if resuming after a long gap, to confirm the
fix is still in place.
**Why it happened:** a pre-existing Phase 2 defect (Phase 2 shipped and was marked complete) that
this phase's research was the first to actually exercise end-to-end — Phase 2's own unit tests
passed because they stubbed a matching-shaped generic `Error`, not the real error type Phase 2's
own client throws.

### Pitfall 4: Adding a persisted `started_at` column "to be safe" — unnecessary and subtly wrong
**What goes wrong:** it's tempting to add a `started_at` timestamp column to `jobs` (set once, read
on every checkpoint) to compute elapsed time for the safety-window check. This is subtly wrong for
Phase 4's continuation model: a *new* `after()` invocation (triggered by a later `GET
/api/jobs/:id` poll) gets its *own* fresh duration budget from the platform — measuring elapsed time
from the *original* job creation would cause the safety-window check to immediately (and
incorrectly) trip on the very first checkpoint of a resumed continuation, since real wall-clock time
since job creation could already exceed 250s even though the new invocation just started.
**Why it happens:** "elapsed time" intuitively suggests "since the job started," which reads as a
DB-durable fact — but the thing actually being bounded is "time since *this serverless invocation*
began," which is inherently invocation-scoped, not job-scoped.
**How to avoid:** capture `const startedAt = now()` as a local variable at the top of `runScrapeJob`,
every time it's called (fresh invocation, fresh clock) — never persist or read a `started_at` value
from the DB. See Code Example 3.
**Warning signs:** a resumed (Phase 4) job immediately re-flipping to `partial` on its very first
checkpoint after resuming, with almost no new progress made.
</common_pitfalls>

<code_examples>
## Code Examples

### 1. `app/api/jobs/route.ts` — POST handler (SCRAPE-01, JOB-01)
```typescript
// Source: nextjs.org/docs/app/api-reference/functions/after (fetched this session, v16.2.10) +
// nextjs.org/docs/app/api-reference/file-conventions/route (fetched this session, v16.2.10)
import { after } from 'next/server'
import { z } from 'zod'
import { createJob } from '@/lib/db/jobs'
import { runScrapeJob } from '@/lib/jobs/runScrapeJob'

// Explicit per Vercel's official duration-config pattern (vercel.com/docs/functions/
// configuring-functions/duration, fetched this session): Hobby's default/max is already
// 300s and this doesn't raise it, but it's the one-line lever for a future Pro upgrade
// (see project-level ARCHITECTURE.md Scaling Considerations) and documents the intent
// explicitly rather than relying on an implicit platform default.
export const runtime = 'nodejs'
export const maxDuration = 300

// "validated against Toronto and Lima" (SCRAPE-01) refers to this phase's QA markets, not
// a runtime allowlist — PROJECT.md Constraints: "the location field itself is free-text,
// not a hardcoded enum." No market restriction belongs in this schema.
const createJobSchema = z.object({
  category: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = createJobSchema.safeParse(body)

  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { id } = await createJob(parsed.data)

  // Scheduled, NOT awaited — the response below returns before this runs.
  after(() => runScrapeJob(id))

  return Response.json({ jobId: id }, { status: 201 })
}
```

### 2. `lib/jobs/buildTextQuery.ts` — category+location composition (Pattern 3)
```typescript
// Source: developers.google.com/maps/documentation/places/web-service/text-search
// (documented query format "pizza in New York", "shoe stores near Ottawa" — fetched this session)
export function buildTextQuery(category: string, location: string): string {
  return `${category} in ${location}`
}
```

### 3. `lib/jobs/runScrapeJob.ts` — the checkpointed worker (JOB-02, JOB-03, JOB-07)
```typescript
// Composes Phase 1's DAL (lib/db/{jobs,businesses,leads}.ts — interface-locked, not yet
// executed) and Phase 2's Places client (lib/places/* — built, verified, unchanged here).
import 'server-only'
import { getJob, updateJobProgress } from '@/lib/db/jobs'
import { upsertBusiness } from '@/lib/db/businesses'
import { insertLeadSnapshot } from '@/lib/db/leads'
import { searchTextPlaces } from '@/lib/places/client'
import { fetchNextPage } from '@/lib/places/paginate'
import { mapPlaceToLead, type MappedLead } from '@/lib/places/mapPlaceToLead'
import { inferLocale } from '@/lib/places/locale'
import { buildTextQuery } from './buildTextQuery'
import { SAFETY_WINDOW_MS, MAX_PAGES, initialCursor, type JobCursor } from './checkpoint'

interface FetchOnePageResult {
  mapped: MappedLead[]
  nextCursor: JobCursor
}

async function defaultFetchOnePage(
  category: string,
  location: string,
  cursor: JobCursor,
): Promise<FetchOnePageResult> {
  const { languageCode, regionCode } = inferLocale(location)
  const textQuery = buildTextQuery(category, location)
  const doFetch = () =>
    searchTextPlaces({
      textQuery,
      languageCode,
      regionCode,
      ...(cursor.pageToken ? { pageToken: cursor.pageToken } : {}),
    })

  // Page 1 has no token — fetch directly. Pages 2-3 go through Phase 2's
  // retry/backoff wrapper (SCRAPE-06), unchanged.
  const response = cursor.pageToken ? await fetchNextPage(doFetch) : await doFetch()

  const mapped = response.places
    .map(mapPlaceToLead)
    .filter((lead): lead is MappedLead => lead !== null)

  const pagesFetched = cursor.pagesFetched + 1
  const hasMore = Boolean(response.nextPageToken) && pagesFetched < MAX_PAGES

  return {
    mapped,
    nextCursor: {
      pageToken: hasMore ? (response.nextPageToken ?? null) : null,
      pagesFetched,
      done: !hasMore,
    },
  }
}

export interface RunScrapeJobDeps {
  now: () => number
  fetchOnePage: (category: string, location: string, cursor: JobCursor) => Promise<FetchOnePageResult>
}

export async function runScrapeJob(jobId: string, deps: Partial<RunScrapeJobDeps> = {}): Promise<void> {
  const now = deps.now ?? (() => Date.now())
  const fetchOnePage = deps.fetchOnePage ?? defaultFetchOnePage

  // Local, per-invocation clock — see Pitfall 4. Never persisted or read from the DB.
  const startedAt = now()

  const job = await getJob(jobId)
  if (!job) throw new Error(`runScrapeJob: job ${jobId} not found`)

  let cursor: JobCursor = job.cursor ?? initialCursor()
  let leadsFound = job.leadsFound ?? 0

  try {
    // Write 'running' before any Places call — an invocation killed mid-page-1
    // (before the first post-unit checkpoint) would otherwise leave the row at
    // 'pending' with no error, the same silent-stuck failure Pitfall 1 targets.
    // Phase 4's stale-job watchdog (JOB-05) is a second layer, not a substitute.
    await updateJobProgress(jobId, { status: 'running', leadsFound, cursor })

    while (!cursor.done) {
      if (now() - startedAt > SAFETY_WINDOW_MS) {
        // Stop cleanly — JOB-03. Actual resumption is triggered by Phase 4's
        // GET /api/jobs/:id continuation guard, out of this phase's scope.
        await updateJobProgress(jobId, { status: 'partial', leadsFound, cursor })
        return
      }

      const { mapped, nextCursor } = await fetchOnePage(job.category, job.location, cursor)

      // JOB-07: insertLeadSnapshot already dedupes on (jobId, placeId) via
      // onConflictDoNothing (Phase 1 DAL) — no dedup logic added here.
      for (const lead of mapped) {
        await upsertBusiness(lead)
        await insertLeadSnapshot(jobId, lead)
      }

      leadsFound += mapped.length
      cursor = nextCursor

      // JOB-02: checkpoint after every unit of work.
      await updateJobProgress(jobId, { status: 'running', leadsFound, cursor })
    }

    await updateJobProgress(jobId, { status: 'done', leadsFound, cursor: null })
  } catch (err) {
    // See Pitfall 1: this is the only place an error inside after() can be
    // surfaced at all — no HTTP response exists to attach it to.
    await updateJobProgress(jobId, {
      status: 'error',
      leadsFound,
      cursor,
      // See Pitfall 2: only known-safe error messages pass through raw.
      errorReason:
        err instanceof Error && (err.name === 'PlacesApiError' || err.name === 'ZodError')
          ? err.message
          : 'Unexpected worker error',
    })
  }
}
```

### 4. `lib/jobs/checkpoint.ts` — cursor shape + safety-window constant (JOB-02, JOB-03)
```typescript
export interface JobCursor {
  pageToken: string | null
  pagesFetched: number
  done: boolean
}

export function initialCursor(): JobCursor {
  return { pageToken: null, pagesFetched: 0, done: false }
}

// ~250s, leaving headroom under Vercel Hobby's non-configurable 300s ceiling
// (vercel.com/docs/functions/configuring-functions/duration, re-confirmed this
// session: Hobby default AND maximum are both exactly 300s, not overridable).
export const SAFETY_WINDOW_MS = 250_000

// Text Search (New)'s own documented hard cap — 3 pages of up to 20 results
// each (60 total). Enforced defensively here even though Google itself should
// stop returning nextPageToken after page 3.
export const MAX_PAGES = 3
```

### 5. Additive migration — `jobs` table gains three columns (extends Phase 1's schema.ts)
```typescript
// lib/db/schema.ts — MODIFY the existing `jobs` table definition (Phase 1, not yet
// executed but interface-locked). Do NOT touch the generated 0000_*.sql migration file
// itself — `drizzle-kit generate` produces a NEW migration file for this addition.
import { jsonb, integer, text /* + existing imports */ } from 'drizzle-orm/pg-core'
import type { JobCursor } from '@/lib/jobs/checkpoint'

export const jobs = pgTable('jobs', {
  // ...existing columns from Phase 1 (id, status, category, location, createdAt, updatedAt)...
  leadsFound: integer('leads_found').notNull().default(0),
  cursor: jsonb('cursor').$type<JobCursor>(),
  errorReason: text('error_reason'),
})
```
```bash
# Source: orm.drizzle.team/docs/column-types/pg (jsonb + .$type<T>(), fetched this session)
pnpm exec drizzle-kit generate   # produces drizzle/0001_*.sql — ALTER TABLE jobs ADD COLUMN...
# Read the generated SQL before applying (Phase 1's own established discipline) — it
# should contain only ADD COLUMN statements, no DROP.
pnpm exec drizzle-kit migrate
```
`jsonb().$type<JobCursor>()` gives compile-time typing only — Drizzle's own docs state this
"won't check runtime values" `[CITED: orm.drizzle.team/docs/column-types/pg]`. Since `cursor` is
only ever written by this phase's own code (never parsed from external/untrusted input), no
additional Zod validation of the cursor's shape is needed at the DB boundary.

### 6. `lib/db/jobs.ts` — extending Phase 1's DAL with `updateJobProgress`
```typescript
// ADDS to the existing lib/db/jobs.ts (Phase 1, not yet executed — this phase extends it
// alongside createJob/getJob, which already exist per Plan 01-04's interface).
import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { jobs, type jobStatusEnum } from '@/lib/db/schema'
import type { JobCursor } from '@/lib/jobs/checkpoint'

export async function updateJobProgress(
  jobId: string,
  params: {
    status: (typeof jobStatusEnum.enumValues)[number]
    leadsFound: number
    cursor: JobCursor | null
    errorReason?: string | null
  },
): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: params.status,
      leadsFound: params.leadsFound,
      cursor: params.cursor,
      errorReason: params.errorReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId))
}
```

### 7. Mocking `next/server`'s `after` in a route-handler test
```typescript
// tests/unit/app/api/jobs/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const afterMock = vi.fn()
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: afterMock }
})

vi.mock('@/lib/db/jobs', () => ({
  createJob: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
}))

vi.mock('@/lib/jobs/runScrapeJob', () => ({
  runScrapeJob: vi.fn(),
}))

describe('POST /api/jobs', () => {
  beforeEach(() => afterMock.mockClear())

  it('returns jobId immediately and schedules the worker via after() without awaiting it', async () => {
    const { POST } = await import('@/app/api/jobs/route')
    const { runScrapeJob } = await import('@/lib/jobs/runScrapeJob')

    const req = new Request('http://localhost/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ category: 'restaurant', location: 'Toronto, ON' }),
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({ jobId: 'test-job-id' })
    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(runScrapeJob).not.toHaveBeenCalled() // not invoked synchronously

    // Invoking the captured callback separately proves it's wired correctly,
    // without that invocation being part of the "immediate response" assertion above.
    await afterMock.mock.calls[0][0]()
    expect(runScrapeJob).toHaveBeenCalledWith('test-job-id')
  })
})
```
</code_examples>

<validation_architecture>
## Validation Architecture

`workflow.nyquist_validation` is enabled (`.planning/config.json`) and not overridden.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` 4.1.9 (already installed and configured — `vitest.config.ts` read this session) |
| Config file | `vitest.config.ts` (already handles `server-only`'s `react-server` condition and injects a placeholder `PLACES_API_KEY`/test `DATABASE_URL`) |
| Quick run command | `pnpm vitest run <file>` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCRAPE-01 / JOB-01 | `POST /api/jobs` with valid `category`/`location` inserts a `pending` job and returns `{ jobId }` before the worker runs; invalid body returns 400 | unit (mocked `after`, `createJob`, `runScrapeJob`) | `pnpm vitest run tests/unit/app/api/jobs/route.test.ts` | ❌ Wave 0 |
| JOB-02 | Each loop iteration calls `updateJobProgress` exactly once with incrementing `leadsFound`/advancing `cursor` | unit (mocked `fetchOnePage`, mocked DAL) | `pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts -t "checkpoints after every unit"` | ❌ Wave 0 |
| JOB-03 | Injected `now` exceeding `SAFETY_WINDOW_MS` after the first unit causes the loop to stop and write `status: 'partial'` with the saved cursor, without calling `fetchOnePage` again | unit (injected `now`, mocked `fetchOnePage`) | `pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts -t "safety window"` | ❌ Wave 0 |
| JOB-02/JOB-03 (real wiring) | A job with real `category`/`location`, stubbed Places `fetchImpl` (reusing Phase 2's fixtures), and a real test DB completes with correct `leads`/`businesses` rows and a `done` status | integration | `pnpm vitest run tests/integration/jobs/runScrapeJob.test.ts` | ❌ Wave 0 |
| JOB-07 | Calling `runScrapeJob`'s per-unit insert path twice for the same `(jobId, placeId)` (simulated retry) produces exactly one `leads` row | integration (real test DB) | `pnpm vitest run tests/integration/jobs/runScrapeJob.test.ts -t "dedup"` | ❌ Wave 0 |
| — (worker error path, defensive, not a numbered requirement but required by JOB-03's "safe" framing) | A thrown `PlacesApiError` inside the loop results in `status: 'error'` with a safe `errorReason`, not a silently stuck job | unit | `pnpm vitest run tests/unit/lib/jobs/runScrapeJob.test.ts -t "error path"` | ❌ Wave 0 |
| Pattern 3 / Pitfall 3 | `buildTextQuery('restaurant', 'Toronto, ON')` produces a string containing both terms | unit | `pnpm vitest run tests/unit/lib/jobs/buildTextQuery.test.ts` | ❌ Wave 0 |
| Pitfall 5 / Open Question 3 (regression, blocks trusting SCRAPE-06 inside this phase's worker) | A real `PlacesApiError(400, '...INVALID_REQUEST...')` — not a generic `Error` — thrown on the first `fetchPage` call inside `fetchNextPage` is retried, not rethrown immediately | unit (`lib/places/paginate.ts`, patched per Pitfall 5) | `pnpm vitest run tests/unit/lib/places/paginate.test.ts -t "PlacesApiError"` | ❌ Wave 0 — new test case in an existing Phase 2 file, plus the corresponding one-line fix to `isTokenNotYetActiveError` |

**No test in this phase waits out a real multi-second `sleep` or ~250s timer**, and none calls the
real Google Places API — both are avoided via the same dependency-injection seams Phase 2 already
established (`fetchImpl`, `sleep`) plus this phase's own `now`/`fetchOnePage` injection points.

### Sampling Rate
- **Per task commit:** the relevant `pnpm vitest run <file>` from the table above.
- **Per wave merge:** `pnpm vitest run` (full suite, including Phases 1-2's existing tests).
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/lib/jobs/checkpoint.test.ts`, `buildTextQuery.test.ts`, `runScrapeJob.test.ts` — none exist yet
- [ ] `tests/integration/jobs/runScrapeJob.test.ts` — none exists yet; depends on Phase 1's `lib/db/*` actually existing (blocked until Phase 1 executes — see Environment Availability)
- [ ] `tests/unit/app/api/jobs/route.test.ts` — none exists yet
- [ ] `lib/db/jobs.ts`'s `updateJobProgress` — needs to exist before any of the above can pass; this phase's plan must sequence it early (alongside the schema migration), not as an afterthought
- [x] `lib/places/paginate.ts`'s `isTokenNotYetActiveError` fix (Pitfall 5) — already resolved at
      commit `4ab1a23` before this phase's plans were written; regression test already exists in
      `tests/unit/lib/places/paginate.test.ts`. No task needed in this phase's plans.
</validation_architecture>

<security_domain>
## Security Domain

`security_enforcement` is on (ASVS Level 1, block on `high`) per `.planning/config.json`. Same
structural non-applicability as Phases 1-2 for auth/session categories (no login in this app by
design).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No login exists or is planned for v1 |
| V3 Session Management | No | No sessions |
| V4 Access Control | Partial (carried from Phase 1) | `jobs.id` is `uuid` (Phase 1 schema decision), mitigating trivial enumeration over the still-unauthenticated job surface this phase adds a write path to |
| V5 Input Validation | Yes | Zod validation of `POST /api/jobs`'s `category`/`location` body — this phase's one new untrusted-input boundary |
| V6 Cryptography | N/A | No cryptographic operations in this phase |
| Secure Configuration | Yes (carried) | `PLACES_API_KEY`/`DATABASE_URL` continue to flow only through `lib/env.ts` (Phase 1) and `lib/db/client.ts`; `lib/jobs/*.ts` starts with `import 'server-only'` |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Unbounded/malicious `category`/`location` strings (very long input, embedded control characters) sent to Google's Text Search API via `textQuery` | Denial of Service / Tampering (cost amplification against the Enterprise-tier-billed Places API, per project-level `PITFALLS.md` Pitfall 3) | `z.string().trim().min(1).max(200)` bounds both fields before they ever reach `buildTextQuery`/`searchTextPlaces` |
| Internal error details leaking into the persisted, later-UI-rendered `error_reason` column | Information Disclosure | Only known-safe error types (`PlacesApiError`, Zod errors) pass their `.message` through; everything else is replaced with a generic message (Pitfall 2, Code Example 3) |
| An uncaught error inside the `after()` callback leaving a job silently stuck with no `error` status | Denial of Service (to the user's own visibility, not the system) | The entire worker loop is wrapped in one `try/catch` that always resolves to a terminal, informative status (Pitfall 1, Code Example 3) — no code path inside `runScrapeJob` can throw past this boundary |
| `category`/`location` (untrusted) flowing into `businesses`/`leads` columns via the existing Phase 1 DAL | Tampering | Already mitigated structurally by Drizzle's parameterized `.values()` API (Phase 1's own Security Domain) — this phase adds no raw SQL |
</security_domain>

<open_questions>
## Open Questions

1. **Should the worker cap the number of `updateJobProgress` writes for very short pages (e.g.
   batch the per-lead `upsertBusiness`/`insertLeadSnapshot` calls before checkpointing), or is
   one checkpoint write per page (as designed) sufficiently granular?**
   - What we know: JOB-02 requires progress to persist "after every unit," and this research
     defines "unit" as one page fetch (up to 20 results), not one lead — so `updateJobProgress` is
     already only called once per page, not once per lead.
   - What's unclear: whether 20 sequential `upsertBusiness`/`insertLeadSnapshot` calls per page (via
     `neon-http`, which has no interactive transactions — see project-level `STACK.md`) should be
     grouped via `db.batch()` for a small latency win, or left sequential for simplicity.
   - Recommendation: leave sequential for this phase (simpler, and each call is idempotent via
     `onConflictDoNothing`/`onConflictDoUpdate` so a partial-page failure mid-loop is still safe —
     `db.batch()` is a pure latency optimization, not a correctness requirement); revisit only if
     real-world page-processing latency becomes a problem.

2. **Does `MAX_PAGES = 3` ever actually get exercised before Google's own `nextPageToken` absence
   naturally stops pagination?**
   - What we know: project-level `PITFALLS.md` states Text Search (New) returns a maximum of 60
     results across 3 pages; this phase's own defensive `MAX_PAGES` constant assumes Google may
     (in some edge case) still return a `nextPageToken` after page 3.
   - What's unclear: whether this has ever been observed in practice — no primary source confirms
     or denies a token being present after the 3rd page.
   - Recommendation: keep `MAX_PAGES` as a named, exported constant (matches Phase 2's own
     `DEFAULT_PAGE_TOKEN_RETRY` pattern) — cheap defensive code, and directly testable by a fixture
     asserting a page-3 response with a (hypothetical) `nextPageToken` still present is treated as
     `done: true` regardless.

3. **RESOLVED before Phase 3 planning — see Pitfall 5.** `PlacesApiError`'s `.message` now
   includes `.body` (commit `4ab1a23`), so `isTokenNotYetActiveError`'s existing `err.message`
   check already matches a real `PlacesApiError`. A regression test using a real `PlacesApiError`
   instance exists in `tests/unit/lib/places/paginate.test.ts`. No task needed in this phase's
   plans — do not re-open this as a planning gap.

4. **Is `errorReason` column length unbounded (`text`, no max), and could a very long/malicious
   error message from an unexpected code path still exceed reasonable UI display bounds even after
   Pitfall 2's mitigation?**
   - What we know: `text` in Postgres has no length ceiling (same reasoning Phase 1 applied to
     `place_id`); the known-safe error paths (`PlacesApiError`, Zod) produce short, bounded messages.
   - What's unclear: whether a future error type not anticipated here could still produce something
     long even after being caught by the generic fallback.
   - Recommendation: not a blocker for this phase (the generic fallback string is itself short and
     safe) — flag for Phase 5 (CRM/job-history UI) to truncate `error_reason` display defensively
     regardless of what's stored, as a UI-layer concern, not a storage-layer one.
</open_questions>

<assumptions_log>
## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | "One unit of work = one Text Search page fetch" (not one grid cell / one keyword variant) is the correct scope for JOB-02, given SCRAPE-01's single-category/single-location job shape | Summary point 3, Architecture Patterns | Low — if a future phase adds multi-category fan-out per job, the cursor shape (`JobCursor`) would need a new field (e.g. `categoryIndex`) but the checkpoint *pattern* itself (loop + safety check + persist) is unchanged, not a redesign |
| A2 | `MAX_PAGES = 3` enforced defensively in the worker, even though Google's own pagination should stop after 3 pages on its own | Code Example 3-4, Open Question 2 | Low — pure defensive code; wrong only in the sense of being unnecessary, never in the sense of causing incorrect behavior |
| A3 | `export const maxDuration = 300` should be set explicitly on the route even though it matches Hobby's unconfigurable default | Code Example 1 | Low — purely documentation/forward-compatibility value; has zero behavioral effect on Hobby, and is the exact lever `ARCHITECTURE.md` already recommends flipping when upgrading to Pro |
| A4 | Generic (non-`PlacesApiError`/non-Zod) errors should be replaced with a fixed generic message rather than stored raw, unbounded | Pitfall 2, Code Example 3 | Medium if wrong in the other direction — under-informative generic messages could make real debugging harder; mitigated by recommending server-side logging as a separate, later concern (Open Question 4) rather than relying on `error_reason` for full debuggability |
| A5 | `isTokenNotYetActiveError`'s message-vs-body mismatch (Pitfall 5) is a genuine bug, not an intentional design where callers are expected to inspect `.body` themselves before calling `fetchNextPage` | Pitfall 5, Open Question 3 | Medium-high if wrong — if this was deliberate, the recommended fix would be misplaced and the real fix belongs at each call site instead; verified by reading both files and the existing test directly this session (not merely inferred), which is the strongest available evidence short of asking the original implementer, so risk is bounded |

**If this table is empty:** N/A — see rows above.
</assumptions_log>

<environment_availability>
## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `lib/db/{jobs,businesses,leads}.ts` (Phase 1 DAL) | Every DB write this phase's worker makes | **Not yet built** (confirmed via `ls lib/db` this session — directory doesn't exist) — Phase 1 has not executed | — | None needed to *research or plan* this phase — every function signature this research depends on is interface-locked in `01-RESEARCH.md`/`01-03-PLAN.md`/`01-04-PLAN.md` (read directly this session). Phase 3 *execution* is blocked on Phase 1 landing, per the task framing — this is expected and already reflected in `ROADMAP.md`'s phase ordering |
| `lib/places/*` (Phase 2 client) | Every Places API call this phase's worker makes | **Built and verified** (confirmed via `ls lib/places` this session — all 5 files present; `ROADMAP.md` shows Phase 2 complete 2026-07-03) | — | None needed — this phase composes it as-is, no changes |
| `PLACES_API_KEY` (real, working key) | Live end-to-end verification against the real Places API | **Not available this session** (same blocked state noted in Phase 1/2 research) | — | Not needed to build this phase — every test uses fixtures/stubs, same pattern Phase 2 established |
| Node.js / pnpm / vitest | Running this phase's tests | Yes (confirmed via `package.json` this session — `next@16.2.10`, `vitest@4.1.9`) | — | — |
| `.env.test` / `TEST_DATABASE_URL` | Integration tests against a real Neon test database | **Not yet provisioned** (confirmed — no `.env.test` file exists in the repo root this session); `vitest.config.ts` already has a fallback that keeps unit tests unblocked | — | Integration tests in this phase's Wave 0 gaps are blocked on the same Phase 1 setup step (Plan 01-02) that Phase 1's own `01-05-PLAN.md` integration tests are blocked on — not a new blocker this phase introduces |

**Missing dependencies with no fallback:** none for *research/planning* purposes. Phase 1 landing
is a hard execution-time dependency, already reflected in `ROADMAP.md`'s phase ordering (Phase 3
depends on Phase 2, which itself is built on top of Phase 1's locked interfaces).

**Missing dependencies with fallback:** `PLACES_API_KEY`, `.env.test` — both have the same
fixture/stub-based fallback already established and proven working in Phase 2's test suite.
</environment_availability>

<project_constraints>
## Project Constraints (from CLAUDE.md)

Binding for this phase (from `.claude/CLAUDE.md` and its referenced `.claude/rules/common/*.md`,
`.claude/rules/typescript/*.md`):

- **pnpm only** — no new packages are being installed this phase.
- **No plaintext secrets anywhere** — this phase adds no new secret; `PLACES_API_KEY`/
  `DATABASE_URL` continue to flow only through `lib/env.ts`/`lib/db/client.ts`.
- **Validate at boundaries; never trust external data** (`coding-rules.md`, `security.md`) — the
  direct driver for `createJobSchema` (Code Example 1), this phase's one new untrusted-input
  boundary (`POST /api/jobs`'s request body).
- **No silent error swallowing** (`coding-rules.md`) — the direct driver for Pitfall 1/Code Example
  3's single `try/catch` that always resolves to a terminal `error` status with a reason, never a
  job silently stuck with no explanation.
- **Small, focused files; many small files > few large files** (`coding-style.md`) — `checkpoint.ts`,
  `buildTextQuery.ts`, and `runScrapeJob.ts` as separate modules, matching Phase 1/2's own
  file-per-concern precedent.
- **Immutability by default** (`coding-style.md`) — `runScrapeJob`'s loop reassigns local `cursor`/
  `leadsFound` variables (standard accumulator pattern) but never mutates the `job` object read from
  `getJob`, and every DAL call passes a freshly-constructed object.
- **No `console.log` in production code** (`typescript/coding-style.md`) — none used in any code
  example above; the error path writes to the DB (`error_reason`), not the console.
- **Additive migrations. Never edit/delete a shipped migration** (`coding-rules.md`) — the direct
  driver for Pattern 2/Code Example 5: a new migration file adds the three columns, Phase 1's
  `0000_*.sql` is never touched.
- **Never push directly to `main`.** Branch → PR → merge; CI gate `lint → typecheck → test → build`
  (already wired per Phase 1's bootstrap).
- **80%+ test coverage requirement** (`testing.md`) — this phase's DI-heavy design (Pattern 1) keeps
  the checkpointing logic itself fully unit-testable; the integration tier (Wave 0 gap) covers real
  DB/DAL wiring, matching this repo's own stated testing intent ("Integration: job creation + a
  mocked Places API — never hit the real API in tests").
</project_constraints>

<sources>
## Sources

### Primary (HIGH confidence)
- `nextjs.org/docs/app/api-reference/functions/after` (fetched directly this session, version
  16.2.10 per page metadata — matches this project's installed `next` version exactly) — import
  syntax (`from 'next/server'`), duration-sharing semantics ("will run for the platform's default or
  configured max duration"), "executed even if the response didn't complete successfully" behavior,
  platform support table
- `nextjs.org/docs/app/api-reference/file-conventions/route` (fetched directly this session, version
  16.2.10) — HTTP method exports, `Request.json()` body reading, `Response.json()`, segment config
  options (`runtime`, `maxDuration`), dynamic `params` are a Promise (confirmed not relevant to this
  phase's single static route)
- `vercel.com/docs/functions/configuring-functions/duration` (fetched directly this session) —
  Hobby/Pro/Enterprise duration table (Hobby: 300s default AND maximum, not configurable; Pro/
  Enterprise: 300s default, 800s max GA, 1800s extended beta), exact `export const maxDuration`
  syntax for Next.js App Router
- `developers.google.com/maps/documentation/places/web-service/text-search` (fetched directly this
  session, re-confirming Phase 2's own research) — documented `textQuery` category+location
  composition format ("pizza in New York", "shoe stores near Ottawa"), `locationBias`/
  `locationRestriction` semantics (neither required; `regionCode` is a formatting/ranking bias, not a
  geographic filter), confirming Pattern 3/Pitfall 3
- `orm.drizzle.team/docs/column-types/pg` (fetched directly this session) — `jsonb()` +
  `.$type<T>()` syntax, `.default()` usage, confirming Code Example 5
- `package.json`, `lib/env.ts`, `lib/places/*.ts`, `tests/unit/lib/places/paginate.test.ts`,
  `vitest.config.ts`, `.planning/config.json`, `.planning/STATE.md` (all read directly from the
  repo this session) — confirmed installed dependency versions, Phase 2's actual (not just
  researched) function signatures, existing test conventions, current phase/blocker state, and
  (via `paginate.ts` + `client.ts` + the existing test file, cross-read together) the
  `isTokenNotYetActiveError` message-vs-body gap documented in Pitfall 5

### Secondary (MEDIUM confidence)
- `.planning/research/{STACK,ARCHITECTURE,PITFALLS,SUMMARY}.md` and
  `.planning/phases/{01-data-foundation-security,02-places-api-scrape-client}/*-RESEARCH.md`
  (already HIGH/MEDIUM-confidence per their own sourcing) — supplied the checkpointed-worker
  pattern, the `after()` duration-ceiling finding, the atomic-claim continuation guard (confirmed
  out of this phase's scope, belongs to Phase 4/JOB-04), and the exact Phase 1/Phase 2 function
  signatures this phase's code composes

### Tertiary (LOW confidence — needs validation)
- Whether Google's Text Search (New) can ever return a `nextPageToken` after the documented 3rd
  page (Open Question 2, `MAX_PAGES` defensive cap) — no primary source directly confirms or denies
  this edge case; the defensive cap costs nothing to keep regardless
</sources>

<metadata>
## Metadata

**Confidence breakdown:**
- `after()` semantics / duration-sharing (JOB-01, JOB-03): HIGH — fetched directly from official
  Next.js docs this session, at the exact installed version (16.2.10)
- Vercel Hobby/Pro duration limits (JOB-03's 250s safety window vs. the 300s ceiling): HIGH — fetched
  directly from official Vercel docs this session, exact numbers quoted
- Checkpointed worker design / cursor shape (JOB-02, JOB-03): HIGH — directly derivable from Phase
  1/2's already-locked interfaces plus the official `after()`/duration docs; the "one unit = one
  page fetch" scoping decision (Assumption A1) is a judgment call grounded in SCRAPE-01's actual
  (single-category/single-location) requirement text, not an external fact
- `textQuery` category+location composition (Pattern 3, Pitfall 3): HIGH — fetched directly from
  official Google Places API docs this session, exact documented example format quoted
- Dedup (JOB-07): HIGH — directly verified by reading Phase 1's actual planned `insertLeadSnapshot`
  implementation (`01-04-PLAN.md`, `01-RESEARCH.md` Code Example 2) rather than re-deriving it
- Testing strategy (DI-based clock/search-unit injection): HIGH for the mechanics (directly extends
  Phase 2's own already-proven `fetchImpl`/`sleep` pattern, confirmed by reading Phase 2's actual
  code this session), MEDIUM for the specific test-tier split (unit vs. integration) judgment call

**Research date:** 2026-07-02
**Valid until:** 2026-08-01 (30 days — matches the same validity window Phase 1/2's research used;
re-verify `after()`/duration limits and the Places API query-format guidance if Phase 3 execution
starts more than a few weeks after this research, since both have changed before)
</metadata>

---

*Phase: 03-job-creation-checkpointed-worker*
*Research completed: 2026-07-02*
*Ready for planning: yes*
