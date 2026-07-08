# findleads — Project Overview

> Deep knowledge transfer written 2026-07-06 after a full codebase read. Audience: an engineer
> or AI agent who has never seen this repo. Operational rules live in `.claude/CLAUDE.md`;
> known weaknesses live in `GAPS.md`; GSD planning history lives in `.planning/`.

## What this is

A **personal lead-generation tool** for Richard Pillaca. It searches Google Maps (via the
official **Google Places API Text Search (New)** — not scraping, not a headless browser) for
businesses in a category + city, flags the ones that **have no website** ("tier-1" leads —
prime prospects for pitching web design/development services), and wraps a tiny CRM around
them: per-business notes, a contacted toggle, and CSV export.

Single user. No auth, no billing, no teams — all deliberate scope cuts. Toronto and Lima
(Peru) are the two validated markets, but the location field is free text and works anywhere
(with a locale caveat — see Gotchas). The long-term ambition (per session handoffs) is to make
it sellable/international, but the shipped v1 is explicitly a personal tool.

**Status:** MVP complete. All 5 GSD roadmap phases shipped and verified (27/27 requirements),
103/103 tests green locally, golden path manually verified against the real API in a
production build. A "Phase 6" (UX polish: guided first-run flow + contextual copy) is designed
in a paused brainstorm but not yet started.

## Tech stack and why

| Piece | Version | Why it's here |
|---|---|---|
| Next.js (App Router) | 16.2.10 | Single full-stack deployable — API routes + UI in one app, no separate backend. `after()` is the entire async-job runtime (see Architecture). React Compiler enabled in `next.config.ts`. |
| React | 19.2.4 | Server Components by default; `useActionState` for Server Action forms. |
| Neon Postgres + `@neondatabase/serverless` | 1.1.0 | Serverless-friendly Postgres over HTTP (`neon-http` driver) — no connection pool to manage, works from Vercel functions. |
| Drizzle ORM + drizzle-kit | 0.45.2 / 0.31.10 | Typed schema in `lib/db/schema.ts`, generated SQL migrations in `drizzle/`. Chosen over Prisma for its light serverless footprint. |
| Zod | 4.4.3 | Validation at every boundary: env vars, API request bodies, the Places API response, Server Action FormData. |
| SWR | 2.4.2 | Client-side job-status polling (1.5s interval) — the polling is load-bearing, see Architecture. |
| Tailwind CSS v4 | ^4 | Utility-only styling, no component library (no shadcn). Colors are hard-coded hex in classNames per the UI spec. |
| csv-stringify | ^6.8.1 | CSV export; sync API, fine at the 60-lead-per-job cap. |
| Vitest | 4.1.9 | Unit + integration tests. Non-obvious config — see Gotchas. |
| pnpm | 10.30.3 | The only sanctioned package manager. Never npm/yarn. |
| `server-only` | 0.0.1 | Import-time guard on every server module so a client bundle can never pull in the DB client or API key. |

## Architecture

```
Browser                        Next.js (Node runtime)                  External
───────                        ──────────────────────                  ────────
/jobs page ──POST /api/jobs──▶ validate (Zod) ─▶ INSERT jobs row
                               after(runScrapeJob)  │ 201 {jobId}
                                      │
                                      ▼  (post-response, same lambda)
                               runScrapeJob loop:
                                 check 250s safety window ──▶ status:'partial' + cursor, stop
                                 fetchOnePage ───────────────────────▶ Places Text Search
                                   inferLocale → buildTextQuery         (field-masked POST,
                                   pages 2-3 via fetchNextPage retry)    max 3 pages / 60)
                                 mapPlaceToLead (drop closed)
                                 per lead: upsertBusiness ─▶ businesses (CRM state preserved)
                                           insertLeadSnapshot ─▶ leads (per-job snapshot)
                                 checkpoint: UPDATE jobs SET cursor, leads_found
                                 …repeat until done / window / error

JobStatusPoller (SWR 1.5s) ──GET /api/jobs/[id]──▶ flagStaleJob (watchdog, 8.3min)
  router.refresh() on              │                claimPartialJob (atomic UPDATE..WHERE
  terminal transition              │                  status='partial') ─▶ after(runScrapeJob)
                                   ◀── JSON {status, leadsFound, errorReason} (cursor omitted)

/leads page ──▶ listBusinesses (all rows, updated_at DESC)
  NotesField / ContactedToggle ──Server Action──▶ UPDATE businesses ─▶ revalidatePath('/leads')

Export link ──GET /api/jobs/[id]/export──▶ 409 unless status='done'
                                           JOIN leads×businesses ON place_id
                                           sanitizeCsvCell ─▶ csv-stringify ─▶ attachment
```

