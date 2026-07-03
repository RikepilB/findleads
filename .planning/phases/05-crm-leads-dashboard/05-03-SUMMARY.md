---
phase: 05-crm-leads-dashboard
plan: 03
subsystem: ui
tags: [next.js, app-router, server-actions, zod, use-action-state, crm-01, crm-02, crm-03, crm-04]

requires:
  - phase: 05-crm-leads-dashboard (Plan 01)
    provides: "lib/db/businesses.ts listBusinesses/updateBusinessNotes/setBusinessContacted"
  - phase: 05-crm-leads-dashboard (Plan 02)
    provides: "app/layout.tsx shared nav + GoogleAttribution (inherited automatically, no per-page wiring needed)"
provides:
  - "app/leads/actions.ts: updateNotesAction, setContactedAction (zod-validated Server Actions)"
  - "app/leads/page.tsx: Leads table (tier badge, contacted toggle, inline notes, relative-time staleness) + empty state"
  - "app/leads/ContactedToggle.tsx, app/leads/NotesField.tsx: Client Component boundaries wrapping the two Server Actions via useActionState"
  - "app/page.tsx: redirect('/leads') — Leads is the default view"
affects: [05-04 (Job History page) — no file overlap, shares app/layout.tsx nav only]

tech-stack:
  added: []
  patterns:
    - "React's <form action> prop type requires (formData) => void | Promise<void> — a Server Action that resolves to a value (e.g. { ok, error }) cannot be assigned directly. useActionState wraps such an action into the void-returning `formAction` shape the form element's type expects, and is the sanctioned React 19 pattern for this exact case."
    - "Any element needing a real DOM event listener (onBlur, onClick, etc.) requires a 'use client' boundary — a Server Component cannot attach one directly to a host element, even though it can pass a Server Action reference as a form's `action` prop with zero client JS."
    - "z.coerce.boolean() runs Boolean(input) internally — the string \"false\" is a non-empty string and coerces to `true`, silently inverting a form field meant to carry an explicit true/false. Use z.enum(['true','false']).transform(v => v === 'true') instead whenever a boolean travels through a FormData/string boundary."

key-files:
  created:
    - app/leads/actions.ts
    - app/leads/page.tsx
    - app/leads/ContactedToggle.tsx
    - app/leads/NotesField.tsx
    - tests/unit/app/leads/actions.test.ts
    - .planning/phases/05-crm-leads-dashboard/deferred-items.md
  modified:
    - app/page.tsx

key-decisions:
  - "contactedSchema uses z.enum(['true','false']).transform(v => v === 'true') instead of the plan's literal z.coerce.boolean() suggestion — the latter would make the form's explicit \"false\" value coerce to `true` (Boolean('false') === true), inverting the toggle on every other click. Caught by writing both true- and false-path tests before implementing (Rule 1 — bug in the plan's own specified schema shape, fixed before it ever shipped)."
  - "Split the two interactive table cells (contacted toggle, notes textarea) into their own tiny Client Components (ContactedToggle.tsx, NotesField.tsx) rather than inlining them in the async Server Component page, per the plan's Code Examples illustration. Two independent technical constraints forced this: (1) the notes textarea's onBlur-triggered autosave needs a real DOM event listener, which only works inside a 'use client' boundary; (2) passing either Server Action directly as a form's `action` prop fails tsc because the actions resolve to { ok, error } and React's form action prop type requires void|Promise<void> — useActionState (inside the client boundary) is the sanctioned fix for both."
  - "Kept updateNotesAction/setContactedAction's { ok: true } / { ok: false, error } return contract exactly as specified and already covered by Task 1's tests, rather than weakening it to void to sidestep the type error — the useActionState wrapper absorbs the mismatch without touching the action's public contract."

patterns-established:
  - "Server Actions that need to report success/failure state to the UI are always invoked through useActionState from a Client Component wrapper, never assigned directly as a form's `action` prop."

requirements-completed: [CRM-01, CRM-02, CRM-03, CRM-04]

