---
phase: 05-crm-leads-dashboard
plan: 04
subsystem: ui
tags: [nextjs, swr, client-polling, jobs, scrape-07, crm-05]

requires:
  - phase: 05-crm-leads-dashboard (05-01)
    provides: "lib/db/jobs.ts listJobs(), jobs.resultCapHit column"
  - phase: 05-crm-leads-dashboard (05-02)
    provides: "app/layout.tsx two-tab nav (Leads/Job History), GoogleAttribution"
  - phase: 04-job-lifecycle-continuation-watchdog
    provides: "GET /api/jobs/[id] (JOB-04 claimPartialJob, JOB-05 flagStaleJob), GET /api/jobs/[id]/export"
  - phase: 03-job-creation-checkpointed-worker
    provides: "POST /api/jobs"
provides:
  - "app/jobs/page.tsx: async Server Component job history table (CRM-05)"
  - "app/jobs/JobForm.tsx: client job-creation form posting to POST /api/jobs"
  - "app/jobs/JobStatusPoller.tsx + app/jobs/isTerminalStatus.ts: swr-based client poller keeping GET /api/jobs/[id] alive for non-terminal jobs"
  - "swr@2.4.2 dependency (exact-pinned)"
affects: []

tech-stack:
  added: ["swr@2.4.2"]
  patterns:
    - "A component's pure/testable logic is split into its own directive-free module when the component itself carries an import (here: swr) that cannot resolve under this project's Vitest `conditions: ['react-server']` setup — app/jobs/isTerminalStatus.ts is the reusable shape for this."
    - "Any Server Component that reads live/mutable DB state directly (not via a dynamic API like cookies()/headers()) needs an explicit `export const dynamic = 'force-dynamic'` — Next.js does not infer this from a raw Drizzle query and will otherwise attempt to statically prerender the route at build time."

key-files:
  created:
    - app/jobs/page.tsx
    - app/jobs/JobForm.tsx
    - app/jobs/JobStatusPoller.tsx
    - app/jobs/isTerminalStatus.ts
    - tests/unit/app/jobs/JobStatusPoller.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Checkpoint (Task 1, swr package-legitimacy) auto-approved under the session's standing pre-authorization for this exact pre-vetted class of checkpoint, but only after running the independent verification myself: `npm view swr` confirmed repository = github.com/vercel/swr and latest = 2.4.2; api.npmjs.org confirmed 12,208,080 weekly downloads (matches 05-RESEARCH.md's own figure exactly); .planning/research/STACK.md independently recommends swr@2.4.2 for this exact GET /api/jobs/:id polling use case. Installed with `pnpm add -E swr@2.4.2` (exact pin, matching the plan's stated version and this project's existing exact-pin convention for other deps)."
  - "isTerminalStatus split into its own directive-free module (app/jobs/isTerminalStatus.ts) rather than only living inside JobStatusPoller.tsx — see Deviations."
  - "Added `export const dynamic = 'force-dynamic'` to app/jobs/page.tsx (not explicit in the plan's <action> text) — see Deviations."
  - "JobStatusPoller's badge color for an already-`done` row with no poll response yet (key=null since it's terminal on mount) defaults to the green (non-zero) badge color, since the fixed `{jobId, initialStatus}` signature carries no leadsFound. This is a documented, deliberate visual-only limitation: the JOB-06 zero-result heading/body copy in app/jobs/page.tsx is driven by the real `r.leadsFound` from listJobs() and is always correct regardless of the badge."

patterns-established:
  - "Client components wrapping a third-party hook library get their pure/testable helpers extracted to a sibling module with no 'use client' directive, so unit tests can import the helper without pulling the library through Vitest's react-server-conditioned module resolution."

requirements-completed: [CRM-05, SCRAPE-07]

