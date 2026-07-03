---
phase: 05-crm-leads-dashboard
verified: 2026-07-03T16:35:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gap_resolution:
  truth: "Richard can view a leads list backed by businesses data, showing tier-1 status, contacted flag, and notes (CRM-01)"
  fix_commit: "1d9b12d"
  fix: "Added `export const dynamic = 'force-dynamic'` to app/leads/page.tsx, matching app/jobs/page.tsx's existing fix for the identical live-DB-read pattern."
  reverified: "pnpm build route table now lists /leads as 'ƒ (Dynamic)' (was '○ (Static)'); full suite re-run 23 files/103 tests passing, typecheck clean, lint clean, applied directly after this report — see body for original gap analysis, kept for record."
addendum:
  found_via: "manual production-build walkthrough (next build && next start + browser automation), after this report was written"
  gap: "JobStatusPoller's status badge updated live via SWR client state, but leadsFound/resultCapHit/Export CSV link are server-rendered from the initial rows array in app/jobs/page.tsx — they stayed stale until an unrelated page reload after the badge flipped to a terminal status."
  fix_commit: "b1037b3"
  fix: "JobStatusPoller calls router.refresh() once when it observes a terminal status transition, mirroring JobForm.tsx's existing pattern."
  reverified: "Live end-to-end: created a real job, watched it reach done, confirmed leadsFound and a working Export CSV link appeared automatically with zero manual reload. Full suite re-run 103/103, typecheck/lint/build clean."
  scope_note: "Golden path (create -> poll -> done -> leads render -> notes/contacted persist -> SCRAPE-07 message -> CSV export) is live-verified. Error/empty-list/JOB-06 zero-result render paths remain code-read-verified only, not exercised live."
---

# Phase 5: CRM Leads Dashboard Verification Report

**Phase Goal:** Richard can review, manage, and act on scraped leads through a leads list, notes, contacted-status tracking, and job history — with proper Google attribution. (Final phase of the MVP roadmap.)
**Verified:** 2026-07-03T16:35:00Z
**Status:** passed (gap found and fixed same-session — see `gap_resolution` in frontmatter; commit `1d9b12d`)
**Re-verification:** No — initial verification found 1 gap (CRM-01, below), fixed immediately, re-checked directly (not a full re-spawn) via `pnpm build`/`pnpm test`/`pnpm typecheck`/`pnpm lint`, all green

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SCRAPE-07: cap-hit message renders off a genuine `resultCapHit` signal, not the old `leadsFound>=60` heuristic | ✓ VERIFIED | `lib/jobs/runScrapeJob.ts:46` computes `capHit` from raw `pagesFetched`/`response.nextPageToken` *before* `mapPlaceToLead`'s closed-business filter runs (line 49-51); persisted at `runScrapeJob.ts:124` (`resultCapHit: cursor.capHit`) on the final `done` write; rendered at `app/jobs/page.tsx:47` off `r.resultCapHit`, verbatim copy "60+ results found, showing first 60 — refine your search." Unit tests in `tests/unit/lib/jobs/runScrapeJob.test.ts` prove capHit=true survives even when the same page's closed-business content drops `leadsFound` below 60 |
| 2 | CRM-01: Richard can view a leads list backed by `businesses` data (tier-1 status, contacted flag, notes) | ✗ FAILED | `app/leads/page.tsx` renders correctly *when invoked*, but the route is statically prerendered at build time (confirmed via `pnpm build`: `/leads` listed `○ (Static)`) with no `force-dynamic`/revalidation trigger tied to new scrape data — see Gaps Summary |
| 3 | CRM-02/03/04: notes add/edit and contacted toggle persist, each timestamped (`updatedAt`) so staleness is visible | ✓ VERIFIED | `app/leads/actions.ts` — `updateNotesAction`/`setContactedAction` validate via zod, call `updateBusinessNotes`/`setBusinessContacted` (`lib/db/businesses.ts:58-70`, both set `updatedAt: new Date()` in the same `.set()` call), then `revalidatePath('/leads')` (confirmed present, `actions.ts:34,51`) — this explicit revalidation is what makes CRM-02/03/04 actually reflect post-edit, independent of the CRM-01 static-shell gap. `tests/integration/db/businesses.test.ts` proves `updatedAt` strictly increases across repeat calls; `tests/unit/app/leads/actions.test.ts` (9 cases) proves both valid/invalid paths for both actions, including the caught `z.coerce.boolean()` inversion bug fixed before shipping |
| 4 | CRM-05: Richard can view job history (status, category/location, leads found, created_at) | ✓ VERIFIED | `app/jobs/page.tsx` renders `listJobs()` (`lib/db/jobs.ts:28-30`, ordered `createdAt` desc) in a table with all required columns; route confirmed `ƒ (Dynamic)` in `pnpm build` output (force-dynamic present, `app/jobs/page.tsx:8`), so this page — unlike `/leads` — genuinely reflects live DB state on every request |
| 5 | Non-terminal jobs are actively polled client-side so JOB-04/JOB-05 stay reachable | ✓ VERIFIED | `app/jobs/JobStatusPoller.tsx` uses `useSWR` with `refreshInterval` callback that returns `0` once `isTerminalStatus` (`app/jobs/isTerminalStatus.ts`) is true, `null` key when already terminal on mount — unit-tested (`tests/unit/app/jobs/JobStatusPoller.test.ts`, 5/5 passing, confirmed independently) |
| 6 | SEC-03: Google Maps attribution shown on any UI displaying Places content, including the map-less leads table | ✓ VERIFIED | `components/GoogleAttribution.tsx` renders literal `"Google Maps"` text (not "Powered by Google"), 12px (`text-xs`), gray; wired into `app/layout.tsx:41-43` directly below the nav and above `{children}` — inherited by both `/leads` and `/jobs` automatically, confirmed by reading the rendered layout tree |