coverage:
  - id: D1
    description: "updateNotesAction/setContactedAction reject invalid input (bad businessId, notes >2000 chars) without calling the DAL, and call the correct DAL function with correctly-typed args on valid input, including both contacted=true and contacted=false paths"
    requirement: "CRM-02, CRM-03, CRM-04"
    verification:
      - kind: unit
        ref: "tests/unit/app/leads/actions.test.ts — 9 cases across updateNotesAction/setContactedAction, DAL + revalidatePath mocked at module boundary"
        status: pass
    human_judgment: false
  - id: D2
    description: "/leads renders the tier-1 copy ('No website found on Google'), the empty-state heading ('No leads yet'), and / redirects to /leads without any create-next-app boilerplate remaining"
    requirement: "CRM-01"
    verification:
      - kind: unit
        ref: "grep -c \"No website found on Google\" app/leads/page.tsx == 1; grep -c \"No leads yet\" app/leads/page.tsx == 1; grep -n \"redirect('/leads')\" app/page.tsx present; grep -c create-next-app app/page.tsx == 0"
        status: pass
      - kind: other
        ref: "pnpm build (Next.js production build) — / is static, /leads is static, both compile and are listed in the route table"
        status: pass
    human_judgment: true
    rationale: "Full interactive verification (creating a real business via a completed scrape, editing notes, toggling contacted, confirming persistence across reload and the relative-time cell) requires Plan 05-04's job-creation form to exist and a real scrape to run — deferred to end-of-phase per this plan's own <verification> block, same pattern as 05-02-SUMMARY.md's deferred visual check."

duration: ~25min
completed: 2026-07-03
status: complete
---

# Phase 5 Plan 3: Leads Page + Server Actions Summary

**Built the Leads page — an async Server Component reading `listBusinesses()`, rendering a dense table (tier badge, contacted toggle, inline-editable notes, relative-time staleness) per `05-UI-SPEC.md` — backed by two zod-validated Server Actions, and made `/` redirect to `/leads` as the app's default view. CRM-01 through CRM-04 are now deliverable end-to-end.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-03T20:07:00Z
- **Completed:** 2026-07-03T20:16:00Z
- **Tasks:** 2
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- `app/leads/actions.ts`: `updateNotesAction`/`setContactedAction`, zod-validated (`businessId` coerced positive int, `notes` trimmed + capped at 2000 chars, `contacted` parsed via an explicit `true`/`false` enum + transform — not `z.coerce.boolean()`, which would silently invert the value), delegating to Plan 05-01's `updateBusinessNotes`/`setBusinessContacted`, then `revalidatePath('/leads')`
- `app/leads/page.tsx`: async Server Component — empty state ("No leads yet" / run-a-scrape copy) when `listBusinesses()` returns nothing; otherwise a table (business name, tier badge, phone, address, rating, contacted toggle, inline notes, relative `updatedAt`) with alternating gray-100 row stripes and the UI-SPEC's exact badge color pairs
- `app/leads/ContactedToggle.tsx`, `app/leads/NotesField.tsx`: small Client Component boundaries, each wrapping its Server Action via `useActionState` — required because (a) the notes field's autosave-on-blur needs a real DOM event listener, which only works inside `'use client'`, and (b) React's `<form action>` prop type demands a void-returning callback, which neither Server Action satisfies directly since both resolve to `{ ok, error }`
- `app/page.tsx`: replaced the entire create-next-app scaffold with `redirect('/leads')`
- `relativeTime()` helper in `page.tsx` using `Intl.RelativeTimeFormat` only (no date library), matching 05-RESEARCH.md's Don't Hand-Roll guidance

## Task Commits

Each task was committed atomically (TDD RED → GREEN for Task 1):

1. **Task 1: app/leads/actions.ts — updateNotesAction, setContactedAction**
   - `e70061e` (test) — failing unit tests for both actions (valid/invalid businessId, notes length cap, contacted true/false)
   - `a89ff81` (feat) — implementation, tests green
2. **Task 2: app/leads/page.tsx + app/page.tsx redirect**
   - `c94d9cd` (feat) — Leads page, ContactedToggle/NotesField client components, `/` redirect

**Plan metadata:** (this commit) `docs(05-03): complete Leads page + Server Actions plan`

