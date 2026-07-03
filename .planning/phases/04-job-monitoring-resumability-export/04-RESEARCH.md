# Phase 4: Job Monitoring, Resumability & Export - Research

**Researched:** 2026-07-03
**Domain:** Next.js 16 dynamic Route Handlers (`GET /api/jobs/:id`, `GET /api/jobs/:id/export`) composing Phase 3's real, shipped `runScrapeJob`/`checkpoint.ts`/`jobs` DAL; atomic-claim concurrency control and stale-job watchdog over Postgres; CSV export with formula-injection sanitization
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase (`/gsd-discuss-phase` has not been run) — all decisions below
are at Claude's discretion within the locked project-level constraints already recorded in
`PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` Phase 4 success criteria, and `.claude/CLAUDE.md`
(see `## Project Constraints (from CLAUDE.md)` below).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| JOB-04 | `GET /api/jobs/:id` (polled ~1s) triggers continuation via `after()` when status is `partial`, guarded by an atomic claim (`UPDATE ... WHERE status='partial'`) to prevent duplicate continuations | Code Example 1 (`claimPartialJob`), Pattern 1, Pitfall 1 |
| JOB-05 | Stale `pending`/`running` jobs (no update past a watchdog threshold) auto-flip to `error` with a human-readable reason on read | Code Example 2 (`flagStaleJob`), Pattern 2, Pitfall 3 |
| JOB-06 | A zero-result job is a valid, non-error outcome, distinguished from a real failure in the UI | Summary point 3 — **already satisfied by Phase 3's shipped code**, this phase's job is the API response *contract*, not a worker change |
| EXPORT-01 | CSV export of a completed job's leads, joined to current `businesses` CRM state | Code Example 3, Pattern 3 |
| EXPORT-02 | CSV cells starting with `=+-@` are sanitized against formula injection | Code Example 4 (`sanitizeCsvCell`), Pitfall 4 |
</phase_requirements>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `GET /api/jobs/:id` polling response | API / Backend | Database / Storage | Route Handler reads/mutates the `jobs` row; no UI in this phase (Phase 5 consumes the contract) |
| Atomic claim (`partial` → `running` continuation trigger) | Database / Storage | API / Backend | The guarantee is a Postgres-level atomic `UPDATE ... WHERE ... RETURNING`; application code only branches on whether a row came back |
| Stale-job watchdog | Database / Storage | API / Backend | Same shape as the claim — a conditional `UPDATE ... WHERE updated_at < threshold RETURNING`; triggered by request traffic, not a scheduler |
| `after()` continuation scheduling | API / Backend | — (platform primitive) | Reuses Phase 3's exact `runScrapeJob(jobId)` entry point — no new worker code |
| CSV export | API / Backend | Database / Storage | Route Handler queries (join) + streams a `text/csv` response; the join/sanitization logic is backend-only, no client code |

**Single-tier note:** like Phases 1-3, this phase is backend-only — no UI. It composes Phase 3's
shipped `runScrapeJob`/`getJob`/`updateJobProgress` and Phase 1's shipped `businesses`/`leads`
schema, unchanged.
</architectural_responsibility_map>

<research_summary>
## Summary

This phase adds two Route Handlers on top of Phase 3's already-shipped, already-verified worker:
`GET /api/jobs/:id` (JOB-04/JOB-05/JOB-06) and `GET /api/jobs/:id/export` (EXPORT-01/EXPORT-02).
Both compose existing code without modifying `runScrapeJob.ts` itself.

**1. The atomic claim composes cleanly with the real, shipped `runScrapeJob(jobId, deps?)`.**
Read directly this session: Phase 3's worker already resumes from `job.cursor ?? initialCursor()`
and `job.leadsFound ?? 0` by re-reading the row via `getJob(jobId)` at the top of every
invocation. This means continuation is trivial — the claim function only needs to flip
`status: 'partial' → 'running'` atomically and return whether it won; the actual resumption is
just `after(() => runScrapeJob(id))`, identical to Phase 3's own `POST /api/jobs` call site, with
**no cursor threaded through by hand**. This is a direct, verified consequence of Phase 3's design
(not an assumption) — `runScrapeJob` was explicitly built to make Phase 4's continuation trivial
(see `03-RESEARCH.md` Code Example 3 comments, confirmed against the shipped file).

**2. The watchdog and the claim are mutually exclusive on the status enum, so ordering doesn't
matter functionally — but running the watchdog check first is simpler.** `jobStatusEnum` is
`['pending', 'running', 'partial', 'done', 'error']`. The watchdog only ever touches
`pending`/`running` rows; the claim only ever touches `partial` rows. A single `GET` request
checks watchdog-staleness first (cheap, always applicable), then checks for a claimable `partial`
status on whatever row state remains.

**3. JOB-06 requires zero changes to `runScrapeJob.ts`.** Read directly this session: the
worker's success path unconditionally writes `status: 'done'` when the loop's cursor reaches
`done: true` — regardless of whether `leadsFound` is `0` or `40`. A zero-result job is *already*
indistinguishable from a non-zero-result job at the worker level, which is correct — the
distinction JOB-06 asks for is an **API response shape** concern (this phase) and a **UI copy**
concern (Phase 5), not a worker-logic concern. This phase's actual deliverable for JOB-06 is
narrow: make sure `GET /api/jobs/:id`'s JSON response always includes both `status` and
`leadsFound` (not just `status`), so a consuming UI can render `{status: 'done', leadsFound: 0}`
as "job completed, no leads found in this area" rather than inferring failure from an empty leads
list. Do not add a new job status (e.g. `'done_empty'`) — that would be new, unrequested schema
surface for a distinction the existing two fields already make possible.

**4. CSV export is a straightforward join + `csv-stringify` + prefix-based sanitization** — the
project-level `STACK.md`/`PITFALLS.md` research (2026-07-02) already recommended `csv-stringify`
6.8.1 and specified the exact sanitization rule (prefix cells starting with `=+-@`). This phase's
job is to apply that recommendation concretely: `leads` INNER JOIN `businesses` on `place_id`
scoped to `job_id`, sanitize every untrusted string field (`business_name`, `phone`, `address`,
`website`, `notes` — anything that can contain arbitrary text, including Richard's own freeform
notes, which could coincidentally start with one of the four characters), then hand the row array
to `stringify()`.

