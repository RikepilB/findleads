# Pitfalls Research

**Domain:** Google Places API lead-generation scraper + web-presence filtering + lightweight CRM (Toronto + Lima, Peru)
**Researched:** 2026-07-02
**Confidence:** MEDIUM-HIGH (ToS clauses and API field/pricing facts verified against official `developers.google.com`/`cloud.google.com` primary sources = HIGH; legal-jurisdiction and CRM-pattern claims from web search = MEDIUM, cross-checked across 2+ independent sources)

## Critical Pitfalls

### Pitfall 1: The persistence model (storing leads in Postgres) conflicts with Places API's "No Caching" clause

**What goes wrong:**
The project's core design — scrape via Places API, store name/address/phone/rating/website-status in Postgres, layer a CRM on top with notes and contacted-status that persist indefinitely — is very likely a Google Maps Platform Terms of Service violation. The official Places API policy page (`developers.google.com/maps/documentation/places/web-service/policies`) and the Maps Service Specific Terms ("No Caching" clause) state: *"You must not pre-fetch, cache, or store Places API content beyond the allowed exceptions."* The only unconditional exception is `place_id`, which is explicitly "exempt from caching restrictions" and storable indefinitely. Latitude/longitude may be cached for up to 30 consecutive calendar days and must then be deleted. Everything else — name, formatted address, phone, rating, and the `website` field itself (the exact data this product is built around) — has no general storage allowance without a separate agreement with Google. Separately, Google explicitly states that using data (specifically the Business Profile endpoint) "for lead generation or other analysis is against Google's policies and will result in immediate revocation of your API access."

