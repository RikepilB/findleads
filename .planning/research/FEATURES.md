# Feature Research

**Domain:** Lead-generation/prospecting scraper (Google Places API) + lightweight CRM, "no website" niche
**Researched:** 2026-07-02
**Confidence:** MEDIUM (web search across multiple converging competitor tools; no first-party product docs/pricing pages fetched in depth)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in this exact niche (Google-Maps-sourced, "no website" lead finder + basic tracking). Missing these = product feels incomplete or actively wastes Richard's outreach time.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Filter/search by category + location | Every competitor (Targetron, Webleadr, LocalLead, B2BLeadFinder) leads with this; it's the entry point to any run | LOW | Already in v1 scope (free-text location + category). |
| "No website" detection as the primary filter | This is the core hook across all competitor tools ("no site" badge/flag is the headline signal, not an afterthought) | LOW | Already in v1 scope as tier 1 (`website` field absent). |
| Exclude permanently/temporarily closed businesses | Places API exposes `business_status` (`OPERATIONAL`/`CLOSED_TEMPORARILY`/`CLOSED_PERMANENTLY`); scraping a closed business as a "lead with no website" is an embarrassing false positive and wastes an outreach attempt | LOW | **Not currently in v1 scope — gap.** Requesting `business_status` in the Places field mask and filtering/flagging `CLOSED_PERMANENTLY` (and probably `CLOSED_TEMPORARILY`) is a one-field addition to the existing scrape, no new pipeline needed. Recommend adding to Phase 1, not deferring — it's cheap and directly protects the core value prop (real, reachable businesses). |
| CSV export | Universal across every competitor tool surveyed; matches v1 scope already | LOW | Already in v1 scope. |
| Contact fields surfaced clearly (phone, address, rating, review count) | Users act on these fields directly for cold calling/visiting; competitors treat rating + review count as qualification signals, not decoration | LOW | Places API returns these already — mostly a display/formatting concern, not a new data-fetch. |
| Per-lead status tracking (contacted / not contacted) | Every competitor and every minimal-CRM reference treats "have I touched this lead" as the single most load-bearing field | LOW | Already in v1 scope. |
| Freeform notes per lead | Universal minimal-CRM requirement — "one place to track every call/note" | LOW | Already in v1 scope. |
| Job/run history (see past scrapes, not just current) | Implicit requirement of the DB-backed job model already chosen; without it, a solo user re-running scrapes has no way to find "that Toronto plumbers run from last week" | LOW–MEDIUM | Follows directly from the existing job-row architecture — surfacing a jobs list view is nearly free given `jobs` table already exists as source of truth. Worth confirming it's in the UI plan, not just the API. |
| Zero-result / error state handling in UI | Architecture doc already flags this as design intent (`status: error` vs `partial` vs zero-result-is-valid) | LOW | Already covered in architecture doc — make sure it also lands as a UI requirement, not just a job-status enum. |

### Differentiators (Competitive Advantage)