**5. Testing avoids both real waiting and real concurrency flakiness by testing the SQL
guarantee directly.** For the atomic claim: call the claim function twice in immediate succession
(no `Promise.all` needed) and assert the first claims the row (returns a row) and the second does
not (returns `null`/`undefined`) — this proves the `WHERE status = 'partial'` guard works without
simulating a race. A stronger, still-deterministic variant fires both calls concurrently via
`Promise.all` against the real test DB and asserts exactly one of the two settled results claimed
the row — Postgres's own row-level `UPDATE` locking guarantees this outcome deterministically, no
flaky timing involved. For the watchdog: never `sleep` — directly SQL-write a fake `updated_at`
value into the test row (e.g., `now - WATCHDOG_MS - 1000`) via the existing Drizzle `db` handle
before invoking the watchdog function, mirroring Phase 2/3's own dependency-injection convention
but applied at the data layer (the seam here is the *stored* timestamp, not a `now` parameter,
since the watchdog compares DB `updated_at` against wall-clock `Date.now()`).

**Primary recommendation:** add `claimPartialJob`, `flagStaleJob` to `lib/db/jobs.ts`; add
`WATCHDOG_MS` to `lib/jobs/checkpoint.ts`; build `app/api/jobs/[id]/route.ts` (GET) composing
both plus `after(() => runScrapeJob(id))`; build `lib/csv/export.ts` (join + sanitize + stringify)
and `app/api/jobs/[id]/export/route.ts` (GET); install `csv-stringify` (flagged `[SUS]` by the
legitimacy scan on a false-positive "too-new" signal — see Package Legitimacy Audit, gate behind
`checkpoint:human-verify`).
</research_summary>

