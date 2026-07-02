# findleads

## What This Is

findleads scrapes Google Maps (via the official Google Places API) for businesses in Toronto
and Lima, Peru that don't have a website, then gives Richard a lightweight CRM — notes,
contacted status — to manage outreach to them. It's a personal lead-generation tool for
pitching web/design services, not a general-purpose lead-scraping SaaS (RawLeads.com was the
visual/UX reference, not the product spec).

## Core Value

Surface real businesses with no website, with enough contact info and lead-tracking that
Richard can actually reach out and close them.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Scrape Google Maps via Google Places API by category + free-text location (validated
      against Toronto and Lima), with `languageCode`/`regionCode` wired per market so Lima
      isn't silently under-served by an English/Canada default
- [ ] Classify each lead by web-presence tier — v1 ships tier 1 only: no `website` field
      returned by Places API. UI/export copy must say "no website found on Google," not "no
      website" — the field's absence is a signal, not a verified fact
- [ ] Filter out closed businesses using the Places API `business_status` field — free from
      the same call already fetching `website`, folded into Phase 1 per research
- [ ] Job execution: a DB-backed job row is the source of truth; Next.js `after()` runs the
      scrape as a checkpointed, resumable worker (one search call = one unit, progress
      persisted after each unit); client polls `GET /api/jobs/:id` (~1s) for status/progress,
      and a `partial` status triggers continuation on the next poll (atomic claim guard to
      avoid duplicate continuations); stale `running` jobs auto-flip to `error` on read
- [ ] Identity vs. sighting split: a `businesses` table keyed on `place_id` holds durable CRM
      state (notes, contacted); `leads` stays a per-job scrape snapshot with
      `unique(job_id, place_id)` as already designed — re-running a job must NOT reset
      "contacted" status on a business already in the CRM
- [ ] Basic CRM: leads list view (reads `businesses`), freeform notes per lead,
      contacted/not-contacted status
- [ ] CSV export of a completed job's leads, with formula-injection sanitization on any cell
      starting with `=+-@` (ingesting untrusted place data)
- [ ] No auth — single user (Richard), no login, no billing

### Out of Scope

- Email enrichment (fetch business site, extract email) — Places API doesn't return email;
  deferred until tier-1 filtering is validated
- Web-presence tier 2 (social-profile-as-website detection) and tier 3 (fetch + analyze
  existing sites for staleness/dead links) — real signals, explicitly deferred; tier 3
  especially is a much heavier enrichment pipeline than tier 1
- Map/geo view of leads in a city — phase 2, once core scrape+CRM loop is validated
- Additional scrape sources: Google web search, Reddit, Instagram, TikTok, LinkedIn — phase 2+
- Conversion-likelihood scoring (will this business want/build a website?) — needs real lead
  data first; premature before v1 ships
- Outreach/email builder (block-based composer, SMTP/Gmail send) — phase 2+, not core to
  finding+qualifying leads
- Billing, multi-tenant auth, teams — no validated demand yet; single-user is enough to prove
  the core loop
- Live "radar" scan visualization (sweeping animation on the job feed) — visual polish,
  phase 2+ once the plain job-progress UI exists

## Context

- Richard's actual goal: find businesses without a web presence in Toronto and Lima to pitch
  web design/development services to directly — the app is his own sales-pipeline tool, not
  a product sold to others (yet).
- Design pivoted mid-session: an earlier brainstorming pass scoped this as a plain
  RawLeads-style scraper (scrape → CSV, no CRM). Richard's actual vision includes web-presence
  filtering as the core hook plus lead management (notes, status) as core v1, not an add-on —
  this PROJECT.md reflects the pivoted scope, not the earlier scraper-only draft.
- Repo already exists: `github.com/RikepilB/findleads`, public, MIT licensed. Scaffolded via
  the `project-scaffold` skill (AI-native repo: `CLAUDE.md`, `AGENTS.md`, `docs/`, `.claude/`,
  `tests/`, `.github/`) before this GSD project was initialized.
- Pre-existing planning docs (`docs/decisions.md`, `docs/architecture.md`,
  `.claude/rules/findleads-architecture.md`) describe the pre-pivot scraper-only design and
  predate this PROJECT.md. They need reconciling — either updated to reflect the CRM+tiering
  pivot or marked superseded in favor of `.planning/` as the source of truth — before
  implementation starts, so a future session doesn't build from the stale version.
- No product code exists yet. This is the first GSD project artifact; next step is
  research → requirements → roadmap → `/gsd-plan-phase 1`.

## Constraints

- **Tech stack**: Next.js (App Router), Node runtime API routes, Neon Postgres — locked
  during earlier brainstorming, not open for reconsideration without a specific reason.
- **Data source**: Official Google Places API only for v1 — no scraping, no headless browser.
  Chosen for ToS/legal safety over cost.
- **Package manager**: pnpm — no npm/yarn.
- **Markets**: Toronto and Lima are the initial validation targets; the location field itself
  is free-text, not a hardcoded enum, so it isn't limited to just these two.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Google Places API only (no scraping) | Reliable, no proxy/IP-block risk. **Not fully ToS-safe as designed** — see next row | ✓ Confirmed with caveat |
| Accept Places API "No Caching" ToS risk — store name/address/phone/rating/website durably in Postgres, not just `place_id` | Research found the persistence model breaches Google's "No Caching" clause (only `place_id` is exempt). Re-architecting to store only `place_id` + re-fetch display fields live costs an Enterprise-tier Place Details call per lead per page view. Richard chose to accept the contract-breach risk (possible API key revocation, not legal liability) for a personal, pre-revenue, single-user tool | ✓ Accepted risk — revisit before any public/paid launch |
| DB-backed job row + Next `after()` + polling, no queue, **checkpointed/resumable worker** | Simplest thing that works for two-market MVP validation. Research found plain `after()` risks silent timeout on Vercel Hobby's non-configurable 300s ceiling with no error write — checkpointing (one search call per unit, `partial` status, lazy continuation on poll) fixes this within the same no-queue design | ✓ Adopted (research-recommended refinement) |
| Identity/sighting split — `businesses` table (keyed `place_id`, holds CRM state) separate from per-job `leads` snapshot rows | Research found CRM fields living only on `leads` silently reset "contacted" status when a job re-runs over the same area — defeats the CRM's purpose. Additive to the locked `unique(job_id, place_id)` schema, not a redesign | ✓ Adopted (research-recommended fix) |
| Fold `business_status` (closed-business filter) into Phase 1 | Free from the same Places API call already fetching `website` — near-zero-cost per Features research | ✓ Adopted |
| Default deploy target: Vercel Hobby, ~250s worker safety window | Unblocks Phase 1 planning; the checkpointed worker design absorbs this uncertainty and upgrades to Pro (800s) cleanly if needed | ✓ Default (revisitable) |
| No auth/billing/outreach builder in v1 | Single user (Richard); fast validation over completeness | ✓ Confirmed |
| Web-presence tiering v1 = tier 1 only (missing website field) | Free from Places API response; tiers 2/3 need extra fetch+analysis work. Research: treat as signal not fact — UI copy says "no website found on Google" | ✓ Confirmed with copy caveat |
| v1 bundles basic CRM (notes, contacted status) with the scraper | Core to Richard's actual use case — scrape *and* manage, not just export | ✓ Confirmed |
| Repo open-sourced under MIT | Explicit request | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-02 after initialization*
