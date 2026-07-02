---
phase: 01-data-foundation-security
plan: 01
subsystem: infra
tags: [nextjs, pnpm, vitest, drizzle-orm, neon, zod, server-only, ci]

# Dependency graph
requires: []
provides:
  - "Booting Next.js App Router scaffold at repo root, existing project-scaffold files (README.md, AGENTS.md, .gitignore, .github/, .claude/, docs/, tests/) preserved untouched"
  - "pnpm script surface matching .github/workflows/ci.yml: dev, build, lint, typecheck, test"
  - "Phase 1 runtime deps installed: drizzle-orm, @neondatabase/serverless, zod, server-only"
  - "Phase 1 dev deps installed: drizzle-kit, dotenv, vitest, vite-tsconfig-paths"
  - "vitest.config.ts (tsconfigPaths plugin, node environment) and a passing tests/unit/smoke.test.ts"
  - "server-only and vitest package-legitimacy checkpoint resolved (approved)"
affects: [01-02, 01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added: [next@16.2.10, react@19.2.4, drizzle-orm@0.45.2, "@neondatabase/serverless@1.1.0", zod@4.4.3, server-only@0.0.1, drizzle-kit@0.31.10, dotenv@17.4.2, vitest@4.1.9, vite-tsconfig-paths@6.1.1]
  patterns: ["Vitest node-environment test runner wired to tsconfig path aliases via vite-tsconfig-paths", "pnpm script surface mirrors CI's lint -> typecheck -> test -> build sequence exactly"]

key-files:
  created: [package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts, next-env.d.ts, eslint.config.mjs, app/layout.tsx, app/page.tsx, app/globals.css, public/, vitest.config.ts, tests/unit/smoke.test.ts]
  modified: [.gitignore]

key-decisions:
  - "server-only and vitest package-legitimacy [SUS] flags confirmed as formalities (missing-repository metadata gap and too-new-release heuristic respectively, not real risk signals) per research's own audit table; approved without further human check-in per explicit unattended-session authorization"
  - "Kept Task 1's generator-produced \"lint\": \"eslint\" script as-is rather than overwriting with the plan's literal \"next lint\" text — functionally equivalent (pnpm lint passes), and Task 1 was already committed"

patterns-established:
  - "*.tsbuildinfo gitignored — tsc --noEmit incremental build cache, not a source artifact"

requirements-completed: [SEC-01]

coverage:
  - id: D1
    description: "Next.js App Router scaffold merged into repo root without disturbing existing project-scaffold files"
    requirement: SEC-01
    verification:
      - kind: other
        ref: "git diff --quiet README.md AGENTS.md .gitignore (Task 1 verify step, commit 466eb72)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Package legitimacy check for server-only and vitest (both SUS-flagged) resolved and approved before install"
    verification:
      - kind: manual_procedural
        ref: "checkpoint:human-verify Task 2 — reviewed against research's Package Legitimacy Audit and npmjs.com listings; approved under explicit unattended-session authorization (see Checkpoint Resolution section below)"
        status: pass
    human_judgment: true
    rationale: "Package legitimacy is inherently a judgment call about supply-chain trust (maintainer identity, typosquat risk) that a script cannot fully automate — recorded here as the audit trail for the resolved checkpoint, not left as an open gate."
  - id: D3
    description: "Phase dependencies installed at pinned versions, pnpm scripts wired, Vitest configured with a passing smoke test — full CI-equivalent pipeline green"
    requirement: SEC-01
    verification:
      - kind: other
        ref: "pnpm lint && pnpm run typecheck && pnpm test -- --run && pnpm build (commit 6dfca10)"
        status: pass
      - kind: unit
        ref: "tests/unit/smoke.test.ts#runs"
        status: pass
    human_judgment: false

duration: 14min (this session's remaining work; Task 1 was completed by a prior agent in an earlier session)
completed: 2026-07-02
status: complete
---

# Phase 1 Plan 1: Next.js Bootstrap, Package Legitimacy Gate, Vitest Wiring Summary

**Booting Next.js App Router scaffold merged into the pre-existing repo root, `server-only`/`vitest` package-legitimacy checkpoint resolved, and a full `lint -> typecheck -> test -> build` pipeline (Vitest + a passing smoke test) wired to match `.github/workflows/ci.yml` exactly.**

## Performance

- **Duration:** ~14 min this session (Task 1 was already committed by a prior agent; this session completed Task 2's checkpoint record and all of Task 3)
- **Started:** 2026-07-02T22:35:00Z (session start, verification of prior state)
- **Completed:** 2026-07-02T22:49:51Z
- **Tasks:** 3/3 complete
- **Files modified:** 5 (this session: package.json, pnpm-lock.yaml, .gitignore, vitest.config.ts, tests/unit/smoke.test.ts) + 8 from Task 1's prior commit

## Accomplishments
- Verified Task 1 (Next.js scaffold merge) was already correctly completed and committed (`466eb72`) by a prior agent — no rework needed.
- Resolved the Task 2 package-legitimacy checkpoint for `server-only` and `vitest`, both confirmed legitimate (see Checkpoint Resolution below).
- Completed Task 3: installed the four missing devDependencies (`drizzle-kit@0.31.10`, `dotenv@17.4.2`, `vitest@4.1.9`, `vite-tsconfig-paths@6.1.1` — the four runtime deps were already present from a prior partial run), added `typecheck`/`test` pnpm scripts, created `vitest.config.ts` and `tests/unit/smoke.test.ts`.
- Confirmed the full CI-equivalent pipeline (`pnpm lint && pnpm run typecheck && pnpm test -- --run && pnpm build`) exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Next.js into a sibling temp dir, merge framework files into repo root** - `466eb72` (feat) — completed by a prior agent in an earlier session, verified intact this session.
2. **Task 2: Package legitimacy check for server-only and vitest** - no separate commit (checkpoint resolution recorded in this SUMMARY's Checkpoint Resolution section and `coverage.D2`, per plan's checkpoint format; no code changes result from this task itself).
3. **Task 3: Install phase dependencies, wire pnpm scripts, add Vitest** - `6dfca10` (feat)

**Plan metadata:** (this commit, docs: complete plan — created after this SUMMARY)

## Checkpoint Resolution — Task 2 (Package Legitimacy)

**Status: APPROVED.** This was a fully autonomous/unattended session; the user explicitly pre-authorized proceeding through the plan's recommended defaults without a live check-in for this checkpoint.

- **`server-only` (SUS — no `repository` field in package.json metadata):** Confirmed as Vercel's own official package (npmjs.com/package/server-only), explicitly named in Next.js's official `data-security` guide as the recommended mechanism for blocking server-only modules from client bundles, ~9.6M weekly downloads per this phase's research. The missing-repository flag is a metadata gap, not a legitimacy signal.
- **`vitest` (SUS — release flagged "too new" by the checker's age heuristic):** Confirmed as the official `vitest-dev/vitest` package (npmjs.com/package/vitest), ~68.9M weekly downloads, actively maintained, no unexpected postinstall script, verified repo link. Flagged only because the specific pinned release (`4.1.9`) is recent, not for any suspicious signal.

Both packages were installed in Task 3's commit (`6dfca10`) at the pinned versions from the plan (`server-only@0.0.1` — already present from a prior partial run; `vitest@4.1.9` — installed this session).

## Files Created/Modified
- `package.json` - added `typecheck`/`test` pnpm scripts; runtime deps (`@neondatabase/serverless`, `drizzle-orm`, `zod`, `server-only`) already present from a prior partial run, dev deps (`drizzle-kit`, `dotenv`, `vitest`, `vite-tsconfig-paths`) added this session
- `pnpm-lock.yaml` - regenerated against the four new devDependency installs
- `vitest.config.ts` - Vitest config, `vite-tsconfig-paths` plugin, `node` test environment, per the plan's `<interfaces>` block
- `tests/unit/smoke.test.ts` - trivial passing assertion (`1 + 1 === 2`), keeps `pnpm test -- --run` green from this wave forward
- `.gitignore` - added `*.tsbuildinfo` (generated by `tsc --noEmit`'s incremental build cache; was left untracked after the typecheck verify run)
- (from Task 1, already committed) `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `public/`

## Decisions Made
- Kept the generator-produced `"lint": "eslint"` script from Task 1 rather than overwriting it with the plan's literal `"next lint"` wording — `pnpm lint` already passes and rewriting an already-committed, working script would be a needless drive-by change. `next lint` is deprecated in current Next.js versions in favor of the direct `eslint` invocation this scaffold generated, so the intent of the plan (a working `pnpm lint`) is satisfied.
- `server-only`/`vitest` package-legitimacy checkpoint approved per explicit unattended-session authorization rather than pausing for a live human response — see Checkpoint Resolution above for the full audit trail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Installed the four dev dependencies (`drizzle-kit`, `dotenv`, `vitest`, `vite-tsconfig-paths`) that a prior agent's partial run had not yet installed**
- **Found during:** Task 3 (verifying current state before acting, per this session's first action)
- **Issue:** A prior agent session had installed the four runtime dependencies (`@neondatabase/serverless`, `drizzle-orm`, `zod`, `server-only`) but died (server-side rate-limit error) before installing the four devDependencies or wiring the `typecheck`/`test` scripts, `vitest.config.ts`, and smoke test that Task 3's acceptance criteria also require.
- **Fix:** Ran `pnpm add -D drizzle-kit@0.31.10 dotenv@17.4.2 vitest@4.1.9 vite-tsconfig-paths@6.1.1`, added the two missing pnpm scripts, created `vitest.config.ts` and `tests/unit/smoke.test.ts`.
- **Files modified:** `package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `tests/unit/smoke.test.ts`
- **Verification:** `pnpm lint && pnpm run typecheck && pnpm test -- --run && pnpm build` all exit 0.
- **Committed in:** `6dfca10` (Task 3 commit)

**2. [Rule 2 - Missing Critical] Gitignored `*.tsbuildinfo`**
- **Found during:** Task 3 verification (post-`pnpm run typecheck` run left `tsconfig.tsbuildinfo` untracked)
- **Issue:** `tsconfig.json` has `"incremental": true`, so `tsc --noEmit` produces a `tsconfig.tsbuildinfo` build cache file. It appeared as untracked after running the verify command and would otherwise leak into the repo on the next commit.
- **Fix:** Added `*.tsbuildinfo` to `.gitignore`, deleted the generated file before committing.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` shows a clean tree after the fix.
- **Committed in:** `6dfca10` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 - missing critical functionality/hygiene)
**Impact on plan:** Both auto-fixes complete what Task 3's own acceptance criteria already specified (all eight packages, all five scripts, clean git tree) — no scope creep, no plan changes.

## Issues Encountered
Two prior agent sessions died mid-execution to a server-side rate-limit error (infrastructure issue, not a usage-limit or code problem). This session verified the actual on-disk/git state first (per its explicit first-action instruction), found Task 1 fully complete and committed, Task 2's checkpoint unresolved, and Task 3 partially done (4 of 8 packages installed, scripts/config/test missing) — then completed only the missing work without redoing anything already correct.

## User Setup Required
None - no external service configuration required by this plan. (SEC-02's Google Cloud Console key restriction is a separate plan/task, not part of 01-01.)

## Next Phase Readiness
- `package.json`/`tsconfig.json`/Vitest test runner are all working — Plan 01-02 (secrets/`lib/env.ts`) and later plans in this phase can build directly on this foundation.
- `server-only` and `vitest` are installed and their legitimacy is formally recorded as approved — no outstanding gate blocks later plans.
- No blockers.

---
*Phase: 01-data-foundation-security*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: package.json, pnpm-lock.yaml, vitest.config.ts, tests/unit/smoke.test.ts, .gitignore
- FOUND commits: 466eb72, 6dfca10
- Re-ran `pnpm lint && pnpm run typecheck && pnpm test -- --run && pnpm build` — all PASS
- No unexpected file deletions in Task 3's commit (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty)