<standard_stack>
## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `csv-stringify` | 6.8.1 `[ASSUMED — package name from project-level STACK.md research + training data; registry existence confirmed but not sufficient for VERIFIED per provenance rule]` | CSV generation for `GET /api/jobs/:id/export` | Actively maintained (`csv` family, Adaltas), 7.9M weekly downloads (confirmed via `package-legitimacy check` this session), correct RFC 4180 quoting/escaping — already recommended in project-level `STACK.md` (2026-07-02) |
| `next` (`after`, dynamic Route Handlers) | 16.2.10 `[VERIFIED: npm registry — already installed in package.json]` | `GET /api/jobs/:id` (dynamic `[id]` segment — **new** to this phase; Phase 3's route had no dynamic segment) + continuation scheduling | Same locked design as Phase 3; dynamic-segment `params` being a `Promise` (Next 15+/16) is directly relevant here for the first time — see Pitfall 5 |
| `drizzle-orm` | 0.45.2 `[VERIFIED: npm registry — already installed]` | `claimPartialJob`/`flagStaleJob` conditional `UPDATE ... RETURNING`; `leads` INNER JOIN `businesses` for export | Same Phase 1 pairing; no new DB tooling needed — both new queries are expressible with Drizzle's existing `.update().set().where().returning()` and `.innerJoin()` |
| `server-only` | 0.0.1 `[VERIFIED: npm registry — already installed]` | Guards the two new route-adjacent modules (`lib/csv/export.ts`, DAL additions) | Same mechanism as Phases 1-3 |

### Supporting

None required beyond `csv-stringify`. `vitest` 4.1.9 (already installed) covers this phase's
entire test surface, same as Phase 3.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `csv-stringify` (recommended) | Hand-rolled `Array.join(',')` CSV writer | Breaks on any field containing a comma/quote/newline (business names/addresses routinely do) — exactly the kind of hand-rolled solution project-level `STACK.md` already rejected in favor of a maintained library |
| Prefix-based sanitization (`'` prefix) (recommended) | Wrapping every cell in `="..."` (Excel-specific forced-text syntax) | `="..."` is Excel-only and itself starts with `=`, which is confusing to reason about and not portable to Google Sheets/LibreOffice; a leading `'` (or safe character) is the standard OWASP-documented mitigation and works across spreadsheet tools |
| `Promise.all`-based concurrent claim test (recommended for the stronger proof) | Mocked/fake-DB unit test only | A mocked test proves the *code* branches correctly but not that Postgres's row-level locking actually serializes two real concurrent `UPDATE`s — worth having both tiers (see Validation Architecture) |

**Installation:**
```bash
pnpm add csv-stringify
```

**Version verification:** confirmed this session — `npm view csv-stringify version` → `6.8.1`,
published `2026-07-02T17:27:44Z` (same day as project-level `STACK.md` research; matches exactly).
</standard_stack>

<package_legitimacy_audit>
## Package Legitimacy Audit

Ran `gsd-tools query package-legitimacy check --ecosystem npm csv-stringify` this session.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `csv-stringify` | npm | Latest version published 2026-07-02 (package itself is the long-established `csv` family by Adaltas, first published years ago — only the *latest patch* is recent) | 7,913,179/week | `github.com/adaltas/node-csv` | **SUS** (reason: `too-new`) | Flagged — planner must add `checkpoint:human-verify` before `pnpm add csv-stringify` |

**Interpretation:** the `SUS`/`too-new` verdict is triggered by the *latest version's* publish
timestamp, not the package's actual age — 7.9M weekly downloads and an established GitHub
organization (`adaltas/node-csv`, the same maintainer referenced in project-level `STACK.md`'s
prior research) are strong signals against a slopsquat/hallucination, but per the package
legitimacy protocol a `SUS` verdict must still be kept (not silently upgraded to OK) and gated.
`postinstall` script: `null` (no suspicious install-time script).

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `csv-stringify` — planner must insert a
`checkpoint:human-verify` task before the `pnpm add csv-stringify` step, even though the
underlying signal (recent patch release + huge download count + known maintainer) reads as a
false positive on inspection.
</package_legitimacy_audit>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Client polls GET /api/jobs/:id every ~1s (Phase 5's future JobProgressPoller; no UI this phase)
        │
        ▼
app/api/jobs/[id]/route.ts — GET(request, { params })
        │
        ▼
  const { id } = await params            (dynamic segment — Promise in Next 16, Pitfall 5)
        │
        ▼
  getJob(id) ──▶ 404 if not found
        │
        ▼
  flagStaleJob(id, WATCHDOG_MS)   ◀── UPDATE jobs SET status='error', error_reason=...
        │                              WHERE id=$1 AND status IN ('pending','running')
        │                              AND updated_at < now() - WATCHDOG_MS RETURNING *
        │  (no-op unless truly stale — returns null; job unaffected)
        ▼
  current = staleFlagged ?? original job
        │
        ▼
  current.status === 'partial' ?
        │ yes                                          │ no
        ▼                                              ▼
  claimPartialJob(id)   ◀── UPDATE jobs                return current as-is
    SET status='running', updated_at=now()
    WHERE id=$1 AND status='partial' RETURNING *
        │
   claimed a row?
        │ yes                          │ no (another poll already claimed it)
        ▼                              ▼
  after(() => runScrapeJob(id))   return current (still shows 'partial' —
        │                          next poll will see 'running' from the
        ▼                          winning poll's own response)
  return claimed row as the response
        │
        ▼
  Response.json({ id, status, category, location, leadsFound, errorReason, createdAt, updatedAt })
  (cursor is NEVER included — internal implementation detail, Pitfall 6)


GET /api/jobs/:id/export
        │
        ▼
  getJob(id) ──▶ 404 if not found
        │
        ▼
  status !== 'done' ? ──▶ 409 { error: 'Job is not complete yet' }
        │ status === 'done'
        ▼
  leads INNER JOIN businesses ON leads.place_id = businesses.place_id
    WHERE leads.job_id = :id
        │
        ▼
  sanitizeCsvCell() on every untrusted string field (name/phone/address/website/notes)
        │
        ▼
  csv-stringify → Response(csv, { headers: { Content-Type: 'text/csv',
    Content-Disposition: 'attachment; filename="job-<id>-leads.csv"' } })
```

A reader tracing "Richard's browser polls a `partial` job": `GET /api/jobs/:id` first checks for
staleness (no-op for a `partial` job, since `partial` isn't in the watchdog's `pending`/`running`
set), then atomically claims the `partial` row — only the poll that wins the `UPDATE` schedules
`after(() => runScrapeJob(id))`; every other concurrent poll sees zero rows affected and simply
returns the job's current (still-`partial`, about-to-flip) state without double-scheduling work.

### Recommended Project Structure

```
lib/
├── db/
│   └── jobs.ts                # MODIFIED (Phase 1/3 file): + claimPartialJob, flagStaleJob
├── jobs/
│   └── checkpoint.ts           # MODIFIED (Phase 3 file): + WATCHDOG_MS
└── csv/
    ├── sanitize.ts              # sanitizeCsvCell()
    └── export.ts                 # buildJobLeadsCsv(jobId) — join + sanitize + stringify
app/
└── api/
    └── jobs/
        └── [id]/
            ├── route.ts           # GET — polling/claim/watchdog (JOB-04, JOB-05, JOB-06)
            └── export/
                └── route.ts        # GET — CSV export (EXPORT-01, EXPORT-02)
tests/
├── unit/
│   └── lib/
│       ├── jobs/
│       │   └── checkpoint.test.ts        # MODIFIED — + WATCHDOG_MS assertion
│       └── csv/
│           └── sanitize.test.ts           # pure function, exhaustive prefix cases
├── integration/
│   └── jobs/
│       ├── claimPartialJob.test.ts        # real test DB — race + idempotency proof
│       ├── flagStaleJob.test.ts           # real test DB — fake updated_at injection
│       └── export.test.ts                 # real test DB — join correctness + sanitization
└── unit/
    └── app/
        └── api/
            └── jobs/
                └── [id]/
                    ├── route.test.ts        # mocked DAL + after()
                    └── export/
                        └── route.test.ts     # mocked DAL, asserts 409 on non-done job
```

### Pattern 1: Atomic claim via conditional `UPDATE ... RETURNING` (JOB-04)

**What:** `claimPartialJob(jobId)` issues a single `UPDATE jobs SET status='running', updated_at=now() WHERE id=$1 AND status='partial' RETURNING *` and returns the row if (and only if) exactly
one row was affected, `null` otherwise.
**When to use:** the sole place `partial → running` transitions happen for continuation purposes.
**Trade-offs:** relies on Postgres's own row-level lock during the `UPDATE` — no application-level
mutex/advisory lock needed; this is the same guarantee project-level `ARCHITECTURE.md`'s Pattern 3
already specified, now composed against the real, shipped `runScrapeJob`.
**Example:** see Code Example 1.

### Pattern 2: Watchdog via conditional `UPDATE ... RETURNING` on `updated_at` age (JOB-05)

**What:** `flagStaleJob(jobId)` issues `UPDATE jobs SET status='error', error_reason='...' WHERE id=$1 AND status IN ('pending','running') AND updated_at < now() - WATCHDOG_MS RETURNING *`,
triggered on every `GET /api/jobs/:id` read — no cron, no separate scheduler.
**When to use:** before checking for a claimable `partial` status (order doesn't matter
functionally since the two conditions are on disjoint status sets, but doing this first keeps the
handler's control flow linear).
**Trade-offs:** a job only gets flagged the *next time someone happens to poll it* — acceptable
for a single-user tool where Richard is the only poller and is actively watching the job (same
trade-off project-level `ARCHITECTURE.md` already accepted for the continuation trigger itself).
**Example:** see Code Example 2.

### Pattern 3: `leads` INNER JOIN `businesses` for export, scoped to one job (EXPORT-01)

**What:** export reads are per-job (`leads.job_id = :id`) but pull *current* CRM state
(`notes`, `contacted`) from `businesses`, joined on `place_id` — never from `leads` itself, which
only has scrape-snapshot fields per Phase 1's identity/sighting split.
**When to use:** the only correct join for this feature — exporting `leads` alone would miss
`notes`/`contacted`; exporting `businesses` alone would not be scoped to a specific job's results.
**Trade-offs:** none — this is the intended purpose of the Phase 1 schema split, not a new
design decision.
**Example:** see Code Example 3.

### Anti-Patterns to Avoid
- **Adding a new `'done_empty'` job status for JOB-06:** unnecessary schema surface — `status:
  'done'` + `leadsFound: 0` already fully expresses the distinction (Summary point 3).
- **Threading a `cursor` argument through the claim/continuation call:** `runScrapeJob(jobId)`
  already re-reads `job.cursor` via `getJob` internally (Phase 3, verified) — passing a cursor
  explicitly would be redundant and risks it going stale between the claim and the `after()` call.
- **Building a second, separate "is this job stale" cron/scheduled function:** the watchdog must
  piggyback on existing polling traffic, per the locked no-queue/no-cron design.
- **Returning `cursor` (raw `pageToken`, an opaque Google-issued string) in the public JSON
  response:** it's an internal resumption detail, not something a consuming UI needs (Pitfall 6).
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Preventing double-continuation of a `partial` job (JOB-04) | An in-memory lock, a Redis mutex, or a separate "claims" table | A single conditional `UPDATE ... WHERE status='partial' RETURNING *` | Postgres's own row-level locking already serializes concurrent `UPDATE`s against the same row — no external coordination primitive needed, and an in-memory lock wouldn't even work across serverless invocations (no shared memory) |
| Stale-job detection (JOB-05) | A cron job, a Vercel Cron trigger, or a background sweep process | A conditional `UPDATE ... WHERE updated_at < now() - threshold` triggered by existing poll traffic | Already-locked no-queue/no-cron design (`PROJECT.md`); polling traffic already exists and is frequent enough (~1s) to make this practical |
| CSV generation/escaping (EXPORT-01) | Manual string-join CSV writer | `csv-stringify` | RFC 4180 quoting (embedded commas, quotes, newlines in business names/addresses) is exactly the kind of "looks simple, isn't" problem a hand-rolled writer gets subtly wrong |
| Formula-injection sanitization (EXPORT-02) | A regex-based "strip dangerous characters" approach | A prefix check + leading-safe-character insertion, applied per-cell before `stringify()` | Stripping characters would corrupt legitimate data (e.g. a business named "A+ Auto Repair"); prefixing preserves the original value while neutralizing spreadsheet formula interpretation, matching the OWASP-documented mitigation |

**Key insight:** every net-new piece of logic in this phase is a single, focused SQL statement or
a small pure function (`sanitizeCsvCell`) — the phase's actual complexity lives in *composing*
Phase 1/3's already-built pieces correctly, not in building new infrastructure.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Awaiting the claim's continuation instead of scheduling it via `after()`
**What goes wrong:** calling `await runScrapeJob(id)` directly inside the `GET` handler (instead
of `after(() => runScrapeJob(id))`) would make the poll itself take as long as the next chunk of
scraping — defeating the entire point of `after()`-based background execution and likely causing
the poll request itself to hit a duration ceiling.
**Why it happens:** `claimPartialJob` returning the claimed row makes it tempting to "just resume
right here" synchronously, since the row is already in hand.
**How to avoid:** exactly mirror Phase 3's `POST` handler pattern — `after(() => runScrapeJob(id))`,
never awaited, response returned independently.
**Warning signs:** `GET /api/jobs/:id` polls taking multiple seconds to respond instead of being
near-instant.

### Pitfall 2: Watchdog threshold too tight, false-flagging a legitimately slow single search call
**What goes wrong:** Text Search pagination retries (Phase 2's `fetchNextPage`, ~2-5s backoff per
page, up to 3 pages) plus normal network latency can make a single `after()` invocation take up
to tens of seconds even without hitting the 250s safety window. Setting `WATCHDOG_MS` too close to
`SAFETY_WINDOW_MS` risks flagging a job as `error` while it's still legitimately mid-invocation.
**Why it happens:** "stale" intuitively suggests "any delay," but the correct signal is
"significantly longer than even a worst-case single invocation should take."
**How to avoid:** set `WATCHDOG_MS` to a clear multiple of `SAFETY_WINDOW_MS` (recommend `2x` =
500,000ms / ~8.3 min, comfortably beyond even a full safety-window invocation plus retry
overhead) — see Code Example 2's constant.
**Warning signs:** a job flips to `error` with reason "timed out" while a real `after()`
invocation for it is still genuinely running.

### Pitfall 3: Watchdog and claim both trying to act on the same row in one request without checking status first
**What goes wrong:** if the watchdog `UPDATE` and the claim `UPDATE` are both issued
unconditionally (not gated by the job's actual current status), the second one might no-op
silently in a confusing way, or worse, race against the first's own effect within the same
request.
**Why it happens:** it's tempting to just "always run both statements" for simplicity.
**How to avoid:** the watchdog's `WHERE status IN ('pending','running')` and the claim's `WHERE
status = 'partial'` are already disjoint conditions on the same enum — read the watchdog's
result (or the original `getJob` result if the watchdog no-oped) to decide whether the claim
step even applies, rather than always attempting both blindly (Code Example flow above already
reflects this).
**Warning signs:** a job stuck oscillating between `error`/`running` on rapid successive polls.

### Pitfall 4: Sanitizing only the business-name field, missing address/phone/website/notes
**What goes wrong:** formula injection isn't limited to business names — Google Places addresses
can (rarely) start with unusual characters, and Richard's own freeform CRM `notes` field is
user-typed text that could coincidentally start with `=`/`+`/`-`/`@` (e.g., a note like "-10%
off next visit" or "@mention their Instagram"). Sanitizing only one column leaves the others
exploitable.
**Why it happens:** business name is the most obviously "untrusted external data" field, making
it easy to treat as the only risk while other string columns get overlooked.
**How to avoid:** apply `sanitizeCsvCell` to every string-typed CSV column — `business_name`,
`phone`, `address`, `website`, `notes` — not a hand-picked subset (Code Example 4).
**Warning signs:** a CSV export that only prefixes one column when spot-checked against a row
containing a "dangerous" value in a different field.

### Pitfall 5: Forgetting Next.js 15+/16's dynamic route `params` is a `Promise`
**What goes wrong:** `03-RESEARCH.md` explicitly noted this was "not relevant" to Phase 3 because
its only route had no dynamic segment — but this phase's `[id]` segment makes it directly
relevant for the first time in this codebase. Destructuring `params.id` synchronously (without
`await`) either throws a type error at compile time (correctly typed) or, if mistyped as a plain
object, silently fails at runtime.
**Why it happens:** many older Next.js examples/tutorials online still show synchronous `params`
access, since this became a Promise as part of Next 15's async-request-APIs change.
**How to avoid:** type the handler signature as `{ params }: { params: Promise<{ id: string }> }`
and `const { id } = await params` before use (Code Example 1).
**Warning signs:** a TypeScript error on `params.id` (`Property 'id' does not exist on type
Promise<...>`), or (if `any`-typed) an `undefined` id at runtime.

### Pitfall 6: Leaking `cursor` (raw Google `pageToken`) into the public JSON response
**What goes wrong:** the `jobs` row's `cursor` column is an internal resumption detail
(`{ pageToken, pagesFetched, done }`) — including it verbatim in `GET /api/jobs/:id`'s response
exposes an opaque Google-issued pagination token to any client, for no functional benefit, and
couples a future UI to an internal implementation shape that may change.
**Why it happens:** `SELECT *`-style row shapes make it easy to just forward the whole DB row as
the API response.
**How to avoid:** explicitly shape the response object (`{ id, status, category, location,
leadsFound, errorReason, createdAt, updatedAt }`), never spread the raw row.
**Warning signs:** the JSON response containing a `cursor`/`pageToken` field.
</common_pitfalls>

<code_examples>
## Code Examples

### 1. `lib/db/jobs.ts` — `claimPartialJob` (JOB-04)
```typescript
// ADDS to the existing lib/db/jobs.ts (Phase 1/3, shipped — createJob, getJob,
// updateJobProgress already exist and are unchanged by this addition).
import { and, eq, lt, inArray } from 'drizzle-orm'
// ...existing imports (db, jobs, jobStatusEnum, JobCursor)...

/**
 * Atomically claims a `partial` job for continuation. Returns the claimed row
 * if this call won the race (exactly one row affected), or `undefined` if
 * another concurrent call already claimed it (or the job wasn't `partial`).
 */
export async function claimPartialJob(jobId: string) {
  const [row] = await db
    .update(jobs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, 'partial')))
    .returning()
  return row
}
```

### 2. `lib/db/jobs.ts` — `flagStaleJob` (JOB-05)
```typescript
import { WATCHDOG_MS } from '@/lib/jobs/checkpoint'

/**
 * Atomically flips a stale pending/running job to 'error'. Returns the
 * updated row if this call flagged it, or `undefined` if the job wasn't
 * stale (or wasn't pending/running).
 */
export async function flagStaleJob(jobId: string, now: () => number = Date.now) {
  const staleBefore = new Date(now() - WATCHDOG_MS)
  const [row] = await db
    .update(jobs)
    .set({
      status: 'error',
      errorReason: 'Job timed out — no progress for over 8 minutes',
      updatedAt: new Date(now()),
    })
    .where(
      and(
        eq(jobs.id, jobId),
        inArray(jobs.status, ['pending', 'running']),
        lt(jobs.updatedAt, staleBefore),
      ),
    )
    .returning()
  return row
}
```

### 3. `lib/jobs/checkpoint.ts` — `WATCHDOG_MS` (JOB-05)
```typescript
// ADDS to the existing lib/jobs/checkpoint.ts (Phase 3, shipped — JobCursor,
// initialCursor, SAFETY_WINDOW_MS, MAX_PAGES unchanged).

// 2x SAFETY_WINDOW_MS: comfortably beyond even a full safety-window
// invocation plus pagination retry overhead, so a legitimately slow (but
// still in-progress) job is never false-flagged as stale.
export const WATCHDOG_MS = SAFETY_WINDOW_MS * 2 // 500_000ms (~8.3 min)
```

### 4. `app/api/jobs/[id]/route.ts` — GET handler (JOB-04, JOB-05, JOB-06)
```typescript
import { after } from 'next/server'
import { getJob, claimPartialJob, flagStaleJob } from '@/lib/db/jobs'
import { runScrapeJob } from '@/lib/jobs/runScrapeJob'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const job = await getJob(id)
  if (!job) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }

  // JOB-05: no-op unless truly stale (pending/running past WATCHDOG_MS).
  const staleFlagged = await flagStaleJob(id)
  let current = staleFlagged ?? job

  // JOB-04: only a 'partial' job (not touched by the watchdog above, which
  // only targets pending/running) is eligible for claim+continuation.
  if (current.status === 'partial') {
    const claimed = await claimPartialJob(id)
    if (claimed) {
      after(() => runScrapeJob(id))
      current = claimed
    }
    // If claimed is undefined, another poll already won the race — return
    // `current` (still 'partial' from this read) as-is; the winning poll's
    // own response already reflects 'running'.
  }

  // JOB-06: status + leadsFound together let a consumer distinguish a
  // genuine zero-result completion ({status:'done', leadsFound:0}) from a
  // real failure ({status:'error', errorReason:'...'}) — no new status
  // value, no worker change required (see Summary point 3).
  return Response.json({
    id: current.id,
    status: current.status,
    category: current.category,
    location: current.location,
    leadsFound: current.leadsFound,
    errorReason: current.errorReason,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    // cursor deliberately omitted — internal resumption detail (Pitfall 6).
  })
}
```

### 5. `lib/csv/sanitize.ts` — formula-injection prefix (EXPORT-02)
```typescript
// Source: OWASP CSV Injection cheat sheet pattern (prefix any cell starting
// with =, +, -, @ with a leading safe character) — already flagged as a
// concrete requirement in project-level STACK.md/PITFALLS.md (2026-07-02).
const DANGEROUS_PREFIXES = ['=', '+', '-', '@']