**Score:** 6/7 truths verified (1 present-but-functionally-broken: CRM-01)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/db/businesses.ts` | listBusinesses/updateBusinessNotes/setBusinessContacted | ✓ VERIFIED | All three exported, wired, `updatedAt` discipline present |
| `lib/db/jobs.ts` | listJobs; updateJobProgress accepts resultCapHit | ✓ VERIFIED | Present, optional `resultCapHit` only spread into `.set()` when passed |
| `lib/db/schema.ts` | `jobs.resultCapHit` boolean column | ✓ VERIFIED | Additive, `NOT NULL DEFAULT false`, migration `drizzle/0002_cute_maddog.sql` |
| `lib/jobs/checkpoint.ts` | `JobCursor.capHit` field | ✓ VERIFIED | Present, initialized `false`, monotonic carry-forward |
| `lib/jobs/runScrapeJob.ts` | computes/persists capHit pre-filter | ✓ VERIFIED | Confirmed by direct code read, line 46 |
| `components/GoogleAttribution.tsx` | "Google Maps" text component | ✓ VERIFIED | Exact copy, 12px, no link |
| `app/layout.tsx` | two-tab nav + attribution wired in | ✓ VERIFIED | Nav links `/leads`, `/jobs`; attribution above `{children}` |
| `app/leads/page.tsx` | Leads table Server Component | ⚠️ HOLLOW (data-flow) | Exists, substantive, wired to `listBusinesses()` — but statically prerendered, so new DB rows don't flow to it in production without an unrelated cache-busting action (see Data-Flow Trace) |
| `app/leads/actions.ts` | updateNotesAction, setContactedAction | ✓ VERIFIED | zod-validated, delegate to DAL, revalidate `/leads` |
| `app/leads/ContactedToggle.tsx`, `NotesField.tsx` | Client Component form wrappers | ✓ VERIFIED | `useActionState`-wrapped, correctly invoke Server Actions |
| `app/page.tsx` | redirect to `/leads` | ✓ VERIFIED | `redirect('/leads')`, no create-next-app boilerplate |
| `app/jobs/page.tsx` | Job History Server Component | ✓ VERIFIED | `force-dynamic`, all required columns, SCRAPE-07/JOB-06/error-state copy |
| `app/jobs/JobForm.tsx` | job-creation form | ✓ VERIFIED | POSTs to `/api/jobs`, `router.refresh()` on success |
| `app/jobs/JobStatusPoller.tsx` + `isTerminalStatus.ts` | client poller | ✓ VERIFIED | swr-based, correctly stops on terminal status |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/leads/page.tsx` | `listBusinesses()` | direct `await` call in Server Component | ✓ WIRED (render) / ✗ NOT LIVE (production) | Renders correctly per-request in dev; statically cached per-build in production — see Data-Flow Trace |
| notes textarea `onBlur` | `updateBusinessNotes` | `NotesField.tsx` → `useActionState(updateNotesAction)` → `revalidatePath('/leads')` | ✓ WIRED | Full round trip confirmed by code read + passing unit tests |
| contacted button | `setBusinessContacted` | `ContactedToggle.tsx` → `useActionState(setContactedAction)` → `revalidatePath('/leads')` | ✓ WIRED | Same as above; `z.enum(['true','false']).transform` correctly avoids the `z.coerce.boolean()` inversion bug |
| `runScrapeJob.ts`'s `defaultFetchOnePage` cap-hit computation | `jobs.resultCapHit` column | `cursor.capHit` → final `updateJobProgress('done', {resultCapHit})` | ✓ WIRED | Confirmed in code, unit-tested |
| `app/jobs/page.tsx` | `listJobs()` / `resultCapHit` | direct `await` call, `force-dynamic` | ✓ WIRED and LIVE | Confirmed `ƒ (Dynamic)` in build output |
| `JobStatusPoller` | `GET /api/jobs/[id]` | `useSWR` polling | ✓ WIRED | Confirmed via code read; stops correctly on terminal status |
| `JobForm` | `POST /api/jobs` | `fetch` + `router.refresh()` | ✓ WIRED | Confirmed via code read |
| `app/layout.tsx` | `/leads`, `/jobs` | `next/link` | ✓ WIRED | Both routes present in nav |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `app/jobs/page.tsx` | `rows` (from `listJobs()`) | Real Drizzle query, `force-dynamic` forces per-request execution | Yes | ✓ FLOWING |
| `app/leads/page.tsx` | `rows` (from `listBusinesses()`) | Real Drizzle query, but the *route* is statically prerendered (`pnpm build` confirms `○ Static`) with no `force-dynamic` and no revalidation tied to the scrape/business-upsert path | No (in production) | ⚠️ STATIC — build-time snapshot only, refreshed solely as an incidental side effect of an unrelated `/leads`-scoped Server Action (`updateNotesAction`/`setContactedAction`), never by the scrape pipeline itself |

