# Phase 5 Validation Plan (Nyquist)

Derived from `05-RESEARCH.md`'s Validation Architecture, mapped onto the final plan/task breakdown (`05-01`..`05-04-PLAN.md`).

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (existing, unchanged) |
| Config | `vitest.config.ts` — `environment: 'node'`, `conditions: ['react-server']` (resolve + ssr.resolve) |
| Constraint | Async Server Components (`app/leads/page.tsx`, `app/jobs/page.tsx`) and client components (`JobStatusPoller`, `JobForm`) are **not renderable** under this project's Vitest setup — official Next.js docs confirm Vitest does not support rendering `async` Server Components, and `react-server` condition conflicts with `jsdom`. Do not add `@testing-library/react`/`jsdom` for this phase (would require a second, isolated `test.projects` entry not justified by this phase's scope). Pages/client components are manual-verify only. |

## Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | Owning Plan/Task |
|--------|----------|-----------|--------------------|------------------|
| CRM-01 | `listBusinesses()` returns rows tier-derivable from `website` | integration | `pnpm test -- tests/integration/db/businesses.test.ts` | 05-01 Task 1 |
| CRM-01 | Leads table renders tier badge/rows from real data | manual | `/run` visual check on `/leads` | 05-03 Task 2 (`<human-check>`) |
| CRM-02 | `updateBusinessNotes()` persists notes | integration | `pnpm test -- tests/integration/db/businesses.test.ts` | 05-01 Task 1 |
| CRM-02 | `updateNotesAction` validates + delegates correctly | unit (mocked DAL) | `pnpm test -- tests/unit/app/leads/actions.test.ts` | 05-03 Task 1 |
| CRM-03 | `setBusinessContacted()` persists contacted | integration | `pnpm test -- tests/integration/db/businesses.test.ts` | 05-01 Task 1 |
| CRM-03 | `setContactedAction` validates + delegates correctly | unit (mocked DAL) | `pnpm test -- tests/unit/app/leads/actions.test.ts` | 05-03 Task 1 |
| CRM-04 | Both mutations bump `updatedAt` on every call | integration | `pnpm test -- tests/integration/db/businesses.test.ts` | 05-01 Task 1 |
| CRM-05 | `listJobs()` returns all jobs ordered by `createdAt` desc | integration | `pnpm test -- tests/integration/db/jobs.test.ts` | 05-01 Task 1 |
| CRM-05 | Job History table renders status/category/location/leadsFound/createdAt | manual | `/run` visual check on `/jobs` | 05-04 Task 3 (`<human-check>`) |
| SCRAPE-07 | `resultCapHit` computed from raw pagination signal, survives closed-business filtering | unit | `pnpm test -- tests/unit/lib/jobs/runScrapeJob.test.ts tests/unit/lib/jobs/checkpoint.test.ts` | 05-01 Task 2 |
| SCRAPE-07 | Cap-hit message renders verbatim on a capped job's row | automated grep + manual | `grep -c "60+ results found, showing first 60" app/jobs/page.tsx`; manual confirmation against a real dense-category query | 05-04 Task 3 |
| SEC-03 | Attribution text "Google Maps" present, correctly styled, not "Powered by Google" | automated grep | `grep -c "Google Maps" components/GoogleAttribution.tsx` (present); repo-wide `grep -rc "Powered by Google"` (must be 0) | 05-02 Task 1 |
| SEC-03 | Attribution visually adjacent to Places content on every page | manual | `/run` visual check on both `/leads` and `/jobs` | 05-02 Task 2 (`<human-check>` deferred to phase-end per plans 05-03/05-04 existing) |
| (functional need) | Non-terminal job actively polled via `GET /api/jobs/[id]` so JOB-04/JOB-05 fire | unit (pure helper) + manual | `pnpm test -- tests/unit/app/jobs/JobStatusPoller.test.ts`; manual live-progression check | 05-04 Task 2/3 |

## Sampling Rate

- **Per task commit:** `pnpm test -- <changed test file>` (per-task `<verify><automated>` commands above)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green, `pnpm typecheck`, `pnpm build`, plus one manual `/run` pass over `/leads` and `/jobs` covering: empty states, notes autosave, contacted toggle, job submission + live status progression, SCRAPE-07 cap message, CSV export link, and attribution placement on both pages.

## Wave 0 Gaps (must exist before their owning task can be marked done)

- [ ] `tests/integration/db/jobs.test.ts` — new file (05-01 Task 1)
- [ ] `tests/unit/app/leads/actions.test.ts` — new file (05-03 Task 1)
- [ ] `tests/unit/app/jobs/JobStatusPoller.test.ts` — new file (05-04 Task 2)
- [ ] Extension of `tests/integration/db/businesses.test.ts` (05-01 Task 1)
- [ ] Extension of `tests/unit/lib/jobs/runScrapeJob.test.ts` and/or `tests/unit/lib/jobs/checkpoint.test.ts` for the `resultCapHit` signal (05-01 Task 2)

## Untestable-by-design (manual-only, justified)

- `app/leads/page.tsx`, `app/jobs/page.tsx` — async Server Components; Vitest/Next.js official docs confirm no supported rendering path this session.
- `JobStatusPoller`/`JobForm` rendered output (beyond the extracted pure `isTerminalStatus` helper) — client components requiring a `jsdom` condition incompatible with this project's `react-server`-conditioned Vitest config.
- Visual/placement correctness of Google attribution — a layout/CSS concern, not a logic concern; verified by `/run` visual check, not unit test.

---
*Validation plan for: findleads Phase 5 (CRM Leads Dashboard)*
*Derived from: 05-RESEARCH.md Validation Architecture, cross-referenced against final 05-01..05-04-PLAN.md task IDs*