export function sanitizeCsvCell(value: string): string {
  return DANGEROUS_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value
}
```

### 6. `lib/csv/export.ts` — join + sanitize + stringify (EXPORT-01, EXPORT-02)
```typescript
import 'server-only'
import { stringify } from 'csv-stringify/sync'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, businesses } from '@/lib/db/schema'
import { sanitizeCsvCell } from './sanitize'

const CSV_COLUMNS = [
  'business_name',
  'phone',
  'address',
  'website',
  'rating',
  'review_count',
  'notes',
  'contacted',
] as const

export async function buildJobLeadsCsv(jobId: string): Promise<string> {
  const rows = await db
    .select({
      businessName: leads.businessName,
      phone: leads.phone,
      address: leads.address,
      website: leads.website,
      rating: leads.rating,
      reviewCount: leads.reviewCount,
      notes: businesses.notes,
      contacted: businesses.contacted,
    })
    .from(leads)
    .innerJoin(businesses, eq(leads.placeId, businesses.placeId))
    .where(eq(leads.jobId, jobId))

  const records = rows.map((row) => [
    sanitizeCsvCell(row.businessName),
    row.phone ? sanitizeCsvCell(row.phone) : '',
    row.address ? sanitizeCsvCell(row.address) : '',
    row.website ? sanitizeCsvCell(row.website) : 'no website found on Google',
    row.rating ?? '',
    row.reviewCount ?? '',
    row.notes ? sanitizeCsvCell(row.notes) : '',
    row.contacted ? 'yes' : 'no',
  ])

  return stringify(records, { header: true, columns: CSV_COLUMNS })
}
```

### 7. `app/api/jobs/[id]/export/route.ts` — GET handler (EXPORT-01)
```typescript
import { getJob } from '@/lib/db/jobs'
import { buildJobLeadsCsv } from '@/lib/csv/export'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const job = await getJob(id)
  if (!job) {
    return Response.json({ error: 'Job not found' }, { status: 404 })
  }
  if (job.status !== 'done') {
    return Response.json(
      { error: 'Job is not complete yet', status: job.status },
      { status: 409 },
    )
  }

  const csv = await buildJobLeadsCsv(id)
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="job-${id}-leads.csv"`,
    },
  })
}
```