### The data model — identity vs. sighting (the most important idea in the schema)

Three tables (`lib/db/schema.ts`, migrations in `drizzle/`):

- **`jobs`** — one row per scrape run. Status enum `pending → running → partial|done|error`,
  plus the checkpoint state: `leads_found`, `cursor` (jsonb `JobCursor`), `error_reason`,
  `result_cap_hit`.
- **`leads`** — immutable per-job snapshot rows. `unique(job_id, place_id)` is the only dedup
  in the system (per-job, never global — deliberate). No CRM columns here, ever.
- **`businesses`** — one durable row per real-world place, keyed `unique(place_id)`. Holds the
  CRM state: `notes`, `contacted`, `first_seen_at`/`last_seen_at`.

The split exists so **re-scraping never wipes CRM state**. `upsertBusiness`
(`lib/db/businesses.ts`) refreshes content fields on conflict but deliberately **omits**
`notes`, `contacted`, and `firstSeenAt` from the `onConflictDoUpdate` set — omitting a column
is what makes Postgres keep its value. That omission IS requirement DATA-01. Never "complete"
that set.

### The checkpointed worker — why the job system looks overbuilt

There is no queue (no BullMQ/Redis/pg-boss — explicit decision). The entire async runtime is
Next.js `after()`, which on Vercel Hobby dies silently at 300s with no error surface. The
design absorbs that:

1. `runScrapeJob` (`lib/jobs/runScrapeJob.ts`) treats **one Places page fetch as one unit of
   work** and checkpoints (`cursor` + `leads_found`) to the jobs row after every unit.
2. Before each unit it checks a **~250s safety window** (`SAFETY_WINDOW_MS`,
   `lib/jobs/checkpoint.ts`); if exceeded it writes `status:'partial'` with the cursor and
   exits cleanly.
3. **Continuation is lazy**: nothing resumes a partial job except the next poll of
   `GET /api/jobs/[id]`, which atomically claims it (`claimPartialJob` — a single
   `UPDATE … WHERE status='partial' … RETURNING`; Postgres row locking is the mutex) and
   schedules another `after(runScrapeJob)`. Losing the claim race is normal and handled.
4. A **watchdog** on the same GET (`flagStaleJob`) flips a `pending`/`running` job with no
   progress for `WATCHDOG_MS` (~8.3min) to `error`, so a killed invocation can't strand a job
   in `running` forever.

Consequence worth internalizing: **an unwatched job can stall at `partial` indefinitely** —
polling is what drives both continuation and the watchdog. That's accepted for a single-user
tool whose user is watching the page.

### The Places client (`lib/places/`)

- `client.ts` — one endpoint (`places:searchText`), one reused `FIELD_MASK` requesting
  `websiteUri` + `businessStatus` alongside display fields **in the same call** (no per-result
  Place Details lookup; that would cost Enterprise-tier per lead). `PlacesApiError`
  deliberately carries only `status` + response `body` — never the request (which holds the
  API key header). Response is Zod-parsed before anything reads it.
