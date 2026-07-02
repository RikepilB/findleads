# Project Research Summary

**Project:** findleads
**Domain:** Lead-generation scraper (Google Places API) + web-presence filtering + lightweight CRM
**Researched:** 2026-07-02
**Confidence:** MEDIUM-HIGH

## Executive Summary

findleads is a single-user, two-market (Toronto + Lima) tool: scrape Google Places API for businesses with no website, then track outreach via a lightweight CRM (notes, contacted status). Experts build this class of product on exactly the locked stack — Next.js App Router + Neon Postgres + a DB-row job model — but two structural refinements are required to make the locked design actually work: (1) the scrape worker must be a checkpointed, resumable loop, not a single unbroken await chain inside after(), because Vercel Hobby's non-configurable 300s ceiling combined with Places API pagination/token-activation delays makes a naive implementation silently hang; and (2) CRM state (notes, contacted) must live on an identity table (businesses, keyed on place_id) separate from the per-job leads snapshot rows, or re-running a scrape resets "contacted" status and defeats the CRM's purpose. Both refinements are additive to the already-locked schema/architecture, not redesigns, and both are already reflected in PROJECT.md's Key Decisions.

The recommended supporting stack is Drizzle ORM + @neondatabase/serverless (neon-http driver) + Zod + csv-stringify + SWR, with raw fetch against the Places API (New) REST endpoints rather than Google's official Node client — each choice driven by fit with a serverless-adjacent, single-user, low-complexity app rather than generic popularity. Feature-wise, the locked v1 scope (tier-1 web-presence filter, basic CRM, CSV export, job history) matches or exceeds what direct competitors ship at this stage; the one gap research surfaced — filtering out closed businesses via business_status — has already been folded into Phase 1 per the updated PROJECT.md.

The main risk requiring ongoing vigilance, not a one-time gate, is the Places API "No Caching" ToS clause: durably storing name/address/phone/rating/website in Postgres (beyond the place_id exception) is very likely a ToS breach. Richard has already made this decision explicitly — accept the risk for this personal, pre-revenue, single-user tool, revisit before any public/paid launch — so it is not an open question for the roadmap, but the roadmapper should still surface it as a "revisit before scaling/launch" checkpoint rather than letting it silently disappear. Secondary risks (tier-1 "no website" being a signal not a fact, Enterprise-tier billing on websiteUri, the 60-result Text Search cap, and Lima being under-served by English/Canada defaults) are all cheap to address if handled in the Phase 1 scrape-integration work, and expensive to retrofit if missed.

## Key Findings

### Recommended Stack

Core stack (Next.js App Router, Node runtime, Neon Postgres, pnpm) is locked from prior decisions and not reconsidered. Supporting libraries were chosen for serverless/Neon fit and minimal footprint over generic popularity.

**Core technologies:**
- drizzle-orm + drizzle-kit — Postgres ORM/migrations; chosen over Prisma for first-class Neon neon-http integration, no query-engine binary (better cold starts), and SQL-adjacent query builder that maps cleanly onto the batch-upsert dedup pattern this project needs.
- @neondatabase/serverless (neon-http variant) — Neon driver; fits both the ~1s polling reads and the worker's commit-as-you-go write pattern (no interactive transactions needed, since the design already wants per-page incremental commits, not one big transaction).
- zod (+ optional drizzle-zod) — runtime validation at every boundary: POST /api/jobs body, Places API response parsing, CSV row shaping.
- csv-stringify — CSV export; actively maintained (unlike the commonly-cited but abandoned json2csv); requires explicit formula-injection sanitization (prefix cells starting with =+-@) since the app ingests untrusted place data.
- swr — client polling of GET /api/jobs/:id; right-sized for exactly one polling endpoint (TanStack Query would be over-provisioning).
- Native fetch for Google Places API (New) REST endpoints — the official Node client (@googlemaps/places) is heavy, gRPC/ADC-oriented, and unnecessary for a handful of Text Search calls with a plain API-key header.