### 8. Testing the atomic claim without simulating a real race (JOB-04)
```typescript
// tests/integration/jobs/claimPartialJob.test.ts
it('only one of two concurrent claims on the same partial job succeeds', async () => {
  const job = await createJob({ category: 'restaurant', location: 'Toronto, ON' })
  await updateJobProgress(job.id, { status: 'partial', leadsFound: 5, cursor: someCursor })

  const [first, second] = await Promise.all([
    claimPartialJob(job.id),
    claimPartialJob(job.id),
  ])

  const claimedCount = [first, second].filter(Boolean).length
  expect(claimedCount).toBe(1) // exactly one call won the row-level race
})
```

### 9. Testing watchdog staleness via a fake `updated_at`, not a real wait (JOB-05)
```typescript
// tests/integration/jobs/flagStaleJob.test.ts
it('flags a running job as error once updated_at is older than WATCHDOG_MS', async () => {
  const job = await createJob({ category: 'restaurant', location: 'Lima' })
  await updateJobProgress(job.id, { status: 'running', leadsFound: 0, cursor: initialCursor() })

  // Directly SQL-inject a fake stale updated_at — no real waiting.
  await db
    .update(jobs)
    .set({ updatedAt: new Date(Date.now() - WATCHDOG_MS - 1_000) })
    .where(eq(jobs.id, job.id))

  const flagged = await flagStaleJob(job.id)
  expect(flagged?.status).toBe('error')
  expect(flagged?.errorReason).toMatch(/timed out/i)
})

it('does not flag a running job whose updated_at is recent', async () => {
  const job = await createJob({ category: 'restaurant', location: 'Lima' })
  await updateJobProgress(job.id, { status: 'running', leadsFound: 0, cursor: initialCursor() })

  const flagged = await flagStaleJob(job.id)
  expect(flagged).toBeUndefined()
})
```
</code_examples>