- `paginate.ts` — Google's `nextPageToken` takes ~2-5s to activate; `fetchNextPage` **always
  sleeps before the first attempt** (it's an activation wait, not a backoff) and retries on
  `INVALID_REQUEST` up to 3 times.
- `locale.ts` — regex table mapping free-text location → `languageCode`/`regionCode`. Only
  Toronto and Lima rules exist; everything else falls back to `en`/`CA`. Diacritics are
  stripped before matching because JS `\b` is ASCII-only ("Perú" wouldn't match otherwise).
- `mapPlaceToLead.ts` — drops closed businesses via an **exclusion set**
  (`CLOSED_PERMANENTLY`/`CLOSED_TEMPORARILY`). Exclusion, not allowlist, because Google
  *omits* `businessStatus` when unknown — an allowlist would silently drop unknown-status
  places. The schema keeps the field `.optional()` (never `.default()`) for the same reason.
- `buildTextQuery.ts` — `"{category} in {location}"` is the **only geographic scoping in the
  entire system**. `regionCode` is a ranking bias, not a filter. Don't send category without
  location composed in.

### The 60-result cap (SCRAPE-07) — subtle on purpose

Text Search hard-caps at 3 pages / 60 results. The UI must say "60+ results found — refine
your search" when the cap was genuinely hit. But closed-business filtering can drop
`leadsFound` below 60 even when the cap WAS hit, so the flag can't be derived from the lead
count. Instead `capHit` is computed inside `defaultFetchOnePage` from the **raw pagination
signal** (`pagesFetched >= MAX_PAGES && nextPageToken` present) *before* filtering, carried
monotonically through checkpoints in the cursor, and persisted to `jobs.result_cap_hit` on the
final `done` write. `app/jobs/page.tsx` renders off that column, never off `leadsFound >= 60`.

### Environment boundary

`lib/env.ts` is **the only sanctioned `process.env` read** in app code (exception:
`drizzle.config.ts`, a CLI-only file). It Zod-parses `DATABASE_URL` + `PLACES_API_KEY` at
import time and is `server-only`. Tests get env injected by `vitest.config.ts`. The API key
never appears client-side (SEC-01); it exists only in the `X-Goog-Api-Key` header inside
`searchTextPlaces`.

## Key decisions you must not accidentally reverse

1. **Official Places API only.** No scraping, no headless browser, ever, in v1. Locked.
2. **Accepted ToS risk (documented, deliberate):** storing name/address/phone/rating/website
   durably in Postgres breaches Google's "No Caching" clause (only `place_id` is exempt).
   Richard chose this knowingly for a personal pre-revenue tool. **Revisit before any
   public/paid launch** — until then, do not "fix" it and do not make the app public-facing
   without raising it.
3. **No queue, no auth, no global dedup, no email enrichment.** All explicitly out of scope
   for v1 (`.planning/REQUIREMENTS.md` Out of Scope table). Don't add them casually.
4. **Tier-1 copy is a signal, not a fact:** always "no website found on Google", never "has no
   website". This exact wording is a requirement (SCRAPE-05) and appears in the UI and CSV.
5. **Google attribution** (`components/GoogleAttribution.tsx`): the literal string
   "Google Maps", ≥12px, not recolored, not hidden. Required by Google's policies (SEC-03).
   An earlier draft used wrong wording; don't reintroduce it.
6. **GSD `.planning/` is the authoritative product/planning record.** `docs/architecture.md`,
   `docs/decisions.md`, and `.claude/rules/findleads-architecture.md` describe the pre-pivot
   design and are stale (see GAPS.md).

## Critical paths — what's load-bearing vs. safe

**Load-bearing (change with tests + care):**
- `lib/jobs/runScrapeJob.ts` + `lib/jobs/checkpoint.ts` — the worker loop, checkpoint
  ordering ('running' write before first fetch; checkpoint after every unit; capHit
  monotonicity). Most of the system's correctness lives here.
- `lib/db/businesses.ts` `upsertBusiness` — the deliberate `set` omission (DATA-01).
- `lib/db/jobs.ts` `claimPartialJob`/`flagStaleJob` — the atomicity of these single-statement
  UPDATEs is the concurrency model. Never split them into read-then-write.
- `app/api/jobs/[id]/route.ts` — the watchdog→claim→continue sequence and the deliberate
  `cursor` omission from the response.
- `lib/places/schema.ts` + `mapPlaceToLead.ts` — the optional-businessStatus / exclusion-set
  contract.
- `lib/csv/sanitize.ts` — formula-injection prefix (`'`) on `=+-@` cells (EXPORT-02).
- `drizzle/*.sql` — shipped migrations, append-only, never edit.

**Safe to change casually:** Tailwind classes, page copy (except the two required strings
above), table layout in `app/jobs/page.tsx` / `app/leads/page.tsx`, the `relativeTime`
helpers, `docs/` prose.

## Surprises that will trip you up

- **Vitest needs `conditions: ['react-server']`** (in BOTH `resolve` and `ssr.resolve` of
  `vitest.config.ts`) or every `server-only` import throws. Side effect: importing `swr` in a
  test file crashes at load (React client APIs missing under that condition) — which is why
  `app/jobs/isTerminalStatus.ts` exists as a separate directive-free module. Follow that
  pattern for any client-component logic you want unit-tested.
- **`vitest.config.ts` injects `DATABASE_URL` from `TEST_DATABASE_URL`** (`.env.test`, real
  isolated Neon branch) with a syntactically-valid dummy fallback. Integration tests hit a
  REAL database; they clean up after themselves. Locally you need `.env.test` populated.
- **Agent tooling cannot touch `.env*` files at all** — `.claude/settings.json` hard-denies
  Read/Write on `.env*` paths AND any Bash command containing the literal `.env`. Ask the
  user to edit secrets; never try to probe those files.
- **`z.coerce.boolean()` is a footgun**: `Boolean('false') === true`. Booleans crossing a
  FormData/string boundary use `z.enum(['true','false']).transform(...)`
  (`app/leads/actions.ts`). Copy that pattern.
- **Drizzle does not auto-bump `defaultNow()` columns on UPDATE** — every `.update().set()`
  must set `updatedAt: new Date()` explicitly. Every existing DAL write does; keep doing it.
- **Both pages need `export const dynamic = 'force-dynamic'`.** Each reads live DB state; a
  static prerender bakes stale data into the build. `/leads` shipped without it and it was the
  MVP's worst bug (invisible in dev and tests, only visible in `next build`'s route table).
  Any new DB-reading page needs the same line.
- **Server Actions returning `{ok, error}` can't be passed straight to `<form action>`** —
  React's type wants void. Wrap with `useActionState` in a small client component
  (`NotesField.tsx` / `ContactedToggle.tsx` pattern).
- **CI has never been green** — it dies in seconds at pnpm setup on every push
  (`package.json` lacks a `packageManager` field), so the lint→typecheck→test→build gate has
  never actually run on GitHub. All verification so far is local. See GAPS.md #1/#2.
- **The git workflow docs disagree with reality.** `.claude/rules/common/git-workflow.md`
  says branch→PR→merge; the GSD config (`.planning/config.json`) says
  `branching_strategy: "none"` and the entire MVP was pushed directly to `master`. Reality:
  direct pushes to master are the project's current practice, with the user's explicit
  go-ahead per push.
- **SWR pauses polling in hidden tabs** (`refreshWhenHidden: false` default). A backgrounded
  tab's badge catches up on focus. Known, accepted; don't "fix" it.
- **A file named `nul` keeps appearing at repo root** — Windows artifact from a cmd-style
  `> nul` redirect somewhere in tooling. Junk; delete when seen (needs `rm nul` from Git
  Bash; Explorer can't delete it).
