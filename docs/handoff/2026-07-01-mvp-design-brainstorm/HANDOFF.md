# Session 2026-07-01 — MVP design brainstorm (migrated from PROYECTOS/handoff.md)

> This session actually ran in the `PROYECTOS/` root working directory before this repo had
> its own handoff tree. Migrating the record here since it documents real, locked-in design
> decisions for findleads specifically, not generic scratch notes.

## Goal
Build "findleads" — clone of RawLeads (business lead scraper) targeting Toronto + Lima, Peru.
Brainstorming (`superpowers:brainstorming` skill) for MVP spec before any code.

## What was done
- Scaffolded `findleads/` via project-scaffold (TypeScript): README, CLAUDE.md, AGENTS.md,
  opencode.json, .mcp.json, docs/, tests/, .github/, `.claude/{agents,rules,commands,hooks,
  settings}` — all stub/template content at that point, not yet customized.
- Walked through architecture/data-model brainstorming with the user; several decisions were
  locked in (below) before the session ended without writing a permanent spec file.

## Decisions locked in
- MVP scope: Google Maps source ONLY (Instagram/web search/LinkedIn deferred to phase 2).
- Data source: official Google Places API (not scraping) — no email in MVP (Places API doesn't
  return email; email enrichment is phase 2).
- Stack: Next.js full-stack (App Router), Node runtime API routes.
- DB: Neon Postgres (Neon MCP tools available in this environment).
- Target locations: Toronto + Lima (initial validation targets; location field likely
  free-text, not hard-restricted).
- Job execution: DB-backed job row + client polling (~1s), using Next.js `after()` to run the
  scrape post-response — no separate queue infra.
- No auth/billing/outreach builder in MVP — single user, no login. Deferred to later specs.
- Dedup: `unique(job_id, place_id)` within a job; no cross-job global dedup for MVP.

## Files changed
- `findleads/` created and scaffolded (see above) — all still stub content as of this session.

## Failed attempts
None — no blockers, normal brainstorming Q&A flow.

## Next steps
1. Get user approval on the architecture/data-model section (was just presented when this
   session ended).
2. Present remaining design sections: data flow/API routes (`POST /api/jobs`,
   `GET /api/jobs/:id` polling, CSV export), error handling (Places API failures, partial
   pagination failure, zero results), testing (unit: dedup/CSV/mapping; integration: job
   creation + mocked Places API; light E2E).
3. Write the full spec to `docs/specs/2026-07-01-findleads-mvp-design.md`, commit.
4. Spec self-review (placeholders/contradictions/ambiguity/scope).
5. User reviews the written spec file.
6. Invoke `writing-plans` skill for an implementation plan — don't start coding before that.