## Files Created/Modified
- `app/leads/actions.ts` - new: `updateNotesAction`, `setContactedAction`
- `app/leads/page.tsx` - new: Leads table Server Component + empty state + `relativeTime()` helper
- `app/leads/ContactedToggle.tsx` - new: Client Component, `useActionState`-wrapped contacted toggle
- `app/leads/NotesField.tsx` - new: Client Component, `useActionState`-wrapped autosave-on-blur notes field
- `app/page.tsx` - rewritten: `redirect('/leads')`, no create-next-app boilerplate remains
- `tests/unit/app/leads/actions.test.ts` - new: 9 test cases, DAL + `next/cache` mocked at module boundary
- `.planning/phases/05-crm-leads-dashboard/deferred-items.md` - new: logs an out-of-scope concurrent-agent (05-04) test failure observed transiently during this plan's execution, not fixed here

## Decisions Made
- Fixed a bug in the plan's own specified `contactedSchema` shape before it ever shipped: `z.coerce.boolean()` runs `Boolean(input)`, so the form's literal string `"false"` (a non-empty string) coerces to `true` — the opposite of intent. Replaced with `z.enum(['true','false']).transform(v => v === 'true')`. Caught because Task 1's tests explicitly assert both the `contacted=true` and `contacted=false` paths before the implementation was written (Rule 1 — bug in intended behavior, auto-fixed).
- Moved the two interactive table cells into their own Client Components (`ContactedToggle.tsx`, `NotesField.tsx`) rather than inlining them directly in the async Server Component, per two technical constraints the plan's illustrative code example didn't account for: Server Components cannot attach a DOM event listener (`onBlur`) to a host element, and React's `<form action>` prop type requires a void-returning callback, which a `{ ok, error }`-returning Server Action doesn't satisfy without a `useActionState` wrapper. Both fixes were required for `pnpm typecheck` to pass at all (Rule 3 — blocking issue).
- Kept `updateNotesAction`/`setContactedAction`'s `{ ok: true } | { ok: false, error }` return contract unchanged (already locked in by Task 1's committed tests) rather than weakening it to `void` to sidestep the type error — `useActionState` absorbs the mismatch at the call site instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `contactedSchema`'s `z.coerce.boolean()` would silently invert `contacted=false`**
- **Found during:** Task 1, writing the false-path test case before implementing `setContactedAction`
- **Issue:** The plan's `<action>` text specifies `contacted: z.coerce.boolean()`. Zod's coercion runs `Boolean(input)` — since the form always sends a non-empty string (`"true"` or `"false"`), `Boolean("false")` evaluates to `true`, meaning every other click of the contacted toggle would silently do nothing (or the opposite of what the UI shows).
- **Fix:** `contacted: z.enum(['true', 'false']).transform((v) => v === 'true')` — maps the two literal strings explicitly.
- **Files modified:** `app/leads/actions.ts`
- **Verification:** `tests/unit/app/leads/actions.test.ts` explicitly asserts both `setBusinessContactedMock` called with `true` (input `"true"`) and `false` (input `"false"`) — both pass.
- **Committed in:** `a89ff81` (Task 1 feat commit)

**2. [Rule 3 - Blocking] Server Components cannot attach `onBlur`; form actions returning a value don't satisfy React's `<form action>` type**
- **Found during:** Task 2, `pnpm typecheck` after writing the plan's illustrative inline-in-page-Server-Component version of the notes/contacted forms
- **Issue:** Two independent compile/runtime blockers: (a) `<textarea onBlur={...}>` cannot exist inside a Server Component — DOM event listeners require a `'use client'` boundary; (b) `<form action={updateNotesAction}>` failed `tsc` because `updateNotesAction` resolves to `{ ok, error }` while React's `AllHTMLAttributes.action` type is `string | ((formData: FormData) => void | Promise<void>)`.
- **Fix:** Extracted `ContactedToggle.tsx` and `NotesField.tsx` as `'use client'` components, each using `useActionState` to wrap its Server Action into a void-returning `formAction`.
- **Files modified:** `app/leads/ContactedToggle.tsx` (new), `app/leads/NotesField.tsx` (new), `app/leads/page.tsx` (renders the two components instead of inlining the forms)
- **Verification:** `pnpm typecheck` passes; `pnpm build` succeeds, `/leads` listed as a static route.
- **Committed in:** `c94d9cd` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 — bug in the plan's own schema spec, 1 Rule 3 — blocking type/runtime constraint). No architectural changes; both fixes stayed within the plan's stated files (`app/leads/actions.ts`, `app/leads/page.tsx`, `app/page.tsx`) plus two small new component files that are a direct, minimal consequence of fix #2, not scope creep.

## Issues Encountered