**Repo-wide check performed:** `grep -rn "revalidatePath\|revalidateTag" app/ lib/` returns exactly two hits, both in `app/leads/actions.ts` (lines 34, 51). `POST /api/jobs` (`app/api/jobs/route.ts`) and the worker (`lib/jobs/runScrapeJob.ts`) contain none. This confirms the gap is not hypothetical: nothing in the scrape-completion path invalidates the `/leads` page's cache.

### Behavioral Spot-Checks / Test Execution (run directly by this verifier, not trusted from SUMMARY claims)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Full test suite | `pnpm test -- --run` | 23 files / 103 tests passed | ✓ PASS |
| Typecheck | `pnpm typecheck` | No output (clean) | ✓ PASS |
| Lint | `pnpm lint` | No output (clean) | ✓ PASS |
| Production build | `pnpm build` | Compiled successfully; route table shows `/leads` as `○ (Static)`, `/jobs` as `ƒ (Dynamic)` | ✓ PASS (build succeeds) / ⚠️ reveals the CRM-01 gap above |
| `isTerminalStatus`/`JobStatusPoller` unit test (isolated re-run) | `pnpm test -- tests/unit/app/jobs/JobStatusPoller.test.ts --run` | 5/5 passing, no `createContext` error (the transient failure logged in `deferred-items.md` during concurrent Wave-2 execution is confirmed resolved) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCRAPE-07 | 05-01, 05-04 | UI surfaces cap-hit messaging off a genuine signal | ✓ SATISFIED | See Truth #1 |
| CRM-01 | 05-03 | Leads list view reads from businesses, tier/contacted/notes | ✗ BLOCKED | Renders correctly, but not reliably fed fresh data in production (static route) — see Gaps Summary |
| CRM-02 | 05-03 | Add/edit freeform notes | ✓ SATISFIED | See Truth #3 |
| CRM-03 | 05-03 | Toggle contacted/not-contacted | ✓ SATISFIED | See Truth #3 |
| CRM-04 | 05-03 | Changes timestamped (`updated_at`) | ✓ SATISFIED | See Truth #3 |
| CRM-05 | 05-04 | Job history view | ✓ SATISFIED | See Truth #4 |
| SEC-03 | 05-02 | Google Maps attribution on Places-content UI | ✓ SATISFIED | See Truth #6 |

