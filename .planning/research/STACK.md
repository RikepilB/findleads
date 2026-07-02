# Stack Research

**Domain:** Lead-gen scraper (Google Places API) + web-presence filtering + lightweight CRM
**Researched:** 2026-07-02
**Confidence:** HIGH

Scope note: Next.js App Router, Node runtime API routes, Neon Postgres, and pnpm are locked
by prior decisions (see `PROJECT.md` Constraints) and are **not** re-litigated here. This
research covers the supporting libraries/patterns that slot into that locked stack.

## Recommended Stack

### Core Technologies (locked — listed for context only)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.10 | Full-stack framework, App Router | Locked by prior decision — not reconsidered |
| Neon Postgres | — | Serverless Postgres | Locked by prior decision — not reconsidered |
| pnpm | — | Package manager | Locked by prior decision — not reconsidered |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm` | 0.45.2 | Postgres ORM/query builder | All DB access — schema, queries, migrations |
| `drizzle-kit` | 0.31.10 | Schema push/migration generation | Dev workflow + CI migration generation |
| `@neondatabase/serverless` | 1.1.0 | Neon driver (HTTP + WebSocket variants) | `neon-http` variant for all app queries (see rationale below) |
| `zod` | 4.4.3 | Runtime schema validation | Validating `POST /api/jobs` body, job params, env vars — already implied by `findleads-architecture.md` ("validate params (Zod)") |
| `drizzle-zod` | 0.8.3 | Generate Zod schemas from Drizzle table definitions | Optional — avoids hand-duplicating a Zod schema for every DB-backed shape (lead, job). Peer-compatible with `zod@^4` and `drizzle-orm@>=0.36` |
| `csv-stringify` | 6.8.1 | CSV generation with correct quoting/escaping | `GET /api/jobs/:id/export` CSV route |
| `swr` | 2.4.2 | Client-side polling of `GET /api/jobs/:id` | Single-endpoint polling of job status/progress |
| native `fetch` | — (Node/Next built-in) | Calling Google Places API (New) REST endpoints directly | Every Places API call — do not add a Places client library (see below) |

No form library is recommended for v1. The two forms in scope — the job-creation form
(category + free-text location) and lead note/status edits — are 2-3 fields each. Native
`<form>` + Server Actions + the same Zod schema used for `/api/jobs` validation is enough.
Defer `react-hook-form` until a form has enough fields/interactivity (inline array edits,
complex conditional fields) to justify it — nothing in v1 scope does.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `drizzle-kit push` / `generate` + `migrate` | Schema migrations | Use `generate` + `migrate` (versioned SQL files), not raw `push`, once past local prototyping — matches the "additive migrations, never edit a shipped one" rule in `.claude/rules/common/coding-rules.md` |
| `drizzle-kit studio` | DB browser during dev | Optional, useful for inspecting scraped leads without writing ad-hoc SQL |
| `tsx` | Run TS scripts (seed/one-off) | If any one-off scripts are needed outside the Next.js app itself |

## Installation

```bash
# Core supporting deps
pnpm add drizzle-orm @neondatabase/serverless zod csv-stringify swr

# Optional: schema-derived validation
pnpm add drizzle-zod