**Concurrent-execution git index contamination (Wave 2, no worktree isolation).** This plan (05-03) and Plan 05-04 (Job History page) ran as parallel agents against the same shared checkout (`git worktree list` confirms a single working tree, no per-agent isolation). Between staging Task 2's own four files (`git add app/page.tsx app/leads/page.tsx app/leads/ContactedToggle.tsx app/leads/NotesField.tsx .planning/phases/05-crm-leads-dashboard/deferred-items.md`, confirmed via `git status --short` immediately beforehand to contain only those five paths) and running `git commit`, the concurrent 05-04 agent staged its own in-progress GREEN files (`app/jobs/JobStatusPoller.tsx`, `app/jobs/isTerminalStatus.ts`, `package.json`/`pnpm-lock.yaml` swr dependency bump, a fix to `tests/unit/app/jobs/JobStatusPoller.test.ts`) into the shared index. `git commit` (without an explicit pathspec) commits the full index, not just what was just `git add`-ed, so commit `c94d9cd` ended up containing both plans' work — confirmed via `git show --stat c94d9cd` after the fact.
- No destructive action was taken to "fix" this (no `reset`, `revert`, or `amend` — all prohibited without explicit user request, and amending here specifically risks rewriting a commit hash the concurrent 05-04 agent may already be building on).
- No data was lost: every file in the commit is exactly the content its owning plan intended; only the commit boundary/attribution is blended.
- Flagging explicitly here so the orchestrator/05-04's own agent is aware: if 05-04's next commit attempt finds `app/jobs/JobStatusPoller.tsx`/`isTerminalStatus.ts`/`package.json` already committed (via `c94d9cd`), that is this incident, not data loss — 05-04 should proceed from current state rather than attempt to re-add already-committed files.
- Separately (unrelated root cause), also observed `tests/unit/app/jobs/JobStatusPoller.test.ts` transiently failing with `SyntaxError: The requested module 'react' does not provide an export named 'createContext'` mid-execution — resolved on its own by the time the full suite was re-run before this plan's final commit (05-04's own in-flight work stabilizing). Logged to `.planning/phases/05-crm-leads-dashboard/deferred-items.md` per the SCOPE BOUNDARY guardrail (out of scope for 05-03 to fix `app/jobs/*` files) — no action taken beyond logging, and it was already resolved by the final full-suite run below.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CRM-01 through CRM-04 are fully wired end-to-end: `/leads` renders real data from `listBusinesses()`, and both Server Actions persist edits via Plan 05-01's DAL.
- Full interactive/manual verification (create a business via a completed scrape from Plan 05-04, confirm it appears on `/leads`, edit notes and toggle contacted, confirm both persist across reload and the relative-time cell updates) is deferred to end-of-phase once Plan 05-04's job-creation form exists to actually produce a business row — consistent with this plan's own `<verification>` block and 05-02-SUMMARY.md's precedent for deferred visual checks.
- Flag for the orchestrator: verify commit `c94d9cd`'s contents against 05-04's own summary once it lands, per the concurrent-execution note above — no action needed unless 05-04 reports missing files.
- No blockers to CRM-01..04 being considered functionally complete.

---
*Phase: 05-crm-leads-dashboard*
*Completed: 2026-07-03*

## Self-Check: PASSED

- `app/leads/actions.ts` — FOUND
- `app/leads/page.tsx` — FOUND
- `app/leads/ContactedToggle.tsx` — FOUND
- `app/leads/NotesField.tsx` — FOUND
- `app/page.tsx` — FOUND, contains `redirect('/leads')`, no create-next-app boilerplate
- `tests/unit/app/leads/actions.test.ts` — FOUND
- Commit `e70061e` (Task 1 test) — FOUND in `git log --oneline --all`
- Commit `a89ff81` (Task 1 feat) — FOUND in `git log --oneline --all`
- Commit `c94d9cd` (Task 2 feat) — FOUND in `git log --oneline --all`
- `pnpm test` (full suite): 23 test files / 103 tests passing at time of final verification
- `pnpm typecheck` and `pnpm build` both pass clean
- Commit `c94d9cd` confirmed (via `git show --stat`) to also contain files outside this plan's scope (`app/jobs/*`, `package.json`, `pnpm-lock.yaml`) — see Issues Encountered; documented, not corrected via destructive git operations
