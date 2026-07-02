# Architecture

> System patterns, module boundaries, and trade-offs. Keep this authoritative once code
> exists; until then it mirrors `.claude/rules/findleads-architecture.md` (the source of
> truth for the locked MVP design — update both together if either changes).

## Overview

Single Next.js full-stack deployable (App Router, Node runtime API routes) backed by one
Neon Postgres database. No microservices, no external queue — deliberately minimal for a
two-market (Toronto + Lima) MVP validation.

## Modules & boundaries

Not yet built. Planned: a thin API layer (`src/app/api/jobs/`) delegating to a scrape-runner
service, a Places API client module, and a jobs/leads data-access layer over Neon Postgres.
See `.claude/rules/findleads-architecture.md` for the full breakdown once naming is
finalized in the spec.

## Data flow

`POST /api/jobs` → insert job row → `after()` runs the scrape post-response → client polls
`GET /api/jobs/:id` → CSV export reads the completed job's leads. Full detail:
`.claude/rules/findleads-architecture.md`.

## Trade-offs & constraints

- DB-backed polling instead of a real queue — right-sized for MVP volume, not built for
  scale. Revisit only if job volume/duration genuinely outgrows it.
- Google Places API only — no scraping/headless browsing, so no ToS risk, but no email data
  either (deferred to a phase-2 enrichment decision).
- Per-job dedup only, no cross-job global dedup — accepted trade-off for MVP simplicity.
