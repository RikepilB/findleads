# Decisions (ADR log)

> One entry per significant decision. Newest on top. Append-only.

### 2026-07-01 — No auth/billing/outreach builder in MVP
- **Context:** Scoping MVP tight for fast validation.
- **Decision:** Single user, no login, no billing, no outreach/email builder.
- **Alternatives:** Full multi-tenant SaaS shell from day one — rejected, adds weeks with
  no validated demand yet.
- **Consequences:** Every later feature (teams, billing) is additive, not a rewrite, as long
  as the DB schema doesn't hardcode single-user assumptions carelessly.

### 2026-07-01 — Job execution: DB-backed row + polling via `after()`, no queue
- **Context:** Scrape jobs run for an unknown-but-likely-short duration against Places API
  pagination; need an async execution model.
- **Decision:** A job row in Postgres is the source of truth; Next.js `after()` runs the
  scrape post-response; client polls `GET /api/jobs/:id` (~1s).
- **Alternatives:** BullMQ/pg-boss/Redis-backed queue — rejected as premature infra for a
  two-market MVP validation.
- **Consequences:** Simpler ops (no extra infra), but doesn't survive a serverless function
  timeout if scrapes get long — revisit if that becomes real.

### 2026-07-01 — MVP data source: Google Places API only
- **Context:** RawLeads-style lead scraper needs a first data source to validate against
  Toronto + Lima.
- **Decision:** Official Google Places API only for MVP. No scraping, no headless browser.
- **Alternatives:** Instagram scraping, general web search, LinkedIn — all deferred to
  phase 2; rejected for MVP due to added complexity/fragility with no validated need yet.
- **Consequences:** No email field in MVP (Places API doesn't return it) — email enrichment
  becomes its own phase-2 decision, not bundled into MVP scope.

## Template
```
### <YYYY-MM-DD> — <decision title>
- **Context:** why this came up
- **Decision:** what we chose
- **Alternatives:** what we rejected and why
- **Consequences:** what this commits us to
```