<validation_architecture>
## Validation Architecture

`workflow.nyquist_validation` is enabled (`.planning/config.json`) and not overridden.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` 4.1.9 (already installed and configured — same `vitest.config.ts` as Phases 1-3) |
| Config file | `vitest.config.ts` (unchanged by this phase) |
| Quick run command | `pnpm vitest run <file>` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| JOB-04 | `claimPartialJob` claims a `partial` row exactly once; a second call (real or concurrent) on the same job returns no row | integration (real test DB) | `pnpm vitest run tests/integration/jobs/claimPartialJob.test.ts` | ❌ Wave 0 |
| JOB-04 | `GET /api/jobs/:id` on a `partial` job schedules `after(() => runScrapeJob(id))` exactly once (mocked `after`/DAL) | unit | `pnpm vitest run tests/unit/app/api/jobs/[id]/route.test.ts -t "claims and schedules continuation"` | ❌ Wave 0 |
| JOB-05 | `flagStaleJob` flips a `pending`/`running` job with an injected stale `updated_at` to `error` with a human-readable reason; leaves a recently-updated job untouched | integration (real test DB, fake `updated_at` via direct SQL write, no real wait) | `pnpm vitest run tests/integration/jobs/flagStaleJob.test.ts` | ❌ Wave 0 |
| JOB-06 | `GET /api/jobs/:id` response for a `done` job with `leadsFound: 0` includes both fields distinctly from an `error` response's `errorReason` | unit (mocked DAL) | `pnpm vitest run tests/unit/app/api/jobs/[id]/route.test.ts -t "zero-result done job"` | ❌ Wave 0 |
| EXPORT-01 | `buildJobLeadsCsv` joins `leads`→`businesses` on `place_id` scoped to `job_id`, includes `notes`/`contacted` from `businesses`, not `leads` | integration (real test DB) | `pnpm vitest run tests/integration/jobs/export.test.ts` | ❌ Wave 0 |
| EXPORT-01 | `GET /api/jobs/:id/export` returns 409 for a non-`done` job, 200 + CSV body for a `done` job | unit (mocked DAL) | `pnpm vitest run tests/unit/app/api/jobs/[id]/export/route.test.ts` | ❌ Wave 0 |
| EXPORT-02 | `sanitizeCsvCell` prefixes values starting with `=`, `+`, `-`, `@` and leaves others untouched (exhaustive prefix cases + a non-prefixed control case) | unit | `pnpm vitest run tests/unit/lib/csv/sanitize.test.ts` | ❌ Wave 0 |
| EXPORT-02 | An exported CSV row built from a fixture business named `=SUM(A1:A9)` is sanitized in the actual CSV output, not just at the function-unit level | integration (real test DB) | `pnpm vitest run tests/integration/jobs/export.test.ts -t "formula injection"` | ❌ Wave 0 |

**No test in this phase waits out a real multi-minute watchdog threshold or simulates a race via
`setTimeout`-based staggering** — staleness is proven via direct SQL timestamp injection
(Code Example 9) and the claim race is proven via `Promise.all` against real Postgres row
locking (Code Example 8), both deterministic.

### Sampling Rate
- **Per task commit:** the relevant `pnpm vitest run <file>` from the table above.
- **Per wave merge:** `pnpm vitest run` (full suite, including Phases 1-3's existing 61 tests).
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/integration/jobs/claimPartialJob.test.ts` — none exists yet
- [ ] `tests/integration/jobs/flagStaleJob.test.ts` — none exists yet
- [ ] `tests/integration/jobs/export.test.ts` — none exists yet
- [ ] `tests/unit/lib/csv/sanitize.test.ts` — none exists yet
- [ ] `tests/unit/app/api/jobs/[id]/route.test.ts` — none exists yet
- [ ] `tests/unit/app/api/jobs/[id]/export/route.test.ts` — none exists yet
- [ ] `lib/db/jobs.ts`'s `claimPartialJob`/`flagStaleJob` and `lib/jobs/checkpoint.ts`'s
      `WATCHDOG_MS` — need to exist before any of the above can pass; sequence early in the plan
</validation_architecture>

<security_domain>
## Security Domain

