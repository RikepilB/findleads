---
phase: 05-crm-leads-dashboard
plan: 02
subsystem: ui
tags: [next.js, app-router, layout, attribution, google-places, sec-03]

requires:
  - phase: 05-crm-leads-dashboard (Plan 01, parallel wave-1 sibling)
    provides: lib/db/* DAL functions (no file overlap with this plan)
provides:
  - components/GoogleAttribution.tsx — static "Google Maps" attribution component
  - app/layout.tsx — shared app shell (two-tab nav + attribution above {children})
affects: [05-03 (Leads page), 05-04 (Job History page) — both inherit nav + attribution automatically via layout, no per-page duplication]

tech-stack:
  added: []
  patterns:
    - "Attribution rendered once in root layout, directly below nav and above {children} — satisfies SEC-03 for every future page without per-page wiring"
    - "Static two-link nav with no usePathname/active-state — avoids forcing a client-component boundary on the whole layout for a nice-to-have"

key-files:
  created:
    - components/GoogleAttribution.tsx
  modified:
    - app/layout.tsx

key-decisions:
  - "No active-tab highlighting (would require usePathname + \"use client\" on the root layout) — plan explicitly scoped this out as a nice-to-have, not required by UI-SPEC's \"no sidebar, two views\" requirement"
  - "Attribution text color kept at plan-specified text-[#5E5E5E] (arbitrary Tailwind value) rather than gray-500's default #6B7280 — plan's <action> block specified this exact value as \"matching the UI-SPEC gray value\""

patterns-established:
  - "Shared attribution/nav belongs in app/layout.tsx, not duplicated per-page"

requirements-completed: [SEC-03]

coverage:
  - id: D1
    description: "components/GoogleAttribution.tsx renders literal 'Google Maps' text (never 'Powered by Google'), 12px, styled, no link"
    requirement: "SEC-03"
    verification:
      - kind: unit
        ref: "grep -c 'Google Maps' components/GoogleAttribution.tsx (returns 3, includes JSX + doc comment); grep -c 'Powered by Google' (returns 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "app/layout.tsx renders a two-tab nav (Leads /leads, Job History /jobs) and GoogleAttribution directly above {children} on every page"
    requirement: "SEC-03"
    verification:
      - kind: unit
        ref: "grep -c 'GoogleAttribution' app/layout.tsx (returns 2: import + JSX usage); grep -n '/leads' and '/jobs' app/layout.tsx (both present)"
        status: pass
      - kind: other
        ref: "pnpm build (Next.js production build) — compiles successfully, confirms layout is a valid Server Component tree"
        status: pass
    human_judgment: true
    rationale: "Plan's own <verification> block requires a visual confirmation once Plans 05-03/05-04 exist and real /leads, /jobs routes render content next to the attribution bar — that check is deferred to end-of-phase per the plan text and cannot be automated from this plan alone (no page content exists yet to visually verify adjacency against)."

duration: ~15min
completed: 2026-07-03
status: complete
---

# Phase 5 Plan 2: Shared App Shell (Nav + Google Attribution) Summary

**Rewired the create-next-app `app/layout.tsx` scaffold into findleads' shared app shell — a static two-tab nav (Leads / Job History) and a new `GoogleAttribution` component rendering the corrected "Google Maps" copy, placed directly above `{children}` so every future page inherits SEC-03 compliance for free.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-03T19:44:00Z
- **Completed:** 2026-07-03T19:53:58Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `components/GoogleAttribution.tsx` — plain server-renderable component, literal "Google Maps" text, `text-xs text-[#5E5E5E]` (12px, gray), no link, no "use client" needed
- `app/layout.tsx` rewritten: real `findleads` metadata (replacing "Create Next App" placeholder), static two-link nav (`/leads`, `/jobs`), and `<GoogleAttribution />` rendered in a slim bar immediately below the nav and above `{children}` — satisfies SEC-03 for both future pages with zero per-page duplication

## Task Commits

Each task was committed atomically:

1. **Task 1: Create components/GoogleAttribution.tsx** - `4fe8bca` (feat)
2. **Task 2: Wire two-tab nav + attribution into app/layout.tsx** - `8fe9899` (feat)

**Plan metadata:** (this commit) `docs(05-02): complete layout nav + Google attribution plan`

## Files Created/Modified
- `components/GoogleAttribution.tsx` - new: renders "Google Maps" attribution text, 12px gray, no link
- `app/layout.tsx` - modified: real metadata, two-tab nav, attribution bar above `{children}`

## Decisions Made
- Skipped active-tab highlighting to avoid a `"use client"` boundary on the whole root layout — plan explicitly marked this optional; a static two-link nav satisfies UI-SPEC's "no sidebar, two views" requirement.
- Kept the plan's literal `text-[#5E5E5E]` Tailwind arbitrary-value class for the attribution color rather than swapping in Tailwind's built-in `gray-500` (`#6B7280`) utility class — followed the plan's `<action>` text exactly since it explicitly specified this hex value.

## Deviations from Plan

None — plan executed exactly as written for both tasks' `<action>` blocks. One correction made proactively during Task 1 authoring: the plan's own read_first/example guidance (and my first draft) referenced the phrase "NOT 'Powered by Google'" inside a code comment for context — removed before committing since the acceptance criteria required zero occurrences of that literal string anywhere in the file, including comments, not just the rendered text. This is a self-correction during drafting, not a deviation from the plan's intent (the plan's actual required behavior — file must not contain "Powered by Google" anywhere — was preserved).

## Issues Encountered

`pnpm typecheck` and `pnpm vitest run` both show pre-existing failures unrelated to this plan's files:
- `tsc --noEmit`: 6 errors in `tests/integration/db/{businesses,jobs}.test.ts` referencing `listBusinesses`/`updateBusinessNotes`/`setBusinessContacted`/`listJobs` — these are Plan 05-01's (parallel sibling, `lib/db/*`) TDD RED-phase tests, out of scope per this plan's file list (`app/layout.tsx`, `components/GoogleAttribution.tsx` only). Confirmed no errors reference either of this plan's files.
- `pnpm vitest run`: 1 failing test in `tests/unit/lib/jobs/checkpoint.test.ts` (`initialCursor` missing a `capHit` field) — pre-existing test from Phase 3 (`lib/jobs/checkpoint.ts`), unrelated to this plan; appears tied to Plan 05-01's in-progress `resultCapHit`/`SCRAPE-07` work touching `lib/jobs/*`. 86/87 other tests pass. Out of scope per the deviation rules' SCOPE BOUNDARY (issues not caused by this plan's task changes) — logged here, not fixed, not re-run hoping it resolves.

`pnpm build` and `pnpm lint` both pass clean with no errors of any kind.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `app/layout.tsx` is ready for Plans 05-03 (`/leads`) and 05-04 (`/jobs`) to add their route pages under `app/` — both will automatically inherit the nav and attribution bar with no additional wiring.
- Visual confirmation (nav + "Google Maps" render above content on both `/leads` and `/jobs`) is deferred to end-of-phase per this plan's own `<verification>` block, once 05-03/05-04 land real page content.
- No blockers.

---
*Phase: 05-crm-leads-dashboard*
*Completed: 2026-07-03*

## Self-Check: PASSED

- `components/GoogleAttribution.tsx` — FOUND (`ls` confirms file exists at repo root `components/`)
- `app/layout.tsx` — FOUND, modified (contains `GoogleAttribution` import + usage, `/leads` and `/jobs` links)
- Commit `4fe8bca` (Task 1) — FOUND in `git log --oneline`
- Commit `8fe9899` (Task 2) — FOUND in `git log --oneline`
- No unexpected file deletions in either commit (`git status --short` showed only the intended new/modified file staged each time; sibling agent's concurrent `lib/db/businesses.ts` changes were never staged by this plan's commits)