**Why it happens:**
Nearly every "Places API lead-gen tool" pattern (RawLeads-style scrapers, this project's own explicit UX reference) implicitly assumes "call the API once, own the data forever" — which is how scraping tools behave, but not how the Places API ToS is written. The project chose the official API specifically *for ToS safety* over headless scraping, but the persistence model recreates the same exposure the API choice was meant to avoid. This is easy to miss because Google's own docs are split across three pages (the policies page, the SKU/data-fields page, and the Maps Service Specific Terms) and none of them loudly says "do not build a CRM on top of this."

**How to avoid:**
This needs an explicit decision in the spec/legal-review step before implementation, not an assumption. Options to evaluate (in order of ToS-safety, not preference):
1. **Store only `place_id` + derived/first-party CRM fields** (notes, contacted status, a boolean `has_website` computed at scrape time) indefinitely. Do NOT persist Google's `name`, `formattedAddress`, `rating`, etc. as durable rows — re-fetch live via Place Details (New) keyed on `place_id` whenever the CRM view needs to display them, discarding the raw response after render (or caching only within the 30-day lat/lng-style window if a similar exception applies).
2. If option 1 is judged impractical for MVP velocity, treat it as a **known, accepted ToS risk** (contract breach → possible API key revocation, not legal liability) and document it as a conscious tradeoff with a mitigation plan (e.g., request an extended-cache agreement from Google, or budget for a re-architecture before any public/paid launch).
3. A `has_website` boolean *derived* from Places content is a genuine gray area — is a derived fact still "content"? Not resolved by the docs found in this research; flag as an open legal question rather than assuming it's safe.
Do not silently default to "store everything in Postgres forever" without this decision being made explicitly and documented in Key Decisions.

**Warning signs:**
- Schema design that stores `name`, `address`, `phone`, `rating` as first-class persisted columns rather than re-fetched/ephemeral values.
- No `place_id`-keyed re-fetch path exists anywhere in the architecture.
- No mention of this tradeoff in `docs/decisions.md` or `.planning/PROJECT.md` Key Decisions table.

**Phase to address:**
Must be resolved before Phase 1 (data model / schema design) — this is a data-model-shaping decision, not a later cleanup. Should be an explicit line item in the spec step referenced in `.claude/rules/findleads-architecture.md` ("Do not build yet" section).

---

### Pitfall 2: "No `website` field" is being treated as "no website" — but it's a proxy, not ground truth

**What goes wrong:**
`.planning/PROJECT.md` defines tier-1 web-presence classification as "no `website` field returned by Places API." This field being absent does NOT reliably mean the business has no website. It can also mean: the business has a website but never added it to their Google Business Profile listing; the field was excluded by an overly narrow field mask on a given request; Text Search (New) returns a different (smaller) field set than Place Details (New) does by default, so a website field's absence in a Text Search result may just mean "wasn't requested/returned at this endpoint," not "doesn't exist." Every false positive here is a lead where Richard pitches a business that already has a website — undermining the entire value proposition and burning credibility on outreach.

**Why it happens:**
Treating an API field's presence/absence as a proxy for a real-world fact is a very common shortcut in scraper-driven products because it's free (no extra request, no extra cost) — but the API's own docs are explicit that Place Search/Text Search responses return "a subset of the fields returned by Place Details," and getting the full field requires a separate Place Details (`place_id`) call.

**How to avoid:**
- Explicitly confirm the field mask sent to Text Search (New) includes `places.websiteUri` (Enterprise SKU — see Pitfall 3) so its absence in the response is a genuine "Google has no record of a website for this business," not a field-mask omission.
- Treat "no `website` field" as tier-1 *signal*, not tier-1 *fact* — the PROJECT.md's own phase-2 tiers (social-profile-as-website, fetch+analyze staleness) exist precisely because tier 1 is known to be imprecise. Make sure UI copy for tier-1 leads says something like "no website found on Google" rather than implying certainty the business has none.
- Consider a lightweight manual sanity-check step before outreach (spot-check a sample of tier-1 leads) rather than trusting the automated tier blindly, at least until real lead data validates the false-positive rate.

**Warning signs:**
- UI/CSV export language that states "no website" as fact rather than "no website listed on Google."
- No field-mask review confirming `websiteUri` is actually requested on every scrape call.
- No plan to measure false-positive rate against real outreach results.

**Phase to address:**
Phase covering the core scrape + tier-1 classification logic (the first implementation phase). Verification: manually check a sample of "no website" leads against a live web search before shipping tier-1 filtering as the core hook.

---

### Pitfall 3: `websiteUri` is Enterprise-tier — the field this whole product depends on is the most expensive one to request

**What goes wrong:**
Per Google's official Place Data Fields (New) pricing table, `websiteUri` is billed under the **Enterprise** SKU for Text Search, Nearby Search, and Place Details alike — not Essentials or Pro. Any request whose field mask includes `websiteUri` (which is every scrape request this product needs to make, since tier-1 classification depends on it) is billed at the Enterprise rate for that entire request, even if the rest of the field mask only needs Essentials-tier fields (name, address). Google bills at the *highest* SKU touched by any field in the mask. This makes the naive cost model (assume Essentials pricing) wrong by a wide margin, and Enterprise SKUs also get a much smaller free monthly tier (roughly 1,000 free billable events vs. 10,000 for Essentials, per current published tiers).

**Why it happens:**
Developers new to the Places API (New) pricing model reasonably assume "the field I need most" (website) is a basic, cheap field, since it feels like commodity business info. The SKU/tier system is opaque unless you specifically cross-reference the field-by-field pricing table against the field mask you're sending.

**How to avoid:**
- Budget for Enterprise-tier pricing from day one for every Text Search call in the scraping loop — do not assume Essentials pricing when estimating API cost for the MVP.
- Since every scrape call needs `websiteUri` to do tier-1 classification, there's no way to avoid Enterprise billing on the primary search call; the optimization lever is minimizing *how many* Enterprise-tier calls are made (batch by category+location efficiently, avoid redundant re-queries) rather than avoiding the tier itself.
- Re-verify current pricing/SKU tables directly against `developers.google.com/maps/documentation/places/web-service/data-fields` before finalizing a cost estimate — SKU categorization has changed at least once already (legacy → New API pricing overhaul) and could shift again.

**Warning signs:**
- Cost estimates or budget assumptions based on Essentials-tier per-1000-request pricing.
- No monitoring/alerting on Google Cloud billing once real usage starts.

**Phase to address:**
Phase covering initial Places API integration — cost estimation should happen before building the scrape loop, not discovered after the first bill.

---

### Pitfall 4: Text Search (New) pagination has a hard 60-result cap and a non-obvious token-activation delay

**What goes wrong:**
Text Search (New) returns a maximum of 60 results total across all pages (20 per page × 3 pages via `pageSize`/`nextPageToken`), regardless of how many businesses actually match the query in a given area. For a category+location query in a moderately dense area of Toronto or Lima, 60 results can undercount the true business population significantly, silently truncating lead coverage with no error — the job just "completes successfully" having missed most of the market. Separately, `nextPageToken` is not immediately usable: calling it within ~1-2 seconds of receipt reliably returns `INVALID_REQUEST`; the real activation delay is undocumented and appears to float ~2-5 seconds server-side, so a naive immediate-retry loop will fail intermittently, and a full 3-page fetch realistically takes 5-15 seconds end-to-end just for pagination waits.

**Why it happens:**
This is a genuine legacy behavior (the old Places API also had similar page-token delays) that carried over into the New API and is easy to miss because it only appears in edge cases (dense areas, second/third pages) that a first quick test with a narrow query won't hit.

**How to avoid:**
- Bake a retry-with-backoff loop around `nextPageToken` calls (e.g., wait 2s, retry on `INVALID_REQUEST`, cap retries) rather than assuming immediate availability.
- For dense categories/locations expected to exceed 60 results, split the query further (narrower category, sub-area/grid search, or tighter radius) rather than relying on a single Text Search call to return "everything." This directly affects the job/dedup design already locked in (`unique(job_id, place_id)`), since a single job for a broad area+category combination will silently cap at 60 leads even in a market with hundreds of qualifying businesses.
- Because `after()` runs post-response with a serverless-style execution window, confirm the deploy target's function timeout (not yet decided per PROJECT.md) comfortably covers worst-case pagination time (multiple queries × up to 15s each) — a job that needs 3 pages across several category/location combinations can add up quickly and risks leaving a job stuck in `running` if the runtime is killed mid-fetch.

**Warning signs:**
- Jobs for dense areas/categories consistently returning exactly 60 (or exactly 20) results — a strong signal of silent truncation, not "that's all the businesses that exist."
- Pagination retry logic missing or using a fixed short delay (<2s) with no backoff.
- No visibility/logging distinguishing "job got 60 results because that's the true cap" from "job got 60 results because more exist but weren't fetched."

**Phase to address:**
Phase covering the scrape job execution (Places API integration + job runner). Verification: test against at least one genuinely dense query (e.g., "restaurant" in downtown Toronto or central Lima) to confirm the 60-cap and pagination-retry behavior are handled, not just a low-volume smoke test.

---

### Pitfall 5: Language/region defaults silently under-serve the Lima, Peru market

**What goes wrong:**
Places API (New) supports `languageCode` and `regionCode` parameters that affect both the language of returned results (business names, formatted addresses, types) and the region-bias applied to search ranking. If the app defaults to English (`en`)/Canada (`CA` or unset) regardless of which market is being searched, Lima queries will get English-biased results and results may under-represent or mis-rank genuinely local businesses, and English-language category terms (e.g. "restaurant") won't reliably match how Google's data is indexed for Spanish-language business names/categories in Peru the way "restaurante" would for local relevance. Category-term mismatches (English vs. Spanish free-text queries) compound this since the free-text location/category fields in this project are not a hardcoded enum.

**Why it happens:**
Single-user, single-language products often build with one implicit default locale and never revisit it once "it works" for the first tested market (likely Toronto, given Richard is Toronto-based). Lima is added later as "just another location string" without touching language/region params, since the location field itself is free-text and doesn't obviously imply "also change the language."

**How to avoid:**
- Explicitly wire `languageCode`/`regionCode` per job based on the target market (e.g., infer from the free-text location string, or add a lightweight market/locale selector alongside the location field) rather than hardcoding one default.
- When querying Lima, prefer Spanish category terms (or query both English and Spanish terms and dedup) since Google's indexing of local business categories/names in Peru will skew Spanish.
- Test address parsing/display against real Lima addresses (see Pitfall 6) early, not just Toronto ones, to catch locale-driven formatting bugs before they're baked into the CRM UI.

**Warning signs:**
- No `languageCode`/`regionCode` parameter anywhere in the Places API call construction.
- Category/keyword input UI or docs that only give English examples.
- Lima test runs returning noticeably fewer/lower-quality results than equivalent Toronto runs with no other explanation.

**Phase to address:**
Phase covering the scrape job execution / Places API integration — same phase as Pitfall 4, since both live in the same API-call construction code.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Persisting raw Places API content (name/address/phone/rating) as durable Postgres columns | Fast MVP build, simple queries for CRM UI | Ongoing ToS exposure (Pitfall 1); a later forced re-architecture to re-fetch-on-demand is expensive once the CRM UI and schema assume durable fields | Only as an explicitly documented, accepted risk — never silently |
| Treating "no `website` field" as ground truth "no website" (skip Place Details verification) | Zero extra API cost/latency per lead | Erodes trust in the product's core value prop once false positives surface in real outreach (Pitfall 2) | Acceptable for MVP validation *if* the UI language is honest ("no website found on Google," not "no website") and false-positive rate gets measured |
| Single hardcoded `languageCode`/`regionCode` default | One less parameter to design/test | Silently degrades Lima result quality/coverage (Pitfall 5) | Never — this is core to why Lima was chosen as a validation market in the first place |
| No retry/backoff on `nextPageToken`, just single immediate call | Simpler pagination code | Intermittent `INVALID_REQUEST` failures that look like flaky API behavior, hard to debug later (Pitfall 4) | Never — this is a known, well-documented API behavior, not an edge case |
| Global free-text location field with no locale inference | Simple, matches "just type any city" UX goal | Address parsing/CRM display bugs on non-Canadian formats (jirón, urbanización, manzana/lote) surface late, after Lima data is already in the DB | Acceptable for MVP if display just renders `formattedAddress` as a raw string rather than attempting structured parsing |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Places API (New) — Text Search | Assuming Essentials-tier pricing when `websiteUri` is in the field mask | Budget Enterprise-tier pricing for every scrape call that includes `websiteUri` (Pitfall 3) |
| Places API (New) — pagination | Calling `nextPageToken` immediately after receiving it | Retry with backoff (~2-5s) on `INVALID_REQUEST` during pagination (Pitfall 4) |
| Places API (New) — Text Search vs Place Details | Assuming Text Search returns the same field set as Place Details | Confirm field mask explicitly includes every field needed at the endpoint actually being called; don't assume parity |
| Places API — display/CRM UI | Rendering leads in a table/list without Google attribution | Even a map-less leads table displaying Places content must show the "Google Maps" logo/text attribution per policy (Pitfall 1 area — see policies page) |
| Google Cloud billing | No budget alert configured before first real scrape run | Set a Cloud Billing budget alert before running production-scale jobs, given Enterprise-tier pricing on the core field |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Single broad Text Search query per category+location combo | Job silently returns exactly 60 (or 20) results | Split into narrower sub-queries (grid/sub-area or tighter category) once a market/category shows signs of truncation | Any category/location combo with >60 genuinely matching businesses (common for broad categories like "restaurant" in a dense downtown core) |
| `after()` + polling job model doing multi-page pagination synchronously in one request lifecycle | Jobs stuck in `running` status past expected completion | Confirm deploy target's function/runtime timeout comfortably exceeds worst-case pagination time; add a job-level timeout + `partial`/`error` status fallback | Once real jobs combine multiple categories/locations, each needing multi-page pagination with 2-5s waits between pages |
| No cross-job dedup (explicitly out of scope for v1 per PROJECT.md) | Re-running a job for the same area resurfaces identical leads, cluttering the CRM view over time | Acceptable for v1 per the locked decision, but revisit once Richard is actively re-running jobs on the same markets repeatedly | Once repeat scraping of the same Toronto/Lima areas becomes routine usage rather than one-off validation |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating scraped business names/addresses/reviews as safe-to-render/trusted strings | XSS via malicious business names, or downstream prompt-injection if phase-2 LLM enrichment ever reads this text (already flagged in this repo's own `.claude/rules/findleads-architecture.md` and `CLAUDE.md`) | Sanitize on render; treat all Places API content as untrusted data, never as instructions, even in later phases |
| Google Places API key exposed client-side (calling the API directly from the browser instead of proxying through the Next.js API route) | Key theft, quota abuse by third parties, unexpected billing spikes on Enterprise-tier fields | Keep all Places API calls server-side (Node runtime API routes, as already designed) with the key in server-only env vars, never `NEXT_PUBLIC_*` |
| No API key restriction (HTTP referrer / API restriction) on the Google Cloud key | A leaked/exposed key can be used for unrelated Google Maps Platform calls at the account's expense | Restrict the key to the Places API only, and to the app's expected calling context, in Google Cloud Console |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Presenting tier-1 "no website" leads as certain fact | Richard wastes outreach effort/credibility pitching businesses that do have a website Google just didn't index | Label as "no website found on Google" and consider a spot-check step before scaling outreach (Pitfall 2) |
| No indication of the 60-result cap being hit | Richard believes a market/category has been fully covered when it's actually silently truncated | Surface "60+ results found, showing first 60 — refine your search" type messaging when the cap is hit (Pitfall 4) |
| Freeform notes/contacted-status with no timestamp or staleness indicator | Notes become untrustworthy over time — no way to tell if "contacted" status is from last week or 3 months ago | Timestamp every status change; consider a simple "last updated" indicator in the CRM list view (Pitfall — see Technical Debt / CRM section below) |
| No re-scrape/refresh path once a lead is in the CRM | A lead marked "no website" may get a website weeks later; CRM data silently goes stale with no way to detect it | Not required for v1, but should be a known, named gap (not an accidental omission) — flag as a phase-2 candidate |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Tier-1 web-presence classification:** Often missing the explicit field-mask confirmation that `websiteUri` is actually requested — verify the field mask on every Text Search call, not just assume it's included.
- [ ] **Pagination:** Often missing retry/backoff on `nextPageToken` — verify with a query expected to return >20 results, not just a low-count smoke test.
- [ ] **Lima market support:** Often missing `languageCode`/`regionCode` wiring — verify by comparing Toronto vs. Lima result quality/count for an equivalent category, not just "the location string was accepted."
- [ ] **CRM persistence layer:** Often missing an explicit, documented decision on what Places content is durably stored vs. re-fetched-on-demand — verify `docs/decisions.md`/`.planning/PROJECT.md` has this decision recorded, not just implemented ad hoc in the schema.
- [ ] **Attribution:** Often missing the required Google Maps logo/attribution on the leads table UI (a map-less display of Places content) — verify against the current Places API policies page before shipping any UI that lists scraped businesses.
- [ ] **Job error/partial states:** Often missing real handling of pagination timeout/failure mid-job — verify a job that hits the 60-result cap or a pagination `INVALID_REQUEST` surfaces a real, non-silent status rather than an incomplete "done."

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Persistence model found to violate ToS after data already stored | MEDIUM | Migrate schema to store `place_id` + first-party fields only; add a re-fetch-on-view layer for display fields; purge durably-stored Google content beyond `place_id` |
| False-positive "no website" leads discovered after outreach has started | LOW | Add a Place Details verification call (or manual spot-check) before a lead surfaces as "contactable"; backfill-verify existing tier-1 leads in the DB |
| Discovered Enterprise-tier billing far exceeds MVP budget assumptions | LOW-MEDIUM | Narrow scrape scope (fewer categories/locations per run), add explicit per-job cost estimation before execution, set Cloud Billing alerts/caps |
| 60-result cap silently truncated historical job data | LOW | Re-run affected jobs with narrower sub-queries; since dedup is per-job (`unique(job_id, place_id)`), a re-run job naturally supplements rather than corrupts existing data |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| ToS-conflicting persistence model (Pitfall 1) | Spec/schema-design step, before Phase 1 build starts | `.planning/PROJECT.md` Key Decisions table has an explicit, reasoned entry on Places content storage scope |
| "No website field" treated as fact, not signal (Pitfall 2) | Phase covering scrape + tier-1 classification | UI/export copy reviewed for "found on Google" framing; sample false-positive check run before wider outreach |
| Enterprise-tier `websiteUri` pricing (Pitfall 3) | Phase covering Places API integration, cost estimation | Cost model in planning docs cites Enterprise-tier rate, not Essentials |
| 60-result cap + pagination token delay (Pitfall 4) | Phase covering scrape job execution / job runner | Test against a genuinely dense query; retry/backoff present in pagination code |
| Language/region defaults under-serving Lima (Pitfall 5) | Phase covering Places API integration (same as Pitfall 4) | Toronto vs. Lima test run comparison shows comparable relative coverage/quality |
| CRM staleness / no re-scrape path | Explicitly deferred (phase 2+) per PROJECT.md Out of Scope | Documented as a known, named gap rather than silent omission |

## Sources

- [Text Search (New) | Places API | Google for Developers](https://developers.google.com/maps/documentation/places/web-service/text-search) — HIGH confidence, official docs; confirmed 60-result cap, 20/page pagination, `languageCode`/`regionCode` support, field mask syntax
- [Place Data Fields (New) | Places API | Google for Developers](https://developers.google.com/maps/documentation/places/web-service/data-fields) — HIGH confidence, official docs; confirmed `websiteUri` is Enterprise-tier SKU across Text Search/Nearby Search/Place Details
- [Policies and attributions for Places API | Google for Developers](https://developers.google.com/maps/documentation/places/web-service/policies) — HIGH confidence, official docs; caching restrictions, place_id exemption, attribution requirements for map-less display
- [Google Maps Platform Service Specific Terms | Google Cloud](https://cloud.google.com/maps-platform/terms/maps-service-terms) — HIGH confidence, official ToS; "No Caching" clause, 30-day lat/lng exception
- [Places API Usage and Billing | Google for Developers](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) — HIGH confidence, official docs; SKU/tier billing model (highest-SKU-wins rule)
- [Google Places API Limits in 2026: Complete Reference | MapsLeads](https://www.mapsleads.co/blog/google-places-api-limits-2026-complete-reference) — MEDIUM confidence, third-party; corroborated pagination token delay behavior
- [PIPEDA requirements in brief — Office of the Privacy Commissioner of Canada](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/) — HIGH confidence, official regulator source
- [Contact Information Posted on Websites Not Necessarily Up for Grabs — McMillan LLP](https://mcmillan.ca/insights/contact-information-posted-on-websites-not-necessarily-up-for-grabs/) — MEDIUM confidence, legal-practitioner analysis; business-contact-info exemption limits, Grey House case
- [Ley N° 29733 — Ley de Protección de Datos Personales (Peru, official gazette text)](https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23) — HIGH confidence, primary legal source
- [Las personas naturales con negocio son protegibles por la Ley de datos personales — Observatorio Iberoamericano de Protección de Datos](http://oiprodat.com/2015/05/18/las-personas-naturales-con-negocio-son-protegibles-por-la-ley-de-datos-personales/) — MEDIUM confidence, legal-commentary source; sole-proprietor coverage under Peru's law
- [Se publica el nuevo reglamento de protección de datos personales en Perú — IAPP](https://iapp.org/news/a/se-publica-el-nuevo-reglamento-de-protecci-n-de-datos-personales-en-per-) — MEDIUM-HIGH confidence, professional privacy-industry source; Nov 2024 regulation update
- [Peru Address Format With Examples — PostGrid](https://www.postgrid.com/global-address-format/peru-address-format/) — MEDIUM confidence, address-formatting reference; jirón/urbanización/manzana-lote structure
- [Addressing guidelines — Postal codes | Canada Post](https://www.canadapost-postescanada.ca/cpc/en/support/articles/addressing-guidelines/postal-codes.page) — HIGH confidence, official postal authority
- [Web Scraping for Lead Gen: Build Your Own B2B Database — Scrapfly](https://scrapfly.io/blog/posts/how-to-scrape-leads) — MEDIUM confidence, third-party industry source; scraped-CRM staleness/dedup patterns
- [Duplicate Record Management in CRM — Databar.ai](https://databar.ai/blog/article/duplicate-record-management-in-crm-the-hidden-revenue-killer-and-how-to-fix-thousands-fast) — MEDIUM confidence, industry source; duplicate/data-decay figures

---
*Pitfalls research for: findleads (Google Places API lead-gen + web-presence filtering + lightweight CRM, Toronto + Lima, Peru)*
*Researched: 2026-07-02*