# Dev dependencies
pnpm add -D drizzle-kit
```

No package is needed for Google Places API calls — use the Node/Next.js built-in `fetch`.

## Key Rationale (the non-obvious choices)

### Google Places API: raw `fetch`, not `@googlemaps/places`

The official Node client (`@googlemaps/places`, 2.5.0) is a GAPIC-generated gRPC-style client
built on `google-gax` (4.1MB unpacked, pulls in `google-auth-library`/`protobufjs`). It's
designed around Application Default Credentials (GCP service accounts) — natural for code
running *on* GCP infra, awkward to configure for a Next.js app on Vercel/elsewhere.

Places API (New) is a plain REST/JSON API that accepts a simple API key via the
`X-Goog-Api-Key` header (confirmed against Google's own REST docs) — no OAuth/ADC needed.
For a handful of Text Search / pagination calls per job, `fetch()` against
`https://places.googleapis.com/v1/places:searchText` with `X-Goog-Api-Key` and
`X-Goog-FieldMask` headers is simpler, lighter, and has zero extra dependencies. Parse the
JSON response through a Zod schema at the boundary (per the project's own "validate at
boundaries" rule) rather than trusting the official client's generated types.

**Confidence: HIGH** — REST auth mechanism confirmed directly against Google's official docs
(`developers.google.com/maps/documentation/places/web-service/get-api-key`); package
dependency weight confirmed directly against the npm registry.

### ORM: Drizzle over Prisma

Both work in Next.js Server Components/Route Handlers with no structural difference. The
deciding factors for this project:
- **Neon serverless fit.** Drizzle's `neon-http` driver integration is a first-class,
  officially documented pairing (`orm.drizzle.team/docs/get-started/neon-new`,
  `neon.com/docs/guides/drizzle`). Prisma 7 pushes toward Prisma Accelerate or a direct
  edge-compatible connection — an extra moving part this single-user MVP doesn't need.
- **Cold start / bundle size.** Drizzle has no query-engine binary and a much smaller
  bundle than Prisma; Prisma's engine binary adds meaningful cold-start latency on
  serverless — relevant if the eventual deploy target is Vercel functions (undecided per
  `CLAUDE.md`).
- **SQL control.** The scrape job does batch upserts with a per-job dedup key
  (`unique(job_id, place_id)`) — Drizzle's query builder stays close to SQL, making an
  `ON CONFLICT DO NOTHING`/`DO UPDATE` upsert straightforward to express and reason about.

**Honesty check:** Drizzle is pre-1.0 (0.45.x as of this research) and has had breaking
changes between minor versions historically. Pin the version and read the changelog before
bumping — this is a real tradeoff against Prisma's more conservative semver, not a reason
to avoid Drizzle for this project.

**Confidence: MEDIUM** — web-search consensus across multiple 2026-dated comparison
articles, cross-checked against Drizzle's own official Neon integration docs (which are
authoritative for the integration claim, though the general "Drizzle vs Prisma" framing
comes from third-party blogs, not a primary source).

### Neon driver: `neon-http`, not `neon-serverless` (WebSocket/Pool) — with a caveat

This app has two distinct DB-access patterns:
- **Polling reads** — `GET /api/jobs/:id` hit every ~1s by the client. Each is a single,
  independent, non-interactive query. This is exactly the case Neon's own docs say the HTTP
  driver is fastest for (no persistent connection/pooling overhead per invocation).