No orphaned requirements found — all 7 IDs mapped to this phase in REQUIREMENTS.md are claimed by one of the four plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TODO`/`FIXME`/`HACK`/`PLACEHOLDER`/`TBD`/`XXX` markers found in any phase-5-modified file (`app/leads/*`, `app/jobs/*`, `app/layout.tsx`, `app/page.tsx`, `components/GoogleAttribution.tsx`, `lib/db/*`, `lib/jobs/*`) | — | — |
| `app/leads/page.tsx` | (whole file) | Missing `export const dynamic = 'force-dynamic'` | 🛑 Blocker | Root cause of the CRM-01 gap above |

**Non-blocking, informational only:** commit `c94d9cd` blends 05-03's and 05-04's Task-2 file changes due to a documented concurrent-execution git race (no worktree isolation across Wave 2). Both SUMMARYs disclose this explicitly and independently confirmed via `git show --stat` that all files landed with correct, complete content and no data loss — this is a commit-attribution/history-hygiene issue only, not a functional gap, and is not counted as a blocker per the executor's own transparent documentation of it.

### Human Verification Required

None required beyond the fix-and-recheck below — this gap is deterministically provable from `pnpm build`'s own route table and a repo-wide `grep`, not something needing subjective human judgment.

### Gaps Summary

**One blocking gap, on the single most important page of the whole MVP.** `app/leads/page.tsx` — the primary "review your leads" screen that Phase 5, and the entire MVP roadmap, exists to deliver — is statically prerendered by Next.js because it reads `listBusinesses()` directly with no `force-dynamic` export. Its sibling page, `app/jobs/page.tsx`, hit the exact same architectural trap in the same plan wave and was explicitly fixed (05-04-SUMMARY.md documents adding `force-dynamic` for exactly this reason: "a job history table showing permanently stale data is a correctness bug for a page whose entire purpose is live status"). That same reasoning applies identically to `/leads`, but the fix was never applied there.

Confirmed mechanism, not speculation:
1. `pnpm build` (run directly, not trusted from any SUMMARY) shows `/leads` as `○ (Static)` and `/jobs` as `ƒ (Dynamic)`.
2. A repo-wide `grep -rn "revalidatePath\|revalidateTag"` shows the *only* calls anywhere in the codebase are in `app/leads/actions.ts`'s two notes/contacted Server Actions.
3. The scrape pipeline (`POST /api/jobs` → `after(runScrapeJob)` → `upsertBusiness`) never calls `revalidatePath`/`revalidateTag` for `/leads`.
4. Net effect in a production deploy: newly scraped businesses do not appear on `/leads` until some unrelated notes-edit or contacted-toggle happens to fire on any business first (which incidentally revalidates the whole page) — and on the very first scrape (empty `businesses` table at build time), there is nothing yet to edit, so the page can show "No leads yet" indefinitely even after real leads exist in the database.

This is exactly the class of bug that's invisible to `pnpm dev` (Next dev always re-renders per request, bypassing the Full Route Cache) and to the unit/integration suite (no test renders the page through a production build). Every deferred manual-verification note in 05-02-SUMMARY.md and 05-03-SUMMARY.md was necessarily run against a dev server, which is why it was never caught.

**Fix:** add `export const dynamic = 'force-dynamic'` to `app/leads/page.tsx` (one line, matching `app/jobs/page.tsx`'s existing fix), then re-run `pnpm build` and confirm `/leads` lists as `ƒ (Dynamic)`.

**Everything else in this phase is genuinely solid:** SCRAPE-07 correctly reads off the real `resultCapHit` signal (not the superseded heuristic); CRM-02/03/04 are wired end-to-end and DO reflect changes immediately (their own `revalidatePath('/leads')` calls cover that path); CRM-05/SEC-03 are fully verified; the full test suite (103/103), typecheck, and lint are all clean; no anti-pattern debt markers exist anywhere in this phase's code. The MVP is one one-line fix away from being complete — but it is not complete yet, and this defect sits on the single page the entire MVP is meant to deliver.

---

*Verified: 2026-07-03T16:35:00Z*
*Verifier: Claude (gsd-verifier)*