`security_enforcement` is on (ASVS Level 1, block on `high`) per `.planning/config.json`. Same
structural non-applicability as Phases 1-3 for auth/session categories (no login in this app).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No login exists or is planned for v1 |
| V3 Session Management | No | No sessions |
| V4 Access Control | Partial (carried from Phase 1/3) | `jobs.id` is `uuid`, mitigating trivial enumeration over this phase's two new unauthenticated read/export endpoints |
| V5 Input Validation | Yes | Dynamic route `id` param flows straight into `eq(jobs.id, id)` — Drizzle's parameterized query API prevents injection; no free-text body on either new `GET` route (unlike `POST /api/jobs`) |
| V6 Cryptography | N/A | No cryptographic operations in this phase |
| V12 File and Resources (Data Export) | Yes | CSV export must not leak internal fields (`cursor`) and must sanitize untrusted content before it reaches a spreadsheet application (Pitfall 4/6) |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| CSV formula injection via untrusted Places-sourced fields or Richard's own notes | Tampering (client-side, in the spreadsheet app that opens the export) | `sanitizeCsvCell` applied to every string column before `stringify()` (Code Examples 5-6) |
| Two concurrent polls double-scheduling `runScrapeJob`, burning Places API quota (Enterprise-tier billed per project-level `PITFALLS.md`) | Denial of Service (cost amplification) | Atomic claim (`UPDATE ... WHERE status='partial'`) ensures only one poll ever schedules a continuation (Pattern 1) |
| A crashed/orphaned invocation leaving a job silently `pending`/`running` forever, with no visibility | Denial of Service (to the user's own visibility) | Watchdog flips it to `error` with a human-readable reason on the next read (Pattern 2) |
| Internal pagination token (`cursor.pageToken`, opaque Google-issued string) leaking into the public JSON response | Information Disclosure (low severity — not itself a secret, but unnecessary exposure of an implementation detail) | Response is explicitly shaped, never a raw DB row spread (Pitfall 6, Code Example 4) |
</security_domain>

<open_questions>
## Open Questions

1. **Should `GET /api/jobs/:id/export` allow exporting a `partial` job's leads-so-far, or strictly
   require `status === 'done'`?**
   - What we know: EXPORT-01's requirement text says "a completed job's leads" and ROADMAP Phase 4
     success criterion 4 says "a completed job's leads can be exported" — both read as `done`-only.
   - What's unclear: whether Richard would want to export partial progress from a job he's about
     to abandon/re-run, before it naturally completes.
   - Recommendation: require `status === 'done'` (409 otherwise) per the literal requirement text
     — this is the narrower, requirement-faithful interpretation; loosening it to allow `partial`
     exports is a cheap follow-up if requested later, not a blocker now.

2. **Should the watchdog's `error_reason` message be more specific (e.g., include the actual
   elapsed time), or is a fixed string sufficient?**
   - What we know: JOB-05 requires "a human-readable reason," not a specific format.
   - What's unclear: whether Phase 5's UI will want to render elapsed time dynamically.
   - Recommendation: fixed string ("Job timed out — no progress for over 8 minutes") is sufficient
     for this phase — Phase 5 can compute/display elapsed time itself from `updatedAt`/`createdAt`
     if desired, without needing it baked into the stored string.

3. **Does the claim's `after(() => runScrapeJob(id))` need any different error handling than
   Phase 3's original `POST` call site?**
   - What we know: `runScrapeJob`'s own internal `try/catch` (Phase 3, unchanged) already resolves
     every code path to a terminal or checkpoint status — this is identical whether invoked from
     `POST /api/jobs` or from this phase's claim continuation.
   - What's unclear: nothing — this was directly verified by reading the shipped `runScrapeJob.ts`
     this session; no phase-4-specific error handling is needed at the call site.
   - Recommendation: no action needed; `after(() => runScrapeJob(id))` is the exact same call as
     Phase 3's, reused verbatim.
</open_questions>

<assumptions_log>
## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `WATCHDOG_MS = SAFETY_WINDOW_MS * 2` (~8.3 min) is a reasonable threshold, not backed by a specific measured worst-case invocation duration | Code Example 3, Pitfall 2 | Low-medium — if real invocations routinely take longer than half the watchdog window (unlikely given Phase 2's own retry-ceiling analysis puts a full 3-page fetch at 5-15s), legitimate jobs could be false-flagged; easily tunable as a single exported constant if observed in practice |
| A2 | CSV export requires strict `status === 'done'` rather than also allowing `partial` | Open Question 1 | Low — narrower interpretation of the literal requirement text; loosening later is additive, not a breaking change |
| A3 | `csv-stringify`'s `SUS`/`too-new` legitimacy verdict is a false positive driven by a recent patch-version publish timestamp, not a supply-chain risk | Package Legitimacy Audit | Low — corroborated by 7.9M weekly downloads and a long-established GitHub org matching prior project-level research (`STACK.md`, researched a day earlier and citing the same package); still gated behind `checkpoint:human-verify` per protocol regardless of this assessment |
| A4 | The 'not a website' fallback string `'no website found on Google'` (tier-1 UI copy per project-level `PITFALLS.md`) is appropriate to also bake into the CSV export, not just future UI | Code Example 6 | Low — matches project-level PITFALLS.md's explicit instruction that this framing must appear anywhere tier-1 status is surfaced, including exports, not only the eventual UI |

**If this table is empty:** N/A — see rows above.
</assumptions_log>

<environment_availability>
## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `lib/db/jobs.ts`, `lib/jobs/checkpoint.ts`, `lib/jobs/runScrapeJob.ts` (Phase 3, shipped) | Every function this phase composes | **Built, verified, shipped** (confirmed via direct file reads this session — `runScrapeJob.ts`, `checkpoint.ts`, `jobs.ts` all exist with the exact signatures this research depends on) | — | None needed — this phase extends these files, doesn't wait on them |
| `csv-stringify` | CSV export (EXPORT-01) | **Not yet installed** (confirmed — absent from `package.json` this session) | 6.8.1 (confirmed via `npm view` this session) | None — must be installed this phase; gated behind `checkpoint:human-verify` per the `[SUS]` legitimacy verdict |
| `TEST_DATABASE_URL` / real Neon test database | All integration tests in this phase's Wave 0 gaps | **Available** (confirmed — Phase 3's own integration tests already run against it successfully, per `03-03-SUMMARY.md`) | — | — |
| `PLACES_API_KEY` (real, working key) | Not needed this phase — no new Places API calls are introduced | N/A | — | — |
| Node.js / pnpm / vitest | Running this phase's tests | Yes (confirmed via `package.json` this session) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — `csv-stringify` must be installed, but this is a
normal `pnpm add`, not a blocked/unavailable dependency.
</environment_availability>

