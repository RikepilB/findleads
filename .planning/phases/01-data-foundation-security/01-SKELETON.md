# Walking Skeleton — findleads

**Phase:** 1
**Generated:** 2026-07-02

## Capability Proven End-to-End

A Next.js app boots (dev/build/lint/typecheck/test all green) on top of a real Neon Postgres
database with the `jobs`/`leads`/`businesses` schema migrated onto it, and a real insert-then-read
round-trip against that database succeeds through the Drizzle Data Access Layer — proving the
full stack (framework → server-only DAL → Neon Postgres) is wired correctly before any scrape or
UI code exists.

**Why no UI/user-facing slice:** Phase 1 has zero UI requirements in REQUIREMENTS.md (DATA-01,
DATA-02, DATA-03, SEC-01, SEC-02 are all schema/security, not UI), and ROADMAP.md's own Overview
states "Phases 1-2 are necessarily backend-only groundwork (no scrape can happen without them)."
STATE.md's roadmap decision log confirms this was a deliberate choice: "MVP mode's 'vertical
slice' framing applied where practical, not forced onto phases that structurally can't be
user-visible yet." Phase 5 (CRM Leads Dashboard) is the first fully user-facing UI phase. This
is a documented exception to the generic Walking Skeleton template's "one real UI interaction"
bullet, not a silent omission.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router), TypeScript, Node runtime | Locked in PROJECT.md constraints; App Router is the only mode used going forward |
| Package manager | pnpm | Locked in PROJECT.md constraints — never npm/yarn |
| Data layer | Neon Postgres + Drizzle ORM (`drizzle-orm` 0.45.2 / `drizzle-kit` 0.31.10) via `@neondatabase/serverless` 1.1.0 (`neon-http` driver) | Research: no query-engine binary, near-instant cold starts, first-class Neon pairing; `neon-http` fits both ~1s polling reads (later phases) and commit-as-you-go worker writes |
| Migrations | `drizzle-kit generate` + `migrate` (never `push`) from the first migration | Repo's own `coding-rules.md`: "Additive migrations. Never edit/delete a shipped migration" — only enforceable if migration files exist as history from day one |
| Schema shape | Identity/sighting split — `businesses` (keyed `place_id`, holds CRM state: `notes`/`contacted`/`first_seen_at`/`last_seen_at`) separate from `leads` (per-job snapshot, `unique(job_id, place_id)`), `jobs` as the parent row | Research (ARCHITECTURE.md): CRM fields living only on `leads` silently reset "contacted" on re-scrape — defeats the CRM's purpose. `jobs.id` is `uuid`, not `serial`, because it's exposed unauthenticated in a polled URL in Phase 3+ |
| Secret handling | `lib/env.ts` — sole `process.env` reader, `zod`-validated, `import 'server-only'`, throws at import time | Next.js's own Data Access Layer / `data-security` guide pattern; the concrete SEC-01 enforcement mechanism |
| Auth | None (single user, no login, no billing) | Locked in PROJECT.md — no validated demand for multi-user yet |
| Deployment target | Not yet locked (Vercel Hobby assumed as default, ~250s worker safety window) — Phase 1 proves the stack via local `pnpm dev`/`pnpm build` + a real Neon database, not a live deploy | PROJECT.md: "Default deploy target: Vercel Hobby... (revisitable)"; deploy-target validation is explicitly deferred to Phase 3/4 per project research |
| Directory layout | `lib/env.ts`, `lib/db/{client,schema,jobs,leads,businesses}.ts`, `tests/{unit,integration,e2e}/` (existing scaffold convention preserved) | Matches `.planning/research/ARCHITECTURE.md`'s recommended project structure; `tests/` layout was already scaffolded by `project-scaffold` before this GSD project started — Phase 1 fills it in rather than inventing a new layout |
| Test framework | `vitest` 4.1.9 + `vite-tsconfig-paths` 6.1.1 | Flagged `[ASSUMED]`/Wave-0 gap in RESEARCH.md; verified current via npm registry this session. Standard, fast, ESM-native choice for a Next.js/TS project with no existing test-framework precedent to match |
| Integration-test DB | Dedicated Neon project/branch, resolved via Neon MCP tools, distinct `TEST_DATABASE_URL` injected only into the Vitest process | Resolves RESEARCH.md's open question #2 (previously undecided) — keeps `neon-http` as the driver for both dev and test, matching production behavior exactly |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js App Router, pnpm, ESLint, `tsc --noEmit` typecheck, `vitest` test runner) — Plan 01-01
- [ ] Routing — no real route exists yet; Phase 3 adds the first API route (`POST /api/jobs`). Not required for this phase's Walking Skeleton per the UI/route exclusion above.
- [x] Database — real Neon Postgres project, schema migrated, real insert-then-read round-trip proven — Plans 01-02, 01-03, 01-05
- [ ] UI — none in Phase 1 by design (see Capability section above); Phase 5 is the first UI phase.
- [x] "Deployment" — documented local full-stack run command (`pnpm dev` / `pnpm build` / `pnpm test -- --run` / `pnpm lint` / `pnpm typecheck`, matching `.github/workflows/ci.yml`'s `lint → typecheck → test → build` sequence exactly) — Plan 01-01. No live deploy target is locked yet (see Architectural Decisions).

## Out of Scope (Deferred to Later Slices)

- Any Next.js route handler or Server Action (`POST /api/jobs`, CRM Server Actions) — Phase 3 (jobs) and Phase 5 (CRM UI).
- The Places API client itself (`lib/places/*`) — Phase 2.
- The checkpointed scrape worker (`lib/jobs/runScrapeJob.ts`) — Phase 3.
- Any UI component, page, or route — Phase 5 is the first UI-bearing phase.
- `jobs.leads_found` / `jobs.cursor` / `jobs.error_reason` columns — additive migration in Phase 3 once the checkpointed worker needs them (explicitly noted in RESEARCH.md Code Example 3).
- CSV export / formula-injection sanitization — Phase 4, reuses this phase's schema unchanged.
- A live deploy (Vercel or otherwise) — deploy target isn't locked yet (PROJECT.md); Phase 1 proves the stack locally + against a real remote Neon database, not via a live app deployment.

## Subsequent Slice Plan

- Phase 2: Field-masked, locale-aware Places API client (Text Search + pagination retry) — no UI, still backend groundwork.
- Phase 3: `POST /api/jobs` creates a real job row and runs a checkpointed worker against this phase's schema — first end-to-end scrape capability.
- Phase 4: Poll-triggered resumability, stale-job watchdog, CSV export — Richard can watch a job to completion and pull results out.
- Phase 5: CRM Leads Dashboard — first user-facing UI slice, reads/writes the `businesses` table this phase created.
