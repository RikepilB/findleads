# Decisions (ADR log)

> One entry per significant decision. Newest on top. Append-only.

### 2026-07-02 — Places "No Caching" ToS risk knowingly accepted
- **Context:** Places API ToS forbids durably caching Places content; the CRM pivot needs
  lead data stored in Postgres to be useful at all.
- **Decision:** Store lead content durably anyway, for this single-user personal tool.
- **Alternatives:** Ephemeral display-only results — rejected, kills the CRM value entirely.
- **Consequences:** Must be revisited before any public or paid launch. Do not "fix" this
  silently and do not deploy publicly without raising it.

### 2026-07-02 — `businesses` (durable CRM state) split from `leads` (per-job snapshot)
- **Context:** Re-running a scrape for the same area must never wipe CRM work.
- **Decision:** Two tables: `businesses` keyed by `place_id` holds notes/contacted/first-seen
  (upsert never touches those columns — requirement DATA-01); `leads` is an immutable per-job
  snapshot with `unique(job_id, place_id)` dedup.
- **Alternatives:** One merged table — rejected; a re-scrape upsert would clobber CRM state.
- **Consequences:** Per-job dedup only; global cross-job dedup is an explicit non-goal.

### 2026-07-02 — Checkpointed worker + watchdog instead of a queue
- **Context:** Vercel Hobby's 300s ceiling can kill a scrape mid-run; no queue infra wanted.
- **Decision:** `runScrapeJob` checkpoints progress (cursor + count) to the job row after
  every page; `GET /api/jobs/:id` atomically claims `partial` jobs for continuation and a
  watchdog flags stale jobs `error` after ~8.3min without progress.
- **Alternatives:** BullMQ/pg-boss — rejected as premature infra (standing MVP decision).
- **Consequences:** Single-UPDATE atomicity of `claimPartialJob`/`flagStaleJob` IS the
  concurrency model — never split them into read-then-write.

### 2026-07-02 — CRM scope pivot: web-presence filter + lightweight CRM
- **Context:** Raw category scraping alone wasn't the product; the value is finding
  businesses with **no website** (tier-1 leads) and working them.
- **Decision:** Flag tier-1 leads with the exact copy "no website found on Google" (a
  signal, not a fact), add notes/contacted/CSV export on a durable `/leads` page.
- **Alternatives:** Email enrichment, Instagram/LinkedIn sources — deferred to phase 2+.
- **Consequences:** Google attribution ("Google Maps", ≥12px, not recolored) required in the
  UI; tier copy is a locked string.

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