<project_constraints>
## Project Constraints (from CLAUDE.md)

Binding for this phase (from `.claude/CLAUDE.md` and its referenced `.claude/rules/common/*.md`,
`.claude/rules/typescript/*.md`):

- **pnpm only** — `pnpm add csv-stringify`, gated behind `checkpoint:human-verify` per the `[SUS]`
  legitimacy verdict above.
- **No plaintext secrets anywhere** — this phase adds no new secret or env var.
- **Validate at boundaries; never trust external data** (`coding-rules.md`, `security.md`) — the
  direct driver for sanitizing every untrusted string column before CSV export, not just the
  business-name field (Pitfall 4).
- **No silent error swallowing** (`coding-rules.md`) — the watchdog (JOB-05) exists specifically
  so a crashed/orphaned job never sits silently `pending`/`running` forever with no visibility.
- **Small, focused files; many small files > few large files** (`coding-style.md`) —
  `lib/csv/sanitize.ts` and `lib/csv/export.ts` as separate modules; DAL additions
  (`claimPartialJob`, `flagStaleJob`) added to the existing `lib/db/jobs.ts` file (extending, not
  duplicating, Phase 1/3's DAL-per-entity convention).
- **Immutability by default** (`coding-style.md`) — `sanitizeCsvCell` and `buildJobLeadsCsv` are
  pure/read-only functions; no in-place mutation anywhere in this phase's code.
- **No `console.log` in production code** (`typescript/coding-style.md`) — none used in any code
  example above.
- **Never push directly to `main`.** Branch → PR → merge; CI gate `lint → typecheck → test →
  build` (already wired per Phase 1's bootstrap).
- **80%+ test coverage requirement** (`testing.md`) — every new function in this phase
  (`claimPartialJob`, `flagStaleJob`, `sanitizeCsvCell`, `buildJobLeadsCsv`, both `GET` handlers)
  has a corresponding unit or integration test in the Validation Architecture table above.
</project_constraints>

<sources>
## Sources

### Primary (HIGH confidence)
- `lib/jobs/runScrapeJob.ts`, `lib/jobs/checkpoint.ts`, `lib/db/jobs.ts`, `lib/db/schema.ts`,
  `lib/db/leads.ts`, `lib/db/businesses.ts`, `app/api/jobs/route.ts`,
  `tests/integration/jobs/runScrapeJob.test.ts`, `vitest.config.ts`, `package.json` (all read
  directly from the repo this session) — confirmed the real, shipped Phase 1/3 function
  signatures, schema shape, and existing test/DI conventions this phase composes against
  (not the researched-but-not-yet-executed versions Phase 3's own research had to rely on)
- `npm view csv-stringify version` / `npm view csv-stringify time.modified` (queried directly
  this session) — confirmed 6.8.1, published 2026-07-02, matching project-level `STACK.md`'s
  prior recommendation exactly
- `gsd-tools query package-legitimacy check --ecosystem npm csv-stringify` (run directly this
  session) — confirmed 7,913,179 weekly downloads, `github.com/adaltas/node-csv` source repo,
  no postinstall script, `SUS`/`too-new` verdict on the latest patch's publish timestamp
- `.planning/config.json` (read this session) — confirmed all external search providers
  (`brave_search`, `exa_search`, `firecrawl`, `tavily_search`, `ref_search`, `perplexity`,
  `jina`) are disabled for this project; no MCP-provider fetches were available or attempted
  this session beyond the `npm`/`gsd-tools` calls above

### Secondary (MEDIUM confidence)
- `.planning/research/{STACK,ARCHITECTURE,PITFALLS,SUMMARY}.md` (project-level research,
  2026-07-02, already HIGH/MEDIUM-confidence per their own sourcing against official
  Next.js/Vercel/Google docs) — supplied the original atomic-claim SQL pattern, the stale-job
  watchdog concept, the `csv-stringify` recommendation, and the exact formula-injection
  sanitization rule (`=+-@` prefix), all directly reused and made concrete against the real
  shipped code in this session
- `.planning/phases/03-job-creation-checkpointed-worker/03-RESEARCH.md` and its three `SUMMARY.md`
  files (already HIGH-confidence, fetched official Next.js `after()`/Route Handler docs at the
  exact installed `next@16.2.10` version) — confirmed dynamic-segment `params`-as-`Promise`
  behavior (noted there as "not relevant to Phase 3," directly relevant here) and the
  `runScrapeJob(jobId, deps?)` resumption contract this phase's claim composes against

### Tertiary (LOW confidence — needs validation)
- None — no unverified/training-data-only claims were load-bearing for this phase's core design;
  the one `[ASSUMED]`-tagged item (`csv-stringify` as the correct package name) is corroborated
  by the same package already being independently researched and recommended in project-level
  `STACK.md` a day prior, plus this session's own registry/legitimacy checks
</sources>

<metadata>
## Metadata

**Confidence breakdown:**
- Atomic claim design (JOB-04): HIGH — directly composes the real, shipped `runScrapeJob`
  signature (read this session), and the SQL pattern itself was already HIGH-confidence in
  project-level `ARCHITECTURE.md`
- Watchdog design (JOB-05): HIGH for the mechanism (conditional `UPDATE ... RETURNING`, same
  pattern as the claim); MEDIUM for the specific `WATCHDOG_MS` threshold value (a reasoned
  judgment call — 2x the safety window — not sourced from an external authority)
- Zero-result handling (JOB-06): HIGH — directly verified by reading the shipped
  `runScrapeJob.ts`'s success path this session; no worker change needed, only response-shape
- CSV export + sanitization (EXPORT-01/EXPORT-02): HIGH for the library choice and sanitization
  rule (both already HIGH-confidence in project-level `STACK.md`/`PITFALLS.md`, re-confirmed via
  `npm view` this session); MEDIUM for the exact CSV column set (a reasonable judgment call given
  the schema, not an explicit requirement enumeration)
- Testing strategy (race/staleness without real waiting): HIGH — directly extends Phase 2/3's own
  proven dependency-injection convention, applied at the data layer for the watchdog case

**Research date:** 2026-07-03
**Valid until:** 2026-08-02 (30 days) — re-verify `csv-stringify`'s current version/legitimacy
verdict and Next.js dynamic-`params` semantics if Phase 4 execution starts more than a few weeks
after this research.
</metadata>

---

*Phase: 04-job-monitoring-resumability-export*
*Research completed: 2026-07-03*
*Ready for planning: yes*
