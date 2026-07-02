# Architecture Research

**Domain:** Scrape-job-plus-CRM system (Next.js App Router + Neon Postgres + Google Places API)
**Researched:** 2026-07-02
**Confidence:** MEDIUM-HIGH — platform limits (Vercel/Next.js duration behavior) are sourced from
official docs and are HIGH confidence; the Places API pagination/field-mask mechanics are
HIGH confidence (official Google docs + issue tracker); the CRM/dedup schema recommendation and
route-handler-vs-server-action split are architectural judgment calls (MEDIUM) — reasonable and
well-precedented, but not the only valid design.

## Validation of the Locked Design

**Verdict on "DB-row job as source of truth + `after()` + client polling": SOUND for MVP, but
only if the scrape worker is built as a resumable/checkpointed loop from day one — not a single
unbroken `await` chain.** The pattern itself (no external queue) is the right call for a
two-market, single-user MVP. The risk is not the pattern, it's `after()`'s duration ceiling
colliding with realistic Places API fetch times once `leads_target` is more than ~20-60 leads.
Details below.

### Why `after()` can silently fail here

1. **`after()` does not get its own time budget.** Per Next.js's own docs: *"`after` will run
   for the platform's default or configured max duration of your route."* It shares the
   triggering request's `maxDuration` — there is no separate, longer allowance for
   post-response work. (Source: Next.js official docs, `after()` reference — HIGH confidence.)

2. **Vercel's duration ceiling depends on plan tier, and Hobby has no override:**

   | Plan | Default | Maximum | Extended max |
   |------|---------|---------|--------------|
   | Hobby | 300s (5 min) | 300s (5 min) — **not configurable** | — |
   | Pro | 300s | 800s (GA, needs per-route `maxDuration`) | 1800s (beta, Node 20/22/24 only) |
   | Enterprise | 300s | 800s | 1800s (beta) |

   (Source: Vercel official docs, "Configuring Maximum Duration" — HIGH confidence.) If this
   project deploys on Hobby (likely, for a solo personal tool), **300 seconds is a hard, silent
   wall** — `POST /api/jobs`'s response *and* everything scheduled via `after()` inside it must
   finish within that window, full stop.

3. **On timeout, the job row is not updated — it's just abandoned.** Vercel kills the
   invocation (`FUNCTION_INVOCATION_TIMEOUT`) without running your code's error handling. If
   `runScrapeJob` was mid-loop, the job row stays `status: pending`/`running` forever with no
   error, no partial-result flag — an orphaned row the UI has no way to explain. This directly
   contradicts the project's own stated error-handling intent ("Places API failures → job
   `status: error`, not a silent empty result") — a timeout is exactly the silent-failure case
   that intent doesn't yet cover.

4. **Places API mechanics make the 300s ceiling reachable faster than it looks:**
   - **Nearby Search (New)** caps at **20 results per call, with no reliable multi-page
     pagination** — to get more than ~20 leads for one category+area you fan out into multiple
     calls (grid-cell subdivision or keyword variants), not multiple pages of one call.
   - **Text Search (New)** does support `pageToken` pagination (up to 3 pages / ~60 results),
     but each next page requires waiting for token activation — **an enforced ~2-5s delay
     between pages that is not configurable away**. A full 60-result Text Search pull is
     realistically 5-15 seconds of wall-clock time by itself, before any DB writes.
   - Good news that reduces the risk somewhat: **`websiteUri` (the tier-1 filtering field) can
     be requested directly in the Nearby/Text Search field mask** — you do *not* need a separate
     Place Details call per result to check for a missing website. This removes what would
     otherwise be the single biggest duration multiplier (N extra HTTP round-trips per lead).
   - The remaining cost driver is **how many separate search calls it takes to reach
     `leads_target`**. A `leads_target` of 100+ in a city almost certainly requires multiple
     grid cells or keyword variants, each its own network round-trip (+ any deliberate
     rate-limit spacing to avoid 429s). Serially awaiting all of that inside one `after()` call
     is exactly the shape of workload Vercel's own guidance warns about ("`after()` is suitable
     for lightweight tasks... it cannot fully replace job queues; for long-running processing,
     dedicated queues or workers are still recommended").