coverage:
  - id: D1
    description: "Job History page (app/jobs/page.tsx) lists every job (status, category, location, leadsFound, createdAt) via listJobs(), CRM-05"
    requirement: "CRM-05"
    verification:
      - kind: manual_procedural
        ref: "Created a real job via POST /api/jobs (bakery/Toronto), observed status progress pending -> running -> done via GET /api/jobs/[id] polling, confirmed the row rendered on /jobs with all five columns plus Export CSV link once done"
        status: pass
    human_judgment: false
  - id: D2
    description: "SCRAPE-07 cap-hit message ('60+ results found, showing first 60 — refine your search.') renders on a job row when jobs.resultCapHit is true, not off the old leads_found>=60 heuristic"
    requirement: "SCRAPE-07"
    verification:
      - kind: manual_procedural
        ref: "Temporarily set result_cap_hit=true via direct DB update on the real test job (leadsFound=60, which itself had NOT tripped the flag naturally, proving the UI truly reads the column and not a >=60 fallback), confirmed the verbatim message rendered, then reverted the column back to false"
        status: pass
      - kind: other
        ref: "grep -c \"60+ results found, showing first 60\" app/jobs/page.tsx == 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "JOB-06 zero-result copy and job error-state copy render correctly on their respective job states"
    verification:
      - kind: manual_procedural
        ref: "Flipped the same real job to status='error' with an error_reason, confirmed 'This job failed.' + reason text rendered; flipped to status='done'+leadsFound=0, confirmed '0 leads found.' + broaden-search copy rendered; reverted to original done/60/no-cap state afterward"
        status: pass
    human_judgment: false
  - id: D4
    description: "isTerminalStatus correctly classifies all five job statuses and JobStatusPoller never polls (key=null) once initialStatus is already done/error; no @testing-library/react or jsdom dependency added"
    verification:
      - kind: unit
        ref: "tests/unit/app/jobs/JobStatusPoller.test.ts#isTerminalStatus returns true for done, true for error, false for pending/running/partial"
        status: pass
      - kind: other
        ref: "grep -c \"@testing-library/react\\|jsdom\" package.json == 0 (not added)"
        status: pass
    human_judgment: false
  - id: D5
    description: "app/jobs/page.tsx is never statically prerendered — force-dynamic added so the live job table always reads fresh DB state"
    verification:
      - kind: other
        ref: "pnpm build output: '/jobs' listed as 'ƒ (Dynamic)', not '○ (Static)'"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-07-03
status: complete
---

# Phase 5 Plan 4: Job History Page + Live Status Poller Summary

**Job History page (app/jobs/page.tsx) with a job-creation form and a swr-based client poller (JobStatusPoller) that keeps GET /api/jobs/[id] alive for every non-terminal row, rendering the SCRAPE-07 cap-hit notice off jobs.resultCapHit rather than the superseded leads_found>=60 heuristic.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-03T20:11:00Z
- **Completed:** 2026-07-03T20:20:15Z
- **Tasks:** 3 (1 checkpoint, 2 auto)
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- Verified and approved the `swr` package-legitimacy checkpoint independently (`npm view swr`, `api.npmjs.org/downloads`), then installed `swr@2.4.2` exact-pinned
- `app/jobs/isTerminalStatus.ts` + `app/jobs/JobStatusPoller.tsx`: a `'use client'` poller using `useSWR` with `refreshInterval` that stops once a job's status is terminal, keeping Phase 4's JOB-04 (partial-job continuation) and JOB-05 (stale-job watchdog) reachable for any job Richard is currently viewing
- `app/jobs/JobForm.tsx`: client form posting `{category, location}` to the existing `POST /api/jobs`, `router.refresh()` on success
- `app/jobs/page.tsx`: async Server Component reading `listJobs()`, rendering the full CRM-05 table (status badge, category, location, leadsFound, createdAt, Export CSV link), the SCRAPE-07 cap-hit notice off `resultCapHit`, and the JOB-06 zero-result / job error-state copy — `force-dynamic` added so this live table is never baked in at build time
- End-to-end verified against the real dev DB and a real Places API scrape: created a job, watched it progress pending → running → done, then exercised all four row-state branches (cap-hit, zero-result, error, normal-done) via targeted, reverted DB writes

## Task Commits