Features that set findleads apart for Richard's actual use case — a single operator running two specific markets, not a general SaaS. None of these are required for launch, but they're where a personal tool can beat a generic scraper.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Web-presence tiering beyond tier 1 (social-only, stale/dead site) | Competitors (Webleadr, B2BLeadFinder) explicitly market "health scores" beyond binary no-website — a business with only an Instagram page or a 2015-era broken site is often an even better pitch target than one with literally nothing | MEDIUM–HIGH | Already correctly flagged in PROJECT.md as tier 2/3, phase 2+. Confirmed by research as a real differentiator other tools charge for — validates the phased deferral rather than building it into v1. |
| Opportunity score (composite signal, not just binary) | B2BLeadFinder's whole pitch is a 0–100 score from {no website, low reviews, directory-only presence}; even a crude version (e.g., "no site AND <5 reviews AND stale") is more actionable than a flat list | LOW–MEDIUM once tier-1 data exists | Correctly deferred per PROJECT.md ("needs real lead data first") — but flag this as a strong Phase 2 candidate since the underlying signals (review count, rating, business_status) are already free from the same Places API call that gets `website`. Low marginal cost when it's built. |
| Two-market (Toronto + Lima) side-by-side workflow | No competitor tool surveyed is built around one operator working two specific, unrelated markets — this is a personal-workflow differentiator, not a market one | LOW | Already served by the free-text location field; no extra feature needed, just don't accidentally hardcode a single-market assumption anywhere in the UI. |
| Shareable "why this lead is a good target" one-pager | B2BLeadFinder's "digital health report" is explicitly called out as a conversion aid — a generated summary Richard could literally send/reference during outreach | MEDIUM | Phase 3+ territory (depends on outreach builder and scoring both existing first) — noted for later, not v1. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good for this niche but create disproportionate risk/complexity for a single-operator MVP.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Email enrichment via website scraping | Nearly every competitor bundles or upsells this; feels like "the obvious next step" once you have a business name | Places API doesn't return email at all — this requires fetching each business's own website (which by definition doesn't exist for tier-1 leads!) or third-party enrichment APIs, adds cost, legal surface, and accuracy risk before the core loop is validated | Correctly deferred in PROJECT.md. Note: for tier-1 leads specifically (no website), email enrichment is structurally harder than for competitors' broader lead sets, since there's no site to scrape — reinforces that this should stay deferred until social-profile (tier 2) discovery exists as a prerequisite. |
| AI-generated outreach messages | Multiple competitors (Webleadr) now bundle this as a differentiator | Depends on an outreach builder that's explicitly out of scope; also a prompt-injection surface once scraped business names/descriptions feed an LLM prompt (already flagged in project's own security rules) | Defer with the rest of the outreach builder; when built, treat all scraped text as data per the project's existing prompt-injection guardrail. |
| General B2B lead scoring (behavioral/intent data, firmographic AI scoring à la HubSpot/6sense) | "Real CRMs have lead scoring" | These systems assume email/website tracking, multi-touch engagement history, and large contact databases — none of which exist for a local-business no-website lead with a single phone number and no prior interaction | Use the much simpler "opportunity score" pattern from the direct competitor set (website absent + review count + business_status) instead — see Differentiators above. |
| Cross-job global dedup | Feels like an obvious CRM hygiene feature ("don't show me the same plumber twice") | Explicitly and correctly ruled out in PROJECT.md for v1 — re-running a scrape for an area legitimately should resurface current results; global dedup adds a cross-job identity model prematurely | Keep per-job dedup only, as already decided. Revisit once usage shows duplicate-job pain. |
| Full outreach compliance workflow (consent tracking, unsubscribe links, DNC lists) up front | Sounds responsible, and Canada's CASL is real (up to $10M CAD penalties, applies to any commercial message received in Canada) | Building a compliance system before there's an outreach *sender* feature is solving a problem the product doesn't have yet — CASL requirements only bite once findleads actually sends messages, not while it's just scraping+tracking | Do nothing now. When the phase-2+ outreach builder is scoped, treat CASL awareness (record source of consent basis, include sender ID/address/unsubscribe) as a requirement of *that* phase, not v1. Low-volume, targeted, publicly-published-contact outreach (which matches Richard's actual use) is lower-risk under CASL's implied-consent rules but not exempt — worth a one-line flag now so it isn't missed later. Lima/Peru has its own data protection law with separate rules if outreach ever extends there. |
| Map/geo visualization in v1 | Every competitor markets an "interactive map" — feels like the obvious visual payoff | Already correctly deferred (Phase 2) — a map is a rendering layer on top of data that doesn't exist yet in a validated form; building it before the CRM loop is proven is exactly the kind of premature investment PROJECT.md is trying to avoid | Ship list view first; add map once there's a real multi-hundred-lead dataset to visualize. |

## Feature Dependencies

```
Places API scrape (category + location)
    └──requires──> Web-presence tier-1 filter (website field absent)
                       └──requires──> Per-job dedup (job_id, place_id)

business_status filter (exclude closed)
    └──enhances──> Web-presence tier-1 filter (same Places API call, one more field)

Job row (DB) + after() execution + polling
    └──requires──> Job history / jobs list view (surfaces what already exists in the job table)

Basic CRM (notes, contacted status)
    └──requires──> Leads list view (scoped to a completed job's results)

Opportunity score (Phase 2)
    └──requires──> Tier-1 web-presence data + review count/rating (already fetched) + business_status
    └──enhances──> Leads list view (sort/prioritize)

Web-presence tier 2/3 (Phase 2+)
    └──requires──> Tier-1 filter as baseline
    └──enhances──> Opportunity score (more accurate gap signal)

Email enrichment (Phase 2+, deferred)
    └──requires──> Web-presence tier 2 (social profile discovery) as a practical prerequisite for tier-1 (no-website) leads,
                    since there is no business website to scrape an email from

Outreach builder (Phase 2+)
    └──requires──> Basic CRM (contacted status as the trigger/target)
    └──requires──> CASL/consent-awareness (Canada) as part of that phase's own scope, not v1

Map/geo view (Phase 2)
    └──requires──> Leads list view + a validated multi-market dataset
```

### Dependency Notes

- **`business_status` filter enhances the tier-1 filter, doesn't gate it:** it's an additive field on the same API call already being made for `website`. This is why it's flagged as a table-stakes gap to close in Phase 1 rather than a phase-2 deferral — the marginal cost is near zero and it directly protects lead quality.
- **Opportunity score requires tier-1 data first:** matches PROJECT.md's own reasoning ("needs real lead data first") — the dependency chain confirms that ordering is correct, not just convenient.
- **Email enrichment's real prerequisite is tier 2, not "any enrichment API":** for a *tier-1* lead (no website), scraping a business's own site for an email is a non-starter by definition. Any future email-enrichment phase needs to either target tier-2 leads (has a social profile, no formal site) or go straight to third-party contact-database APIs — this is a scoping detail worth carrying into that phase's own research, not something to solve now.
- **Outreach builder and CASL-awareness are coupled, not sequential add-ons:** don't scope an outreach/email-send feature without folding in consent-basis tracking in the same phase; retrofitting compliance after a send feature ships is the expensive order.

## MVP Definition

### Launch With (v1)

Matches the already-locked PROJECT.md scope, plus one addition surfaced by this research.

- [ ] Scrape by category + free-text location (Toronto, Lima validated) — core value delivery
- [ ] Tier-1 web-presence filter (`website` field absent) — the core hook
- [ ] **`business_status` filter/flag to exclude closed businesses** — cheap addition, same API call, prevents outreach to defunct businesses (research gap not in original scope; recommend folding into Phase 1's scrape work rather than treating as separate)
- [ ] DB-backed job + `after()` + polling — already locked
- [ ] Per-job dedup (`job_id`, `place_id`) — already locked
- [ ] Leads list view + notes + contacted status — already locked
- [ ] Job history/list view — implicit requirement of the job-row architecture; confirm it's explicitly in the UI plan
- [ ] CSV export — already locked
- [ ] No auth — already locked

### Add After Validation (v1.x)

Trigger: core scrape+CRM loop has been used for real outreach in both markets and Richard has enough leads to want prioritization.

- [ ] Simple opportunity score (website absent + review count + rating + business_status) — trigger: enough leads exist that flat lists stop being sortable by eye
- [ ] Web-presence tier 2 (social-profile-as-site detection) — trigger: tier-1 leads run out or convert poorly, need a bigger pool
- [ ] Map/geo view — trigger: dataset large enough that a list is hard to reason about spatially

### Future Consideration (v2+)

- [ ] Web-presence tier 3 (fetch + analyze existing sites for staleness) — defer until tier 1/2 prove the core value prop; heaviest enrichment pipeline of the three tiers
- [ ] Email enrichment — defer until tier 2 exists as a practical prerequisite (see dependency note above)
- [ ] Outreach/email builder + CASL-aware consent tracking — defer as a coupled pair, not separately
- [ ] Additional scrape sources (web search, Reddit, Instagram, TikTok, LinkedIn) — defer until Places-API-only loop is proven
- [ ] Cross-job global dedup — defer until repeated-job usage shows real duplicate pain
- [ ] Billing/multi-tenant/auth — no validated demand for multi-user use

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Tier-1 web-presence filter | HIGH | LOW | P1 |
| `business_status` closed-business filter | MEDIUM | LOW | P1 |
| Basic CRM (notes, status) | HIGH | LOW | P1 |
| Job history/list view | MEDIUM | LOW | P1 |
| CSV export | MEDIUM | LOW | P1 |
| Opportunity score (simple) | HIGH | LOW–MEDIUM | P2 |
| Web-presence tier 2 | HIGH | MEDIUM–HIGH | P2 |
| Map/geo view | MEDIUM | MEDIUM | P2 |
| Email enrichment | HIGH | HIGH | P3 |
| Outreach builder + CASL handling | MEDIUM | HIGH | P3 |
| Web-presence tier 3 | MEDIUM | HIGH | P3 |
| Cross-job global dedup | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Targetron / LocalLead / Thyonix (basic no-website finders) | Webleadr / B2BLeadFinder (scored/enriched finders) | findleads' Approach |
|---------|---|---|---|
| Website-presence detection | Binary: has site or not, from Google Maps scan | Multi-tier: no site / social-only / directory-only / broken / stale, with a "health score" | v1 = binary (tier 1), matching the basic-tier competitors; tiering deferred to phase 2, matching the advanced tier's roadmap position, not its v1 |
| Contact enrichment | Rarely bundled; often a separate step | Bundled: email discovery, social links, decision-maker lookup | Deferred entirely for v1 — correctly, since Places API has no email field and enrichment infra is real added complexity |
| Scoring/prioritization | None — flat filtered list | 0–100 opportunity score from gap signals | Deferred to v1.x; underlying signals (reviews, rating, business_status) already free from the same API call |
| Lead management/CRM | None — export-only tools | Status tracking only, not full notes/CRM | findleads differentiates here — bundling CRM (notes + status) into v1 is *more* than most direct competitors ship, matching PROJECT.md's stated pivot away from a plain scraper |
| Outreach | None | AI-generated messages (Webleadr) | Deferred; when built, needs CASL-awareness folded in from day one of that phase |
| Map/geo view | Some (Webleadr "interactive map") | Not consistently present | Deferred to phase 2 across the board — consistent with what even advanced competitors treat as a secondary feature |

## Sources

- [Targetron — Businesses Without Websites](https://targetron.com/businesses-without-websites/) — MEDIUM
- [Webleadr](https://webleadr.com/) — MEDIUM
- [LocalLead](https://local-leadfinder.com/) — MEDIUM
- [Thyonix — Find Businesses Without Websites](https://www.thyonix.com/tools/find-businesses-without-websites) — MEDIUM
- [Grape Leads](https://grapeleads.com/) — MEDIUM
- [B2BLeadFinder — How to Find Businesses Without a Website](https://b2bleadfinder.io/blog/how-to-find-businesses-without-websites) — MEDIUM (fetched directly; opportunity-score and digital-health-report details confirmed first-hand)
- [Apify — Businesses Without Websites Leads Scraper (Google Maps)](https://apify.com/xmiso_scrapers/businesses-without-websites-leads-scraper-google-maps) — LOW
- [Apify — No-Website Business Leads Scraper (Google Maps)](https://apify.com/leafy-dev-jr/no-website-business-leads-scraper-google-maps) — LOW
- [Outscraper — How to Find Businesses Without Website for Cold Outreach](https://outscraper.com/how-to-find-businesses-without-website-for-cold-outreach/) — LOW
- [GitHub — omkarcloud/google-maps-scraper](https://github.com/omkarcloud/google-maps-scraper) — MEDIUM (data-point/enrichment scope)
- [Google for Developers — Places API Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) — HIGH (official docs, referenced for `website`/`business_status` field behavior)
- [Google Maps Platform blog — Temporary closures now available in the Places API](https://mapsplatform.google.com/resources/blog/temporary-closures-now-available-places-api/) — HIGH (official)
- [Salesforce — Sales Pipeline Management](https://www.salesforce.com/sales/pipeline/management/) — MEDIUM (minimal-CRM pipeline/notes patterns)
- [mvpGrow — 8 CRM Pipeline Stages](https://mvpgrow.com/8-crm-pipeline-stages-every-sales-cycle-must-have/) — MEDIUM
- [litemail.ai — CASL Cold Email Canada Guide 2026](https://litemail.ai/blog/casl-cold-email-canada-guide-2026) — MEDIUM (consent/legal requirements for future outreach phase)
- [CRTC — CASL Guidance on Implied Consent](https://crtc.gc.ca/eng/com500/guide.htm) — HIGH (official regulator)
- [HasData — Web Scraping for Lead Generation](https://hasdata.com/blog/web-scraping-for-lead-generation) — MEDIUM (dedup/stale-data pitfalls, general web-scraping context; largely N/A here since findleads uses the official API, not HTML scraping)

---
*Feature research for: lead-generation/prospecting scraper + lightweight CRM (findleads)*
*Researched: 2026-07-02*