### Expected Features

**Must have (table stakes):**
- Category + free-text location filter (already in scope)
- Tier-1 "no website" filter as the core hook (already in scope)
- business_status filter to exclude closed businesses — cheap, same API call as website, now folded into Phase 1 per PROJECT.md
- CSV export, per-lead contacted status, freeform notes (already in scope)
- Job/run history view — falls out nearly free from the existing job-row architecture; confirm it's an explicit UI requirement, not just an API detail
- Honest zero-result/error state handling in the UI (architecture already anticipates this)

**Should have (competitive differentiators, correctly deferred to v1.x/v2):**
- Simple opportunity score (website-absent + review count + rating + business_status) — cheap once tier-1 data exists
- Web-presence tier 2 (social-profile-as-site detection)
- Two-market side-by-side workflow — already served by the free-text location field, no new feature needed

**Defer (v2+, correctly out of scope):**
- Email enrichment (Places API has no email field; structurally harder for tier-1 leads specifically)
- AI-generated outreach + CASL-aware consent tracking (must be scoped together, not separately, when eventually built)
- Map/geo view, cross-job global dedup, general B2B lead scoring, full outreach compliance workflow up front

### Architecture Approach

DB-backed job row as source of truth + Next.js after() + client polling is sound for this MVP, but only as a checkpointed, resumable worker (one search call = one unit of work, progress persisted after each unit) rather than one unbroken await chain — after() shares the triggering request's maxDuration, and on Vercel Hobby that's a hard, non-configurable 300s wall with silent-kill-on-timeout behavior. The client's existing ~1s poll becomes the continuation trigger for partial-status jobs (guarded by an atomic UPDATE ... WHERE status='partial' claim to prevent double-processing), and a stale-job watchdog flips abandoned running rows to error on read — no cron or queue needed.