1. **Task 1: Package legitimacy check for swr** — no commit (checkpoint; verified independently, approved per session's standing pre-authorization for this exact class of checkpoint)
2. **Task 2: Install swr + app/jobs/JobStatusPoller.tsx**
   - `4fec1bf` (test) — failing test importing `isTerminalStatus` (module didn't exist yet)
   - Swept into `c94d9cd` (feat, 05-03's commit) — see Deviations: a concurrent-agent git race committed this task's GREEN changes (package.json, pnpm-lock.yaml, app/jobs/JobStatusPoller.tsx, app/jobs/isTerminalStatus.ts, the corrected test file) under 05-03's commit message instead of a dedicated 05-04 commit
3. **Task 3: app/jobs/JobForm.tsx + app/jobs/page.tsx** — `583b1e9` (feat)

**Plan metadata:** (this commit) `docs(05-04): complete Job History page + poller plan`

## Files Created/Modified
- `app/jobs/page.tsx` - Job History Server Component (CRM-05, SCRAPE-07, JOB-06 copy, error-state copy)
- `app/jobs/JobForm.tsx` - client job-creation form
- `app/jobs/JobStatusPoller.tsx` - client poller (swr), status badge rendering
- `app/jobs/isTerminalStatus.ts` - pure `isTerminalStatus` helper, split out so it's unit-testable without pulling `swr` through Vitest's `react-server` condition
- `tests/unit/app/jobs/JobStatusPoller.test.ts` - unit tests for `isTerminalStatus`
- `package.json` / `pnpm-lock.yaml` - `swr@2.4.2` (exact pin)

## Decisions Made
- Approved the `swr` checkpoint after independent re-verification (see key-decisions above) rather than falling back to the dependency-free `setInterval` implementation — swr's `refreshInterval` callback is exactly the "stop on terminal" behavior this plan needs, matching 05-RESEARCH.md's own recommendation.
- Split `isTerminalStatus` into its own module rather than only exporting it from `JobStatusPoller.tsx` (see Deviations — this was necessary, not stylistic).
- Added `export const dynamic = 'force-dynamic'` to `app/jobs/page.tsx` (see Deviations).
- JobStatusPoller's badge color for an already-terminal `done` row with no leadsFound data defaults to the non-zero (green) color — a deliberate, documented limitation of the plan's fixed `{jobId, initialStatus}` signature; the row's actual JOB-06 copy (driven by real `leadsFound`) is unaffected and always correct.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `isTerminalStatus` could not be tested from inside `JobStatusPoller.tsx` under this project's Vitest config**
- **Found during:** Task 2, first RED→GREEN attempt
- **Issue:** `JobStatusPoller.tsx` is `'use client'` and imports `swr`, which transitively imports React APIs (`createContext`) not provided under `vitest.config.ts`'s `conditions: ['react-server']`. Importing the file at all (even just to grab the exported pure function) threw `SyntaxError: The requested module 'react' does not provide an export named 'createContext'` before any assertion ran.
- **Fix:** Extracted `isTerminalStatus` into a new sibling file, `app/jobs/isTerminalStatus.ts` (no `'use client'`, no imports). `JobStatusPoller.tsx` imports it from there and re-exports it for external consumers; the unit test imports directly from `app/jobs/isTerminalStatus.ts`, never touching the `swr` import chain.
- **Files modified:** `app/jobs/JobStatusPoller.tsx`, `app/jobs/isTerminalStatus.ts` (new), `tests/unit/app/jobs/JobStatusPoller.test.ts`
- **Verification:** `pnpm test -- tests/unit/app/jobs/JobStatusPoller.test.ts` green (5/5); full suite green (103/103)
- **Committed in:** `c94d9cd` (see Deviation #3 below for why this landed in 05-03's commit, not a dedicated 05-04 commit)

**2. [Rule 2 - Missing Critical] `app/jobs/page.tsx` needed `export const dynamic = 'force-dynamic'`**
- **Found during:** Task 3, before running `pnpm build`
- **Issue:** The plan's `<action>` text did not mention this, but `app/jobs/page.tsx` reads live, mutable job state directly via `await listJobs()` (a raw Drizzle query), which Next.js does not recognize as a signal to skip static prerendering (unlike `cookies()`/`headers()`). Without it, `next build` would attempt to statically prerender `/jobs` and bake the DB read's result in at build time — a job history table showing permanently stale data is a correctness bug for a page whose entire purpose is live status.
- **Fix:** Added `export const dynamic = 'force-dynamic'` to `app/jobs/page.tsx`, with an inline comment explaining why.
- **Files modified:** `app/jobs/page.tsx`
- **Verification:** `pnpm build` output lists `/jobs` as `ƒ (Dynamic)` rather than `○ (Static)`
- **Committed in:** `583b1e9` (Task 3 commit)

**3. [Environmental — concurrent-agent git race, not a code deviation] Task 2's GREEN commit landed inside 05-03's commit instead of its own**
- **Found during:** Between Task 2's `git add` and the intended `git commit`
- **Issue:** This plan ran in parallel with 05-03 in the same working directory (no worktree isolation). After I staged exactly `package.json pnpm-lock.yaml app/jobs/JobStatusPoller.tsx app/jobs/isTerminalStatus.ts tests/unit/app/jobs/JobStatusPoller.test.ts` via explicit pathspec, the concurrent 05-03 agent committed (`c94d9cd`) before I ran my own `git commit`. Its commit swept in my already-staged index entries — `git status` immediately after showed all five of my files as already committed under 05-03's message, with nothing left for me to commit for Task 2.
- **Fix:** No history rewrite was attempted (rebase/reset/amend on a shared, concurrently-active repo is prohibited by this executor's own protocol and would risk destroying 05-03's work). Verified the actual file contents landed correctly and completely (confirmed via `git show --stat c94d9cd` and `git diff HEAD -- <each file>` showing no residual diff) — no data was lost, only commit attribution/granularity was affected. For Task 3, re-verified `git status --short` immediately before staging (showed only my own untracked files) and staged+committed in the same tool call to minimize the race window; Task 3's commit (`583b1e9`) is clean and contains exactly its own two files.
- **Files modified:** None beyond what Task 2 already produced
- **Verification:** `git show --stat c94d9cd` confirms all 5 Task 2 files present with correct final content; `git show --stat 583b1e9` confirms only Task 3's 2 files
- **Committed in:** N/A (attribution issue, not a code change)

---

**Total deviations:** 3 (2 auto-fixed — Rule 3 blocking, Rule 2 missing-critical; 1 environmental/git-attribution, no code impact)
**Impact on plan:** All functional deliverables are present, correct, and verified end-to-end against the real dev DB and a real Places API scrape. The only externally-visible artifact of the git race is that Task 2's commit hash in the history is `c94d9cd` (05-03's message) rather than a dedicated `feat(05-04): ...` commit — documented here for traceability; no functionality is missing or incorrect as a result.

## Issues Encountered
- See Deviation #3 above (concurrent-agent git race). No other issues — `pnpm typecheck`, `pnpm build`, and the full `pnpm test` suite (103/103) all passed cleanly on the first attempt after the `isTerminalStatus` extraction fix.

## User Setup Required
None - no external service configuration required. `swr` is a plain npm dependency, no API keys or dashboard steps.

## Next Phase Readiness
- CRM-05 and SCRAPE-07 are fully deliverable end-to-end; Phase 4's JOB-04/JOB-05 mechanisms remain reachable through this phase's UI (verified live: a real job progressed pending → running → done while `/jobs` was open).
- This was the last plan of Phase 5 (the MVP's final phase) — both Wave 2 plans (05-03 Leads page, 05-04 Job History page) are now complete alongside Wave 1 (05-01 DAL, 05-02 nav/attribution).
- No blockers for milestone completion / `/gsd-verify-work`.

---
*Phase: 05-crm-leads-dashboard*
*Completed: 2026-07-03*

## Self-Check: PASSED

- `app/jobs/page.tsx` — FOUND
- `app/jobs/JobForm.tsx` — FOUND
- `app/jobs/JobStatusPoller.tsx` — FOUND
- `app/jobs/isTerminalStatus.ts` — FOUND
- `tests/unit/app/jobs/JobStatusPoller.test.ts` — FOUND
- Commit `4fec1bf` (Task 2 RED) — FOUND in `git log --oneline --all`
- Commit `c94d9cd` (Task 2 GREEN, swept into 05-03's commit — see Deviations) — FOUND in `git log --oneline --all`
- Commit `583b1e9` (Task 3) — FOUND in `git log --oneline --all`
- No unexpected file deletions in the Task 3 commit (`git show --stat 583b1e9` shows only 2 file additions, 175 insertions, 0 deletions)