- **The scrape job inside `after()`** — insert job row → loop over Places API pages →
  batch-upsert leads → update job status. Multiple sequential writes, but the locked
  design's own error-handling intent (`.claude/rules/findleads-architecture.md`: "partial
  pagination failure → keep what was fetched, mark job `partial`, don't discard") is
  explicitly a **commit-as-you-go** pattern, not one big wrapping transaction. That matters
  because `neon-http` does **not** support interactive transactions (confirmed against
  Neon's own docs and community threads) — only `db.batch()` for grouping several
  non-interactive statements. Since the design already wants incremental commits per page
  rather than an all-or-nothing transaction, `neon-http` is not just adequate here, it's the
  better fit: commit progress after each page via `db.batch()` (job update + lead upserts for
  that page), so a mid-run failure preserves everything fetched so far — which is exactly
  the `partial` status behavior already specified.

Do not reach for `neon-serverless` (WebSocket/Pool) unless a future phase needs a real
multi-statement interactive transaction (e.g., an all-or-nothing multi-table write). Never
use plain `pg.Pool` in a serverless function — connections aren't reused between
invocations and will exhaust Neon's connection limit.

**Confidence: HIGH** — driver capability/limitation confirmed against Neon's official docs
and cross-checked against a community thread describing the same `neon-http`
no-interactive-transaction limitation.

### CSV export: `csv-stringify`, not `json2csv` — and sanitize for formula injection

`json2csv` (the commonly-cited library) has been effectively abandoned: the last stable
major (`json2csv@6`) has sat at `6.0.0-alpha.2` and its maintained successor packages
(`@json2csv/node`, `@json2csv/plainjs`) haven't published since February 2024. `csv-stringify`
(part of the actively-maintained `csv` package family by Adaltas, published within the last
day as of this research) is the current standard, handles quoting/escaping correctly, and
streams naturally into a `Response` body from a route handler.

**This project ingests untrusted place names/addresses by design** (per `CLAUDE.md`'s own
security note). A field value beginning with `=`, `+`, `-`, or `@` is interpreted as a
formula by Excel/Google Sheets when the CSV is opened — a real CSV-formula-injection risk,
not a theoretical one, given the data source. `csv-stringify` does **not** sanitize this by
default; the export code must explicitly prefix any cell starting with one of those
characters (typically with a leading `'` or a space) before serializing. Flag this for
`PITFALLS.md` as a concrete implementation requirement, not just a note here.

**Confidence: HIGH** for the library recommendation (npm registry maintenance data is a
primary source). **MEDIUM** for the general "use csv-stringify" web consensus, but the
formula-injection risk itself is a well-established, independently verifiable class of
vulnerability (OWASP-documented), not dependent on any single source.

### Client polling: SWR, not TanStack Query

Both handle interval polling fine. TanStack Query's advantages — cross-component cache
invalidation, query-key-scoped granularity, complex mutation orchestration — solve problems
this app doesn't have: there is exactly **one** polling endpoint (`GET /api/jobs/:id`), one
consumer of it (the job-progress view), and no complex client-side mutation graph. SWR is
built by Vercel specifically for this Next.js-adjacent use case, has a much smaller API
surface (`useSWR` + `refreshInterval`, with the fetcher returning `null`/stopping the
interval once the job reaches a terminal status), and a sub-10KB footprint. Picking TanStack
Query here would be over-provisioning for features that won't get used — don't do it because
it's the generically-popular 2026 answer to "data fetching library."

**Confidence: MEDIUM** — based on cross-referenced 2026-dated comparison articles; both
libraries are mature and either would work, this is a scope-fit judgment call rather than a
factual claim.

### Validation: Zod (already implied)

`.claude/rules/findleads-architecture.md` already specifies "validate params (Zod)" for
`POST /api/jobs` — this research confirms Zod 4.4.3 as current and recommends extending the
same pattern to Places API response parsing at the fetch boundary and to CSV row shaping,
not just the inbound API route. `drizzle-zod` is an optional convenience layer to derive
those schemas from the Drizzle table definitions instead of hand-duplicating field lists —
not required, but removes a class of "schema drifted from DB column" bugs.

**Confidence: HIGH** for the version number (npm registry, primary source). **MEDIUM** for
the "no dedicated Next.js-route-validation wrapper library needed" judgment — several
purpose-built wrappers exist (`next-zod-route`, `next-zod-api`) but for a handful of routes
in a single-user app, calling `schema.safeParse()` directly inside each route handler is
simpler and has no extra dependency.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Drizzle ORM | Prisma | If the team values Prisma's more mature migration UX/ecosystem over cold-start latency, and deploy target is confirmed to be an always-on Node host (not serverless functions) where cold starts don't matter |
| `neon-http` driver | `neon-serverless` (WebSocket/Pool) | If a future phase needs a genuine multi-table interactive transaction that can't be expressed as `db.batch()` |
| `csv-stringify` | `papaparse` | If CSV *parsing* (not generation) becomes a requirement — Papa Parse is stronger there; for pure generation `csv-stringify` is the better fit |
| `swr` | `@tanstack/react-query` | If a second/third polling or mutation surface appears (e.g., real-time lead updates across multiple views) and cross-query cache coordination becomes genuinely needed |
| Raw `fetch` for Places API | `@googlemaps/places` official client | If the app later moves to running inside GCP infra with ADC already configured, or needs other Google Maps Platform services with more complex request shapes that benefit from generated types |
| Native forms + Server Actions | `react-hook-form` | Once a form needs dynamic field arrays, complex cross-field validation, or heavy re-render-sensitive interactivity — none of which v1's 2-3-field forms need |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `@googlemaps/places` (official Node client) | Heavy (`google-gax` + ADC auth model), awkward outside GCP infra, unnecessary for a handful of REST calls | Native `fetch` against the Places API (New) REST endpoints with `X-Goog-Api-Key` |
| `json2csv` / `@json2csv/*` | Stable major stuck in alpha since inception; scoped successor packages unmaintained since Feb 2024 | `csv-stringify` (actively maintained, part of the `csv` package family) |
| Plain `pg.Pool` (`node-postgres`) in a Next.js serverless function | Connections aren't reused between invocations; exhausts Neon's connection limit under load | `@neondatabase/serverless` (`neon-http` for one-shot queries) |
| BullMQ / pg-boss / Redis-backed queue | Already excluded by the locked job-execution decision (`PROJECT.md` Key Decisions) — real infra this MVP doesn't need for two-market validation volume | DB-backed job row + Next.js `after()` + polling (locked design) |
| `react-hook-form` (in v1) | Adds a dependency and API surface for forms that don't need it yet | Native `<form>` + Server Action + Zod `safeParse` |
| Unsanitized CSV cell values | Untrusted place-name/address data can carry a leading `=`/`+`/`-`/`@` — opens formula injection in Excel/Sheets on export | Explicitly prefix/escape any cell starting with one of those characters before writing with `csv-stringify` |

## Stack Patterns by Variant

**If the deploy target ends up being Vercel serverless functions (Node runtime):**
- `after()` execution is capped by the function's `maxDuration` (plan-dependent — commonly
  10-60s on lower tiers, higher on paid plans). A multi-page Places Text Search scrape
  (each page requiring a short delay before the `next_page_token` becomes valid) can run
  10-60s+ for a single job. Set `export const maxDuration = <N>` explicitly on the job route,
  and/or cap the max pages fetched per job so a run can't silently exceed the platform limit
  mid-scrape. This doesn't reopen the no-queue decision — it's a bound to design around
  within it. Flag as an open item until the deploy target is chosen (per `CLAUDE.md`, no
  deploy target is locked yet).

