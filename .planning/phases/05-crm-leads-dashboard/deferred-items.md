# Deferred Items — Phase 5 (CRM Leads Dashboard)

Out-of-scope discoveries logged during plan execution, per executor SCOPE BOUNDARY rules.
Not fixed here — tracked for whichever plan/agent owns the affected files.

## From 05-03 execution (2026-07-03)

- **`tests/unit/app/jobs/JobStatusPoller.test.ts` / `app/jobs/JobStatusPoller.tsx`** — observed
  failing (`SyntaxError: The requested module 'react' does not provide an export named
  'createContext'`, from a `useSWR` import) during `pnpm test` while 05-03 was executing
  concurrently with 05-04 (Wave 2, no worktree isolation — shared checkout). These files belong
  to Plan 05-04 (Job History page), not 05-03 (`app/leads/*`, `app/page.tsx` only) — out of
  scope per SCOPE BOUNDARY. Not fixed by this plan. 05-04's own execution/verification should
  confirm this resolves once its own tasks land; if it persists after 05-04 completes, it needs
  attention there, not in 05-03.
