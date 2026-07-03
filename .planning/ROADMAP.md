# Roadmap: findleads

## Overview

findleads goes from zero to a working personal sales-pipeline tool in five phases. First, the
data foundation and API key security model get locked down (Phase 1), since every later phase
writes through the `businesses`/`leads` schema and calls the Places API. Next, the Places API
client itself is built and validated for correctness — field masking, locale handling, tier-1
classification, pagination (Phase 2). With a trustworthy client in hand, the job system is
built in two steps: first the creation-and-checkpointed-worker path that makes a scrape safe to
run within Vercel's time ceiling (Phase 3), then the polling/resumability/export path that lets
Richard actually watch a job to completion and pull results out (Phase 4). Finally, the CRM UI
ties it together — a leads list, notes, contacted-status tracking, and job history Richard can
actually use to run outreach (Phase 5). Phases 1-2 are necessarily backend-only groundwork (no
scrape can happen without them); Phase 5 is where the product becomes visible and usable
end-to-end.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Foundation & Security** - Durable `businesses`/`leads` schema and secured Places API key handling (completed 2026-07-03)
- [x] **Phase 2: Places API Scrape Client** - Field-masked, locale-aware search with tier-1 classification and closed-business filtering (completed 2026-07-03)
- [ ] **Phase 3: Job Creation & Checkpointed Worker** - Submit a scrape request; a resumable worker runs it safely within the platform time limit
- [ ] **Phase 4: Job Monitoring, Resumability & Export** - Poll jobs to completion (auto-resume, honest error/zero-result states) and export CSV
- [ ] **Phase 5: CRM Leads Dashboard** - Review leads, manage notes/contacted status, and view job history with attribution

## Phase Details

### Phase 1: Data Foundation & Security

**Goal**: The database schema and API key security model exist so every later scrape, job, and CRM feature has durable, secure storage to build on.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, SEC-01, SEC-02
**Success Criteria** (what must be TRUE):

  1. A `businesses` row is created on first sighting of a `place_id` and upserted (not replaced) on every later sighting, without resetting existing `notes`/`contacted` state
  2. A `leads` row is written per job scrape event with `unique(job_id, place_id)`, kept separate from `businesses` so CRM state and per-job snapshots never collide
  3. Place content (name/address/phone/rating/website) persists durably in Postgres and survives across job runs, per the accepted ToS-risk decision in PROJECT.md
  4. The Places API key never appears in any client-side bundle or `NEXT_PUBLIC_*` variable — all Places calls are proxied through server-side Node API routes
  5. The Google Cloud API key is restricted to the Places API only in Cloud Console

**Plans**: 5 plans
Plans:

- [x] 01-01-PLAN.md — Bootstrap Next.js scaffold + pnpm/lint/typecheck/test script surface (package-legitimacy checkpoint for server-only, vitest)
- [x] 01-02-PLAN.md — Resolve Neon DATABASE_URL/TEST_DATABASE_URL + lib/env.ts (SEC-01) + Google Cloud API key restriction (SEC-02)
- [x] 01-03-PLAN.md — jobs/leads/businesses Drizzle schema, Neon client, first migration applied to dev + test DBs (DATA-03)
- [x] 01-04-PLAN.md — Data Access Layer: upsertBusiness (CRM-preserving), insertLeadSnapshot, jobs CRUD (DATA-01, DATA-02)
- [x] 01-05-PLAN.md — Integration tests proving DATA-01/DATA-02/DATA-03 against a real Neon database

### Phase 2: Places API Scrape Client

**Goal**: A field-masked, locale-aware Places API client reliably fetches and classifies business data for any category+location query.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SCRAPE-02, SCRAPE-03, SCRAPE-04, SCRAPE-05, SCRAPE-06
**Success Criteria** (what must be TRUE):

  1. A search for a category+location (validated against Toronto and Lima) returns field-masked results including `websiteUri` and `business_status` in a single call, with no separate Place Details lookup per result
  2. Lima queries use Peru-appropriate `languageCode`/`regionCode` instead of silently defaulting to English/Canada
  3. Businesses with `business_status` of `CLOSED_PERMANENTLY` or `CLOSED_TEMPORARILY` are excluded from results
  4. Leads missing `websiteUri` are classified tier-1 with copy stating "no website found on Google" — framed as a signal, not a verified fact
  5. Text Search pagination retries `nextPageToken` with backoff (~2-5s) instead of assuming immediate availability

