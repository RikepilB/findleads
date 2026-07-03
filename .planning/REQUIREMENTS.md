# Requirements: findleads

**Defined:** 2026-07-02
**Core Value:** Surface real businesses with no website, with enough contact info and lead-tracking that Richard can actually reach out and close them.

## v1 Requirements

Requirements for initial release. Each maps to a roadmap phase.

### Scrape (Places API integration)

- [x] **SCRAPE-01**: User can create a scrape job by category + free-text location, validated against Toronto and Lima
- [x] **SCRAPE-02**: Every scrape request field-masks `websiteUri` and `business_status` on the same call (no separate Place Details lookup per result)
- [x] **SCRAPE-03**: Scrape requests wire `languageCode`/`regionCode` per target market so Lima isn't silently under-served by an English/Canada default
- [x] **SCRAPE-04**: Scrape excludes closed businesses using the `business_status` field (`CLOSED_PERMANENTLY`/`CLOSED_TEMPORARILY`)
- [x] **SCRAPE-05**: Each lead is classified tier-1 ("no website found on Google") when `websiteUri` is absent — UI/export copy states it as a signal, not a verified fact
- [x] **SCRAPE-06**: Text Search pagination retries `nextPageToken` with backoff (~2-5s) instead of assuming immediate availability
- [ ] **SCRAPE-07**: UI surfaces explicit messaging when the 60-result Text Search cap is hit ("60+ results found, showing first 60 — refine your search")

### Job Execution