**Net assessment:** for a conservative `leads_target` (roughly ≤ 60, single category, single
Text Search pagination run) `after()` will comfortably finish inside 300s. For anything larger,
or for jobs that fan out across multiple categories/keywords in one request, treat 300s as a
real ceiling you can hit, not a theoretical one.

### Recommended mitigation (keeps the no-queue design, fixes the failure mode)

Don't introduce BullMQ/pg-boss — that was correctly ruled out for MVP scope. Instead, make the
worker **resumable and self-checkpointing**, and add a **stale-job reconciliation** check. This
is a data-flow change, not an infrastructure change:

1. `runScrapeJob` processes work in small units (one search call = one unit — one grid cell,
   one keyword, or one page). After each unit it **upserts progress into the job row**
   (`leads_found`, a `cursor`/`next_step` JSON column describing what's left to do) — not just
   at the very end.
2. Before starting a new unit, check elapsed time since the job row's `started_at`. If close to
   a safety threshold (e.g. 250s, leaving headroom under Hobby's 300s), **stop cleanly**, write
   `status: 'partial'` with the saved cursor, and return.
3. The client is already polling `GET /api/jobs/:id` every ~1s. When that endpoint sees
   `status: 'partial'` with remaining cursor work, it triggers continuation itself — but only
   after **atomically claiming** the job first (see the concurrency guard in Pattern 3 below).
   Without that guard, multiple ~1s polls would each see `partial` and each schedule its own
   `after(() => continueScrapeJob(...))` before the first one flips the status, double-processing
   the same cursor and burning API quota. This keeps the "no external scheduler" property while
   working around the single-invocation ceiling — a same-pattern extension of what's already
   locked in, not new infrastructure.
4. Add a lightweight **stale-job watchdog**: whenever `GET /api/jobs/:id` (or any job-list read)
   encounters a row with `status IN ('pending','running')` and `updated_at` older than a
   threshold (e.g. 2x the safety window, ~10 minutes), flip it to `status: 'error'` with reason
   `'timed out'` on read. No cron needed — this piggybacks on the polling traffic that already
   exists.
5. If job volume/duration outgrows this in practice, the next lever is upgrading to Vercel Pro
   and raising `maxDuration` to 800s per-route — cheaper than building a queue, and the
   checkpointed design from step 1-2 still pays off (it also protects against Neon connection
   drops, transient Places API errors, and browser-tab-closed scenarios, not just timeouts).

## CRM Fields vs. Per-Job Lead Rows — a real gap to fix before implementation

**Adopting this recommendation means reopening the locked "no cross-job global dedup in v1"
decision — it should be a deliberate roadmap choice, not something silently folded into schema
work.** The locked schema (`unique(job_id, place_id)`, no cross-job dedup) is fine for the
*scrape* result set, but it has a consequence the requirements don't yet address: **if `notes`
and `contacted` status live directly on the per-job `leads` row, re-running a job over the same
area creates a brand-new lead row for the same business with blank CRM state.** Richard marks a
business "contacted" today, re-runs the Lima scrape next month to catch new listings, and the
same business reappears as a fresh, uncontacted-looking lead — silently defeating the entire
point of a "contacted" flag.

This is not the same problem as the deferred "cross-job global dedup" (which implies fuzzy
matching, merging near-duplicate businesses, resolving conflicting fields — real, deferred
complexity). Google's `place_id` is already a stable, exact, global identifier for a business.
Recognizing that a `place_id` seen before is the same business is a plain **upsert keyed on a
column you already have** — not a dedup algorithm. It's a narrower, cheaper thing than what the
locked decision deferred, but it is still new scope against that decision and should be named
as such in the roadmap. Recommend splitting identity from sighting:

```
businesses                          leads (per-job sighting, as already designed)
──────────────────────────────      ──────────────────────────────
id (pk)                             id (pk)
place_id (unique, not null)         job_id (fk → jobs)
business_name                       place_id
phone                               business_name / phone / address / rating / review_count / website
address                             (snapshot of what THIS job saw — historical/audit record)
website                             status (unused if CRM state lives on businesses instead)
rating, review_count                created_at
notes            ← CRM field        unique(job_id, place_id)
contacted        ← CRM field
first_seen_at
last_seen_at
created_at, updated_at
```

- `runScrapeJob` **upserts into `businesses` on `place_id`** (insert if new, refresh
  `business_name`/`phone`/`address`/`rating`/`website`/`last_seen_at` if it already exists —
  `notes`/`contacted` are untouched by the upsert) *and* inserts the per-job snapshot row into
  `leads` as already designed.
- The CRM UI (leads list, notes editor, contacted toggle) reads/writes `businesses`, not the
  raw per-job `leads` rows. `leads` becomes purely a scrape-history/audit table — "job X found
  business Y" — and CSV export can still join `leads → businesses` for a specific job's export.
- This is additive to the locked schema, not a redesign: `leads` keeps its shape and its
  `unique(job_id, place_id)` constraint exactly as designed; you're adding one new table plus a
  join key that already exists (`place_id`) on both sides.
- If this split feels like scope creep for a v1, the fallback is to explicitly accept and
  document the "notes reset on re-scrape" behavior as intentional MVP scope — but that should
  be a deliberate decision, not a byproduct of the schema no one noticed. Given "CRM fields
  need to attach to leads" is already an Active requirement and "contacted" is the entire
  reason the CRM exists, the `businesses` table is the low-cost fix and is recommended.

## Recommended Component/Data-Flow Structure

### System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│  Browser (React client components)                                     │
│  ┌────────────┐   ┌───────────────────┐   ┌──────────────────────┐    │
│  │ JobForm    │   │ JobProgressPoller │   │ LeadsTable / CRM UI  │    │
│  │ (creates)  │   │ (polls ~1s)       │   │ (notes, contacted)   │    │
│  └─────┬──────┘   └─────────┬─────────┘   └──────────┬───────────┘    │
└────────┼────────────────────┼─────────────────────────┼───────────────┘
         │ POST /api/jobs      │ GET /api/jobs/:id       │ Server Actions
         ▼                     ▼                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Next.js App Router — Node runtime                                     │
│  ┌────────────────────┐  ┌──────────────────┐  ┌─────────────────┐    │
│  │ Route Handlers      │  │ after() worker    │  │ Server Actions   │  │
│  │ /api/jobs (POST)    │→│ runScrapeJob /     │  │ updateNotes()    │  │
│  │ /api/jobs/:id (GET) │  │ continueScrapeJob │  │ setContacted()   │  │
│  │ /api/jobs/:id/export│  └─────────┬─────────┘  └────────┬─────────┘  │
│  └──────────┬───────────┘            │                     │           │
│             │                        ▼                     │           │
│             │              ┌──────────────────┐            │           │
│             │              │ Places API client │           │           │
│             │              │ (field-masked     │           │           │
│             │              │  search + mapping)│           │           │
│             │              └─────────┬─────────┘           │           │
│             ▼                        ▼                     ▼           │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │              Data Access Layer (lib/db/*)                      │    │
│  │   jobs.ts · leads.ts · businesses.ts — all SQL lives here       │    │
│  └───────────────────────────────┬───────────────────────────────┘    │
└──────────────────────────────────┼─────────────────────────────────────┘
                                    ▼
                     ┌───────────────────────────┐
                     │  Neon Postgres              │
                     │  jobs · leads · businesses  │
                     └───────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|-----------------|-------------------------|
| `POST /api/jobs` (Route Handler) | Validate params (Zod), insert `jobs` row (`status: pending`), schedule `after(runScrapeJob(jobId))`, return `{ jobId }` immediately | App Router `app/api/jobs/route.ts`, Node runtime |
| `GET /api/jobs/:id` (Route Handler) | Return current job status/progress; on read, atomically claim and trigger continuation if `status: partial`; flag stale `running` jobs as `error` | `app/api/jobs/[id]/route.ts`, polled every ~1s by the client |
| `GET /api/jobs/:id/export` (Route Handler) | Stream CSV of a completed job's leads (joined to `businesses` for current CRM state) | Reuses the DAL, no new job needed |
| `runScrapeJob` / `continueScrapeJob` (worker) | Checkpointed unit-of-work loop: one search call per unit, upserts `businesses`, inserts `leads`, updates job progress, stops cleanly near the duration safety threshold | `lib/jobs/runScrapeJob.ts`, invoked only via `after()` |
| Places API client | Builds field-masked Nearby/Text Search requests, handles `pageToken` waits, maps API responses to the lead/business shape, applies tier-1 filter (missing `website`) | `lib/places/*.ts`; never called directly from UI code |
| CRM Server Actions | `updateLeadNotes(businessId, notes)`, `setContactedStatus(businessId, contacted)` — simple mutations tied to forms, call `revalidatePath` | `app/leads/actions.ts`, `"use server"` |
| Data Access Layer | All SQL/query-builder calls for `jobs`, `leads`, `businesses` — the only code that imports the DB client | `lib/db/{client,schema,jobs,leads,businesses}.ts` |

## Recommended Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── jobs/
│   │       ├── route.ts            # POST create job
│   │       └── [id]/
│   │           ├── route.ts        # GET job status (polling target)
│   │           └── export/route.ts # GET CSV export
│   ├── jobs/
│   │   ├── page.tsx                # job creation form + recent jobs
│   │   └── [id]/page.tsx           # job progress view (uses JobProgressPoller)
│   └── leads/
│       ├── page.tsx                # CRM leads list (reads `businesses`)
│       └── actions.ts              # "use server" — notes/contacted mutations
├── lib/
│   ├── db/
│   │   ├── client.ts                # Neon serverless driver + Drizzle instance
│   │   ├── schema.ts                # jobs, leads, businesses table defs
│   │   ├── jobs.ts                  # createJob, updateJobProgress, getJob, listStaleJobs, claimPartialJob
│   │   ├── leads.ts                 # insertLeadSnapshot, listLeadsForJob
│   │   └── businesses.ts            # upsertBusiness, updateNotes, setContacted, listBusinesses
│   ├── places/
│   │   ├── client.ts                # fetch wrapper, field mask, auth
│   │   ├── search.ts                # Nearby/Text Search unit-of-work + pageToken handling
│   │   └── mapPlaceToLead.ts        # API response → internal shape + tier-1 filter
│   ├── jobs/
│   │   ├── runScrapeJob.ts          # checkpointed worker entrypoint
│   │   └── checkpoint.ts            # cursor encode/decode, elapsed-time safety check
│   └── csv/
│       └── export.ts
├── components/
│   ├── JobForm.tsx
│   ├── JobProgressPoller.tsx        # client component, ~1s polling via fetch/SWR
│   ├── LeadsTable.tsx
│   ├── NotesEditor.tsx
│   └── ContactedToggle.tsx
└── types/
    └── (shared Zod schemas / inferred types for job params, lead shape)
```

### Structure Rationale

- **`lib/db/` as a strict Data Access Layer:** no other module (route handler, server action,
  worker) talks to Postgres directly. This mirrors Next.js's own recommended pattern of
  centralizing data access so validation/shape logic lives in one place — it also makes the
  `businesses` upsert-vs-`leads` insert distinction (see CRM section above) enforceable in one
  file instead of scattered across call sites.
- **`lib/places/` isolated from `lib/jobs/`:** the Places API client only knows how to fetch and
  map; the worker (`lib/jobs/runScrapeJob.ts`) owns checkpointing, elapsed-time safety checks,
  and DB writes. This keeps the "stop before the duration ceiling" logic in one place, testable
  without hitting the real API (mock `lib/places/client.ts`).
- **Route Handlers for the job lifecycle, Server Actions for CRM mutations:** the job flow is
  inherently HTTP-shaped (create → poll → export) and benefits from being a plain JSON API —
  easy to curl/test, no ambiguity about what to poll. CRM edits (notes, contacted) are simple
  form-bound mutations where Server Actions' built-in `revalidatePath` and progressive-enhancement
  behavior are a better fit than round-tripping through a Route Handler + client-side fetch.

## Architectural Patterns

### Pattern 1: Checkpointed background worker (not "fire-and-forget `after()`")

**What:** the scrape worker processes one unit of work (one search call) at a time, persists
progress after each unit, and can be resumed from a saved cursor.
**When to use:** any `after()`/`waitUntil()` workload whose total duration isn't provably well
under the platform's `maxDuration` — which, given the Places API pagination/fan-out mechanics
above, is the default case here once `leads_target` grows past a small category+area run.
**Trade-offs:** more code than a single `await`-everything loop; but it's the difference between
a job that silently hangs forever on Hobby and one that visibly completes across a couple of
poll-triggered continuations.

**Example:**
```typescript
// lib/jobs/runScrapeJob.ts
export async function runScrapeJob(jobId: string, cursor?: JobCursor) {
  const startedAt = Date.now();
  let current = cursor ?? initialCursor(jobId);

  while (!current.done) {
    if (Date.now() - startedAt > SAFETY_WINDOW_MS) {
      await updateJobProgress(jobId, { status: 'partial', cursor: current });
      return; // next poll's GET handler resumes via continueScrapeJob
    }
    const { results, nextCursor } = await runOneSearchUnit(current);
    await upsertBusinessesAndLeads(jobId, results);
    current = nextCursor;
  }
  await updateJobProgress(jobId, { status: 'done', cursor: null });
}
```

### Pattern 2: Data Access Layer (DAL)

**What:** a single module per entity that owns all reads/writes for that table; every other
layer imports from here, never from the DB client directly.
**When to use:** always, for a project this size — it's the cheapest guardrail against SQL
scattered across route handlers, actions, and the worker, and it's where the `businesses`
upsert-on-`place_id` logic and stale-job reconciliation query live.
**Trade-offs:** minor indirection for trivial reads; pays off the moment the CRM `businesses`
table is added, since every write path funnels through one place.

### Pattern 3: Lazy continuation on poll (no cron, no queue) — with an atomic claim guard

**What:** the `GET /api/jobs/:id` handler — already being hit every ~1s by the client — is the
trigger for both status reporting and, when a job is `partial`, kicking off the next chunk via
`after()`. **This requires a concurrency guard:** because the client polls every ~1s and
`after()` work is scheduled post-response (its first DB write lands asynchronously), several
consecutive polls can all observe `status: 'partial'` before any continuation has flipped it —
each would otherwise schedule its own `continueScrapeJob`, double-processing the same cursor and
burning Places API quota. Guard it with an atomic claim: only start a continuation if the claim
update actually affects a row.

```typescript
// lib/db/jobs.ts
const claimed = await db.query(
  `UPDATE jobs SET status = 'running', updated_at = now()
   WHERE id = $1 AND status = 'partial'
   RETURNING *`,
  [jobId]
);
if (claimed.rowCount === 1) {
  after(() => continueScrapeJob(jobId, claimed.rows[0].cursor));
}
```

**When to use:** specifically because polling already exists in the locked design; this reuses
that traffic instead of adding Vercel Cron or an external scheduler.
**Trade-offs:** continuation only progresses while a client is actively polling (acceptable for
a single-user tool where Richard is watching the job run); if the tab is closed mid-job, the
stale-job watchdog (see CRM/duration section) marks it `error` rather than leaving it stuck, and
Richard can re-run it.

## Suggested Build Order

Dependency chain for phase sequencing — each step depends only on what's listed before it:

1. **Data Access Layer + schema** (`jobs`, `leads`, `businesses` tables, Drizzle schema,
   Neon client). Nothing else can be built or tested without this existing first, and it's
   where the CRM-vs-dedup decision (above) gets locked into actual columns.
2. **Places API client + `mapPlaceToLead`** (`lib/places/*`). Independent of the DB — mockable
   in isolation per the project's own stated testing intent ("Integration: job creation + a
   mocked Places API"). Can be built and unit-tested in parallel with step 1 if useful, but
   both must exist before step 3.
3. **Checkpointed worker** (`runScrapeJob`, `checkpoint.ts`). Depends on 1 (writes via the DAL)
   and 2 (fetches via the Places client). This is where the duration-safety and cursor logic
   from the Validation section above gets implemented — build and test this in isolation
   (mocked Places client, real or test DB) before wiring it to HTTP.
4. **Job Route Handlers + polling** (`POST /api/jobs`, `GET /api/jobs/:id` including the atomic
   claim/continuation guard and stale-job watchdog). Depends on 3 existing and callable. This is
   also where the `after()` duration-ceiling behavior gets validated end-to-end against a real
   deployment (Hobby vs Pro), which can't be verified locally.
5. **CRM Server Actions + UI** (`leads/actions.ts`, `LeadsTable`, `NotesEditor`,
   `ContactedToggle`). Depends only on the `businesses` table from step 1 — does not depend on
   the scrape worker being complete, so this can run in parallel with steps 2-4 once step 1
   lands, using seeded/fixture data.
6. **CSV export.** Depends on 1 (schema/joins) and benefits from 3-4 having produced real job
   data to export against; naturally last since it's the lowest-risk, most isolated piece.

## Data Flow

### Job creation + scrape

```
JobForm submit
    ↓
POST /api/jobs → validate (Zod) → insert jobs row (status: pending)
    ↓                                      ↓
return { jobId } immediately        after(() => runScrapeJob(jobId))
    ↓                                      ↓
JobProgressPoller starts polling    runOneSearchUnit → Places API (field-masked)
    ↓                                      ↓
GET /api/jobs/:id (every ~1s)       upsertBusinessesAndLeads (DAL)
    ↓                                      ↓
render progress / done / partial    updateJobProgress (leads_found, cursor, status)
    ↓ (if status: partial)
atomic claim (UPDATE ... WHERE status='partial') → after(() => continueScrapeJob(jobId, cursor))
```

### CRM update

```
LeadsTable / NotesEditor / ContactedToggle
    ↓ (Server Action call)
updateLeadNotes(businessId, notes) / setContactedStatus(businessId, contacted)
    ↓
lib/db/businesses.ts → UPDATE businesses SET notes/contacted, updated_at
    ↓
revalidatePath('/leads')
```

## Scaling Considerations

This is a single-user personal tool for two markets — "scale" here means job volume and lead
volume, not concurrent users.

| Scale | Architecture Adjustments |
|-------|---------------------------|
| A few jobs/week, ≤100 leads/job | Current design (Hobby plan, checkpointed `after()`, lazy continuation) is sufficient as-is. |
| Many jobs/day, or `leads_target` regularly >200 | Upgrade to Vercel Pro, set per-route `maxDuration` up to 800s — the checkpointing already built in makes this a config change, not a rewrite. |
| Multi-market grid scraping (many cities, many categories in parallel) | Revisit the "no queue" decision — at that point a real queue (pg-boss is a reasonable next step since Postgres is already the datastore) earns its complexity. Not needed for MVP. |

### Scaling Priorities

1. **First likely friction point:** a job that needs enough grid/keyword fan-out to exceed
   Hobby's 300s ceiling. Mitigated already by the checkpoint pattern above — this is a
   near-term concern, not a hypothetical one, given the two target markets and free-text
   `leads_target`.
2. **Second, further out:** Neon connection limits under many rapid poll-triggered
   continuations — use the Neon serverless HTTP driver (stateless per-request, no pooled
   connections to exhaust) rather than a traditional long-lived `pg` pool.

## Anti-Patterns

### Anti-Pattern 1: Treating `after()` as a durable job queue

**What people do:** put the entire scrape loop (all categories, all pages, all grid cells) in
one `await`-chain inside `after()` and assume it'll "just finish eventually."
**Why it's wrong:** `after()` shares the request's `maxDuration`; on Hobby that's a hard,
non-configurable 300s with no graceful handling — the invocation is killed mid-flight and the
job row is left in a `pending`/`running` limbo state indefinitely.
**Instead:** checkpoint after every unit of work, persist a resumable cursor, and use the
already-polling client as the continuation trigger, guarded by an atomic claim (Pattern 1 and 3
above).

### Anti-Pattern 2: CRM state (notes, contacted) living only on per-job lead rows

**What people do:** put `notes`/`contacted` directly on the `leads` table as originally sketched,
since that's where the requirement text says "CRM fields... attach to leads."
**Why it's wrong:** combined with `unique(job_id, place_id)` and no cross-job dedup, re-running
a job for the same area creates a new lead row per re-scrape — CRM history (who's been
contacted) silently resets, defeating the CRM's purpose.
**Instead:** add a `businesses` table keyed on the already-unique `place_id`; CRM fields live
there, `leads` stays a per-job scrape snapshot/audit trail (see CRM section above).

### Anti-Pattern 3: Fetching Place Details per result to check for a website

**What people do:** call Nearby/Text Search for basic fields, then loop over every result
calling Place Details to get `website`/`websiteUri`.
**Why it's wrong:** doubles the number of API calls (cost) and adds N extra network round-trips
inside the same `after()` duration budget — exactly the kind of avoidable time pressure that
pushes a job toward the 300s ceiling.
**Instead:** add `places.websiteUri` (and any other needed fields) directly to the Nearby/Text
Search field mask — the field is available on the search response itself in the New Places API.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| Google Places API (New) — Nearby/Text Search | Server-side only (`lib/places/client.ts`), field-masked requests, API key in env, never exposed to client | Nearby Search caps at 20 results/call, no reliable multi-page pagination — fan out via grid/keyword for more. Text Search supports `pageToken` pagination (~3 pages / 60 results) with an enforced ~2-5s token-activation wait between pages. |
| Google Places API — billing/SKU | N/A architecturally, but field-mask choice drives cost tier | Requesting `websiteUri` and other "Pro"-tier fields affects the per-request SKU; keep the field mask minimal (only what tier-1 filtering + lead display need). |
| Neon Postgres | Serverless HTTP driver (`@neondatabase/serverless`) + Drizzle ORM (`drizzle-orm/neon-http`) | Recommended over Prisma for this stack: near-instant cold starts (no query-engine binary), native fit with Neon's serverless driver, smaller bundle — the standard 2026 pairing for Next.js + Neon on serverless/edge-adjacent Node runtimes. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|-----------------|-------|
| UI ↔ job lifecycle | Route Handlers (`POST /api/jobs`, `GET /api/jobs/:id`) | Plain JSON over HTTP; polling-friendly, framework-agnostic if the UI ever needs a non-React client. |
| UI ↔ CRM mutations | Server Actions | Form-bound, `revalidatePath`-driven; no separate client-side fetch/state plumbing needed. |
| Route Handlers / worker / actions ↔ Postgres | Data Access Layer (`lib/db/*`) only | No SQL or Drizzle query outside this layer — enforced by convention/lint, not framework mechanism. |
| Worker ↔ Google Places API | `lib/places/*` only | Keeps API-key handling, field masks, and pagination/rate-limit logic in one testable, mockable module. |

## Sources

- Next.js official docs — `after()` API reference (`nextjs.org/docs/app/api-reference/functions/after`) — HIGH confidence, primary source.
- Vercel official docs — "Configuring Maximum Duration for Vercel Functions"
  (`vercel.com/docs/functions/configuring-functions/duration`) — HIGH confidence, primary source; plan-tier duration table sourced directly from this page.
- Vercel official docs — Functions API Reference / `waitUntil()` behavior
  (`vercel.com/docs/functions/functions-api-reference`) — HIGH confidence, primary source.
- Google Places API (New) official docs — Nearby Search, Text Search, "Choose fields to return"
  (`developers.google.com/maps/documentation/places/web-service/*`) — HIGH confidence, primary source; confirms `websiteUri` is available via field mask on search responses and confirms Nearby Search's 20-result cap vs Text Search's `pageToken` pagination.
- Google Issue Tracker #332988082 (Nearby Search New — feature request for >20 results) — MEDIUM confidence, corroborates the 20-result cap behavior from a real-world reporter.
- Community/aggregated web search results (Inngest, DBOS, Render, general blog commentary on
  `after()` vs background-job systems and Postgres one-to-many patterns) — MEDIUM/LOW
  confidence, used only to corroborate patterns already confirmed by official docs, not as a
  standalone source for any load-bearing claim above.
- Drizzle vs Prisma comparison (multiple 2026 blog/benchmark sources, cross-checked) — MEDIUM
  confidence; consistent across sources on Drizzle's serverless/edge-friendliness for Neon.

---
*Architecture research for: findleads (scrape-job + CRM system)*
*Researched: 2026-07-02*