**Major components:**
1. Data Access Layer (lib/db/{jobs,leads,businesses}.ts) — sole owner of all SQL; enforces the businesses-vs-leads write distinction in one place.
2. Places API client (lib/places/*) — field-masked Nearby/Text Search requests, pageToken retry/backoff, response-to-lead mapping, tier-1 filter; isolated from DB/worker concerns so it's mockable.
3. Checkpointed worker (lib/jobs/runScrapeJob.ts + checkpoint.ts) — owns elapsed-time safety checks and cursor persistence; the piece that makes the no-queue design actually safe.
4. Route Handlers (job lifecycle: create/poll/export) vs Server Actions (CRM mutations: notes, contacted) — HTTP-shaped for the polling flow, form-bound Server Actions for simple CRM edits.
5. businesses / leads identity split — businesses (keyed place_id) holds durable CRM state; leads stays a per-job scrape snapshot/audit row with the already-locked unique(job_id, place_id) constraint.

### Critical Pitfalls

1. Places API "No Caching" ToS conflict — storing name/address/phone/rating/website durably (beyond place_id) likely breaches Google's Maps Service Specific Terms. Already resolved in PROJECT.md: risk explicitly accepted for this personal, pre-revenue tool; revisit before any public/paid launch. Not an open question for the roadmap — but should surface as a named checkpoint before scaling.
2. "No website field" is a signal, not a fact — Text Search may omit websiteUri due to field-mask scope, not because the business lacks a site. Avoid by explicitly requesting places.websiteUri in the field mask and using UI/export copy like "no website found on Google," never "no website." Verify with a manual spot-check before scaling outreach.
3. websiteUri is Enterprise-tier billing — every scrape call needs it, so budget Enterprise pricing from day one, not Essentials; set a Cloud Billing alert before real usage.
4. Text Search hard 60-result cap + non-obvious nextPageToken activation delay (~2-5s) — a single broad query silently truncates in dense areas; requires retry-with-backoff on pagination and query-splitting (grid/sub-area) for dense categories, plus UI messaging when the cap is hit.
5. Language/region defaults under-serving Lima — wire languageCode/regionCode per job (already reflected in PROJECT.md Active requirements) and prefer Spanish category terms for Lima queries; test Toronto vs. Lima coverage side-by-side, not just "the location string was accepted."

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Data layer + Places API integration + checkpointed scrape worker
**Rationale:** Nothing else can be built or tested without the schema (including the businesses/leads split) and Places client existing first; this is also where the ToS-accepted persistence model, Enterprise-tier billing assumption, languageCode/regionCode wiring, and the 60-result/pagination-retry handling all get baked into the initial implementation rather than retrofitted.
**Delivers:** Drizzle schema (jobs, leads, businesses), Neon client, Places API client with field-masked Text Search (incl. websiteUri, business_status), mapPlaceToLead, checkpointed runScrapeJob/checkpoint.ts worker with elapsed-time safety threshold.
**Addresses:** Category+location scrape, tier-1 web-presence filter, business_status closed-business filter, Lima-market-quality parity.
**Avoids:** Pitfall 1 (persistence decision already made and documented — implement per that decision), Pitfall 2 (field-mask discipline), Pitfall 3 (billing assumptions), Pitfall 4 (pagination cap/retry), Pitfall 5 (locale defaults).

### Phase 2: Job lifecycle — Route Handlers + polling + resumability
**Rationale:** Depends on Phase 1's worker being callable; this is where the after() duration-ceiling behavior is validated end-to-end against a real deploy target, which can't be verified locally.
**Delivers:** POST /api/jobs, GET /api/jobs/:id (with atomic claim/continuation guard + stale-job watchdog), GET /api/jobs/:id/export CSV route with formula-injection sanitization.
**Uses:** swr for client polling, zod for request validation, csv-stringify for export.
**Implements:** Route Handler / DAL boundary, lazy-continuation-on-poll pattern.

### Phase 3: CRM UI (leads list, notes, contacted status, job history)
**Rationale:** Depends only on the businesses table from Phase 1 — does not depend on the scrape worker being complete, so it can be built in parallel with Phase 2 using seeded/fixture data once Phase 1 lands.
**Delivers:** LeadsTable, NotesEditor, ContactedToggle, Server Actions (updateLeadNotes, setContactedStatus), job history/list view, Google attribution on the leads display.
**Addresses:** Basic CRM (notes, contacted status), job history view, honest tier-1 UI copy ("no website found on Google"), Google Maps attribution requirement.

### Phase Ordering Rationale

- Data layer must exist before anything else — both the Places client and the worker write through it, and the businesses/leads split is a schema decision that shapes every later phase.
- The worker (Phase 1) and job HTTP lifecycle (Phase 2) are split because the worker's checkpointing logic should be built and tested in isolation (mocked Places client, real/test DB) before being wired to after()/polling — this matches the architecture research's own suggested build order.
- CRM UI (Phase 3) is deliberately parallelizable with Phase 2 since it depends only on the businesses table existing, not on the scrape pipeline being complete — useful if solo-dev bandwidth allows overlapping work with fixture data.
- CSV export is the lowest-risk, most isolated piece and is folded into Phase 2 since it reuses the same DAL/job infrastructure rather than warranting its own phase.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Places API field-mask/SKU details and pagination retry timing are precise enough to warrant re-verification against current docs at plan time (SKU categorization has changed before); --research-phase 1 recommended if pricing/field-mask specifics need re-confirmation before writing the worker.
- **Phase 2:** The after() duration-ceiling behavior on the actual chosen deploy target (Hobby vs. Pro) is not verifiable locally — flag for real-deployment validation during/after this phase, not just planning-time research.

Phases with standard patterns (skip research-phase):
- **Phase 3:** CRM UI (notes, contacted toggle, list view, Server Actions) is a well-documented Next.js pattern with no domain-specific unknowns remaining after Phase 1's schema work.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Library choices verified against npm registry (versions, maintenance status) and official Drizzle/Neon integration docs; judgment calls (Drizzle vs Prisma, SWR vs TanStack) are MEDIUM but low-stakes either way. |
| Features | MEDIUM | Cross-referenced multiple competitor tools and industry sources via web search; no first-party pricing/product docs fetched in depth for most competitors, but signal converges consistently across sources. |
| Architecture | MEDIUM-HIGH | Platform limits (Vercel duration, Next.js after() semantics) and Places API pagination mechanics are HIGH confidence (official docs); the CRM schema split and route-handler/server-action boundary are reasonable, well-precedented judgment calls (MEDIUM), not the only valid design. |
| Pitfalls | MEDIUM-HIGH | ToS clauses, API SKU/field facts verified directly against official developers.google.com/cloud.google.com sources (HIGH); legal-jurisdiction (CASL, Peru data law) and general CRM-pattern claims from web search, cross-checked across 2+ sources (MEDIUM). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- Deploy target undecided (Vercel Hobby vs. Pro vs. always-on host): PROJECT.md defaults to Hobby with a ~250s safety window for planning purposes, but the checkpointed-worker design should be validated against whichever target is actually chosen once that decision is made — flag for Phase 2 real-deployment testing.
- has_website as a derived fact vs. Places "content" — whether a boolean derived from Places response data is itself covered by the "No Caching" ToS restriction is an unresolved gray area in the pitfalls research, not something the current accepted-risk decision explicitly resolves. Low priority given the broader risk is already accepted, but worth a one-line note if a future ToS-compliance pass happens.
- False-positive rate for tier-1 "no website" classification — not measurable until real scrape data exists; plan a lightweight spot-check step early in real usage (Phase 1/3) rather than trusting the automated tier blindly from day one.
- Enterprise-tier Places API cost at real usage volume — budget assumptions are directional (research flags the SKU tier, not a dollar figure); confirm actual per-job cost against Google's current pricing page once Phase 1's field mask is finalized, and set a Cloud Billing alert before scaling beyond smoke-test volume.

## Sources

### Primary (HIGH confidence)
- developers.google.com/maps/documentation/places/web-service/* (Text Search, Place Data Fields, Policies, get-api-key) — field mask behavior, websiteUri SKU tier, caching/attribution policy, business_status/temporary-closures support
- cloud.google.com/maps-platform/terms/maps-service-terms — "No Caching" clause, place_id exemption, 30-day lat/lng exception
- nextjs.org/docs/app/api-reference/functions/after — after() duration-sharing semantics
- vercel.com/docs/functions/configuring-functions/duration and Functions API Reference — plan-tier maxDuration table, waitUntil() behavior
- orm.drizzle.team/docs/get-started/neon-new, neon.com/docs/guides/drizzle, neon.com/docs/serverless/serverless-driver — Drizzle+Neon pairing, neon-http no-interactive-transaction limitation
- npmjs.com registry — package versions/maintenance status for drizzle-orm, drizzle-kit, @neondatabase/serverless, zod, swr, csv-stringify, json2csv, drizzle-zod, @googlemaps/places
- priv.gc.ca (PIPEDA brief), Peru's Ley N° 29733 (official gazette) — regulatory primary sources for future outreach-phase compliance scoping

### Secondary (MEDIUM confidence)
- Cross-referenced 2026-dated comparison articles (Drizzle vs Prisma, SWR vs TanStack Query, CSV libraries) — judgment-call framing, not primary-source facts
- Competitor product sites (Targetron, Webleadr, LocalLead, Thyonix, B2BLeadFinder, Grape Leads) — feature landscape and MVP-vs-differentiator scoping
- McMillan LLP, IAPP, litemail.ai — legal-practitioner commentary on CASL and Peru data-protection nuances (for the deferred outreach phase, not v1)
- MapsLeads "Google Places API Limits in 2026" — corroborates pagination token-activation delay from a third-party angle

### Tertiary (LOW confidence)
- Apify/Outscraper scraper listings, GitHub scraper repos — used only as directional competitor-feature corroboration, not load-bearing for any decision

---
*Research completed: 2026-07-02*
*Ready for roadmap: yes*