- [x] **JOB-01**: `POST /api/jobs` validates params (Zod), inserts a `pending` job row, and returns `{ jobId }` immediately while the scrape runs via Next.js `after()`
- [x] **JOB-02**: The scrape worker is checkpointed/resumable — one search call is one unit of work, progress (`leads_found`, cursor) persists after every unit
- [x] **JOB-03**: The worker stops cleanly near a safety-window threshold (~250s, under Vercel Hobby's 300s ceiling) and marks the job `partial` with a saved cursor
- [ ] **JOB-04**: `GET /api/jobs/:id` (polled ~1s) triggers continuation via `after()` when status is `partial`, guarded by an atomic claim (`UPDATE ... WHERE status='partial'`) to prevent duplicate continuations
- [ ] **JOB-05**: Stale `pending`/`running` jobs (no update past a watchdog threshold) auto-flip to `error` with a human-readable reason on read
- [ ] **JOB-06**: A zero-result job is a valid, non-error outcome, distinguished from a real failure in the UI
- [x] **JOB-07**: Leads are deduped per job via `unique(job_id, place_id)` — no cross-job global dedup in v1

### Data Model

- [x] **DATA-01**: A `businesses` table keyed on `place_id` holds durable CRM state (notes, contacted, first_seen_at, last_seen_at) and is upserted on every sighting
- [x] **DATA-02**: A `leads` table stays a per-job scrape snapshot/audit row (`unique(job_id, place_id)`), joined to `businesses` for CRM display and CSV export
- [x] **DATA-03**: Places content (name/address/phone/rating/website) is stored durably per the accepted ToS-risk decision — documented in PROJECT.md as a known tradeoff to revisit before any public/paid launch

### CRM

- [ ] **CRM-01**: Leads list view reads from `businesses`, showing tier-1 status, contacted flag, and notes
- [ ] **CRM-02**: User can add/edit freeform notes per business
- [ ] **CRM-03**: User can toggle contacted/not-contacted status per business
- [ ] **CRM-04**: Notes/contacted-status changes are timestamped (`updated_at`) so staleness is visible
- [ ] **CRM-05**: Job history/run list view shows job status, target location/category, leads found, created_at

### Export

- [ ] **EXPORT-01**: CSV export of a completed job's leads, joined to current `businesses` CRM state
- [ ] **EXPORT-02**: CSV cells starting with `=+-@` are sanitized against formula injection

### Security

- [x] **SEC-01**: Places API key is stored server-side only (never `NEXT_PUBLIC_*`); all Places calls are proxied through Node API routes
- [x] **SEC-02**: The Google Cloud API key is restricted to the Places API only in Cloud Console
- [ ] **SEC-03**: Google Maps attribution is shown on any UI displaying Places content, including the map-less leads table

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Web Presence (deeper tiers)

- **PRESENCE-01**: Tier-2 web-presence detection (social-profile-as-website)
- **PRESENCE-02**: Tier-3 web-presence detection (fetch + analyze existing site for staleness/dead links)

### Lead Intelligence

- **INTEL-01**: Opportunity/conversion-likelihood score (website-absent + review count + rating + business_status)
- **INTEL-02**: Map/geo view of leads in a city

### Sourcing

- **SOURCE-01**: Additional scrape sources — general Google web search, Reddit, Instagram, TikTok, LinkedIn
- **SOURCE-02**: Cross-job global dedup with fuzzy matching
- **SOURCE-03**: Re-scrape/refresh path to detect a tier-1 lead that has since gotten a website

### Outreach

- **OUTREACH-01**: Outreach/email builder (block-based composer, SMTP/Gmail send)
- **OUTREACH-02**: CASL/PIPEDA/Peru-Ley-29733-aware consent tracking (must ship together with OUTREACH-01, not separately)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auth, billing, multi-tenant/teams | Single user (Richard); no validated demand for more yet |
| Live "radar" sweep visualization | Visual polish, not core to finding/qualifying leads |
| ToS-safe re-architecture (place_id-only + re-fetch on view) | Costs an Enterprise-tier Place Details call per lead per page view; Richard explicitly accepted the storage-ToS risk instead for this personal, pre-revenue tool |
| Email enrichment | Places API returns no email field; needs tier-2/3 web-presence data first |
| External job queue (BullMQ/pg-boss/Redis) | Checkpointed `after()` + polling covers MVP job volume; revisit only if job volume/duration outgrows it |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1: Data Foundation & Security | Complete |
| DATA-02 | Phase 1: Data Foundation & Security | Complete |
| DATA-03 | Phase 1: Data Foundation & Security | Complete |
| SEC-01 | Phase 1: Data Foundation & Security | Complete |
| SEC-02 | Phase 1: Data Foundation & Security | Complete |
| SCRAPE-02 | Phase 2: Places API Scrape Client | Complete |
| SCRAPE-03 | Phase 2: Places API Scrape Client | Complete |
| SCRAPE-04 | Phase 2: Places API Scrape Client | Complete |
| SCRAPE-05 | Phase 2: Places API Scrape Client | Complete |
| SCRAPE-06 | Phase 2: Places API Scrape Client | Complete |
| SCRAPE-01 | Phase 3: Job Creation & Checkpointed Worker | Complete |
| JOB-01 | Phase 3: Job Creation & Checkpointed Worker | Complete |
| JOB-02 | Phase 3: Job Creation & Checkpointed Worker | Complete |
| JOB-03 | Phase 3: Job Creation & Checkpointed Worker | Complete |
| JOB-07 | Phase 3: Job Creation & Checkpointed Worker | Complete |
| JOB-04 | Phase 4: Job Monitoring, Resumability & Export | Pending |
| JOB-05 | Phase 4: Job Monitoring, Resumability & Export | Pending |
| JOB-06 | Phase 4: Job Monitoring, Resumability & Export | Pending |
| EXPORT-01 | Phase 4: Job Monitoring, Resumability & Export | Pending |
| EXPORT-02 | Phase 4: Job Monitoring, Resumability & Export | Pending |
| SCRAPE-07 | Phase 5: CRM Leads Dashboard | Pending |
| CRM-01 | Phase 5: CRM Leads Dashboard | Pending |
| CRM-02 | Phase 5: CRM Leads Dashboard | Pending |
| CRM-03 | Phase 5: CRM Leads Dashboard | Pending |
| CRM-04 | Phase 5: CRM Leads Dashboard | Pending |
| CRM-05 | Phase 5: CRM Leads Dashboard | Pending |
| SEC-03 | Phase 5: CRM Leads Dashboard | Pending |

**Coverage:**

- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

**Note:** SCRAPE-01 ("user can create a scrape job by category + free-text location") is
satisfied at the API layer in Phase 3 (`POST /api/jobs`) — REQUIREMENTS.md has no separate
job-creation-*UI* requirement, so any job-creation form is incidental Phase 5 scope rather than
a tracked requirement of its own.

---
*Requirements defined: 2026-07-02*
*Last updated: 2026-07-02 — traceability remapped from draft 3-phase split to the final 5-phase ROADMAP.md structure (Data Foundation → Places Client → Job Creation/Worker → Job Monitoring/Export → CRM UI)*