**If the deploy target is an always-on Node host (VM, Railway, Docker, etc.):**
- `after()` runs to completion without a platform-imposed cap — the `maxDuration` concern
  above doesn't apply. Simpler; no page-count ceiling is strictly required, though one is
  still good practice for API quota/cost control.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `drizzle-orm@0.45.2` | `@neondatabase/serverless@1.1.0`, `drizzle-kit@0.31.10` | Verified pairing per Drizzle's own official Neon getting-started guide |
| `drizzle-zod@0.8.3` | `zod@^4.0.0` (and `^3.25.0`), `drizzle-orm@>=0.36.0` | Confirmed via npm registry `peerDependencies` — compatible with the recommended `zod@4.4.3` and `drizzle-orm@0.45.2` |
| `next@16.2.10` | Node runtime route handlers, `after()` | `after()` has been stable since Next.js 14.2+; unaffected by the 16.x jump |

## Sources

- `developers.google.com/maps/documentation/places/web-service/get-api-key` — REST API-key
  auth header (`X-Goog-Api-Key`) — HIGH (official docs)
- `npmjs.com` registry (`npm view`, queried directly) — package versions and dependency
  trees for `@googlemaps/places`, `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`,
  `zod`, `swr`, `@tanstack/react-query`, `csv-stringify`, `json2csv`, `@json2csv/node`,
  `drizzle-zod` — HIGH (primary registry, queried same day as this research)
- `nextjs.org/docs/app/api-reference/functions/after` — `after()` semantics and where it can
  run — HIGH (official docs)
- `orm.drizzle.team/docs/get-started/neon-new`, `neon.com/docs/guides/drizzle`,
  `neon.com/docs/serverless/serverless-driver` — Neon+Drizzle setup, HTTP vs WebSocket driver
  tradeoffs, no-interactive-transactions limitation — HIGH (official docs, both vendors)
- Cross-referenced 2026-dated comparison articles (Drizzle vs Prisma, SWR vs TanStack Query,
  CSV libraries) via web search — MEDIUM (third-party consensus, not primary source, used
  only for judgment calls where official docs don't take a position)
- OWASP CSV/formula-injection risk class — general web-security knowledge, independently
  verifiable, not dependent on a single source

---
*Stack research for: findleads (Google Places API lead-gen scraper + CRM)*
*Researched: 2026-07-02*