**Plans**: 4 plans
Plans:

- [x] 02-01-PLAN.md — Places API response schema (Zod), test fixtures, mockFetch helper, vitest.config.ts DATABASE_URL fallback fix
- [x] 02-02-PLAN.md — Locale inference (SCRAPE-03) + nextPageToken retry/backoff (SCRAPE-06)
- [x] 02-03-PLAN.md — searchTextPlaces() field-masked Text Search client (SCRAPE-02)
- [x] 02-04-PLAN.md — mapPlaceToLead(): closed-business filter (SCRAPE-04) + tier-1 classification (SCRAPE-05)

### Phase 3: Job Creation & Checkpointed Worker

**Goal**: Richard can submit a category+location scrape request and the system runs it as a safe, resumable background job.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SCRAPE-01, JOB-01, JOB-02, JOB-03, JOB-07
**Success Criteria** (what must be TRUE):

  1. Submitting a category+location scrape request creates a `pending` job row and returns a `jobId` immediately, before the scrape itself finishes
  2. The worker processes one Places search call as one unit of work, persisting progress (`leads_found`, cursor) after every unit
  3. A long-running job stops cleanly near the ~250s safety-window threshold and marks itself `partial` with a saved, resumable cursor instead of silently dying past Vercel's ceiling
  4. Leads collected within a single job are deduped via `unique(job_id, place_id)`

**Plans**: 3 plans
Plans:

- [ ] 03-01-PLAN.md — checkpoint.ts/buildTextQuery.ts + additive jobs schema (leads_found/cursor/error_reason) + updateJobProgress (JOB-02, JOB-03 substrate)
- [ ] 03-02-PLAN.md — runScrapeJob checkpointed worker loop (JOB-02, JOB-03, JOB-07)
- [ ] 03-03-PLAN.md — POST /api/jobs route + real-DB integration proof (SCRAPE-01, JOB-01, JOB-07)

### Phase 4: Job Monitoring, Resumability & Export

**Goal**: Richard can watch a job through to completion — including automatic resumption and honest failure/zero-result states — and pull finished results out as CSV.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: JOB-04, JOB-05, JOB-06, EXPORT-01, EXPORT-02
**Success Criteria** (what must be TRUE):

  1. Polling a `partial` job's status endpoint triggers continuation of the scrape, guarded by an atomic claim so two concurrent polls can't double-continue the same job
  2. A `pending`/`running` job that goes stale past a watchdog threshold auto-flips to `error` with a human-readable reason on the next read
  3. A job that legitimately finds zero leads is surfaced as a valid completed outcome, distinguished from a real failure
  4. A completed job's leads can be exported to CSV, joined to current `businesses` CRM state
  5. CSV cells starting with `=+-@` are sanitized so the export can't trigger formula injection when opened in Excel/Sheets

**Plans**: TBD

### Phase 5: CRM Leads Dashboard

**Goal**: Richard can review, manage, and act on scraped leads through a leads list, notes, contacted-status tracking, and job history — with proper Google attribution.
**Mode:** mvp
**Depends on**: Phase 1, Phase 4
**Requirements**: SCRAPE-07, CRM-01, CRM-02, CRM-03, CRM-04, CRM-05, SEC-03
**Success Criteria** (what must be TRUE):

  1. Richard can view a leads list backed by `businesses` data, showing tier-1 status, contacted flag, and notes
  2. Richard can add/edit freeform notes and toggle contacted/not-contacted status on a business, with each change timestamped (`updated_at`) so staleness is visible
  3. Richard can view job history showing status, target location/category, leads found, and `created_at` — including a "60+ results found, showing first 60 — refine your search" message when a job hit the Text Search cap
  4. Any UI displaying Places content, including the map-less leads table, shows Google Maps attribution

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation & Security | 5/5 | Complete    | 2026-07-03 |
| 2. Places API Scrape Client | 4/4 | Complete    | 2026-07-03 |
| 3. Job Creation & Checkpointed Worker | 0/3 | Not started | - |
| 4. Job Monitoring, Resumability & Export | 0/TBD | Not started | - |
| 5. CRM Leads Dashboard | 0/TBD | Not started | - |

---
*Roadmap created: 2026-07-02*
*Granularity: standard (5 phases) | Mode: mvp*
