---
phase: 01-data-foundation-security
plan: 02
subsystem: infra
tags: [nextjs, vitest, zod, server-only, sec-01, sec-02, neon, env-secrets]

# Dependency graph
requires:
  - phase: 01-data-foundation-security
    provides: "pnpm script surface, Vitest wired (vitest.config.ts, node environment), server-only/vitest installed and legitimacy-approved"
provides:
  - "lib/env.ts — server-only, zod-validated process.env boundary; sole sanctioned process.env reader in the codebase (SEC-01 mechanism, code+tests complete)"
  - "tests/unit/lib/env.test.ts — 4 passing cases (missing DATABASE_URL, missing PLACES_API_KEY, malformed DATABASE_URL, valid-typed success), self-contained (no dependency on a real .env.test)"
  - "vitest.config.ts wired to load TEST_DATABASE_URL from .env.test plus a placeholder PLACES_API_KEY, with the react-server resolve condition fix needed for server-only-guarded modules to load under Vitest"
  - "NOT provided by this plan (blocked, pending human action): a real DATABASE_URL/TEST_DATABASE_URL in .env/.env.test, a real restricted PLACES_API_KEY in .env, and the SEC-02 Cloud Console restriction itself"
affects: [01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vitest ssr.resolve.conditions: ['react-server'] (plus top-level resolve.conditions) required for any module chain importing 'server-only' to resolve under Vitest's node test environment — otherwise it hits server-only's throwing default export branch"
    - "process.env stubbed directly per-test with vi.resetModules() + dynamic import(), rather than relying on Vitest's global test.env, for unit tests of modules that parse process.env at module scope — keeps the test independent of whether .env.test exists"

key-files:
  created: [lib/env.ts, tests/unit/lib/env.test.ts]
  modified: [vitest.config.ts]

key-decisions:
  - "Built and committed the SEC-01 code mechanism (lib/env.ts, unit tests, vitest.config.ts wiring) despite Task 1/Task 2 being blocked — the code itself has no dependency on real secrets existing yet, and blocking on Task 1/2 would have left demonstrably completable, requirement-bearing work undone"
  - "Did not attempt any workaround to write real or placeholder values into .env/.env.example/.env.test — this repo's own .claude/settings.json explicitly denies Read(**/.env*) and Write(**/.env*) for all Claude Code tool calls (Read/Write/Edit), with no local override; treated as an intentional, non-bypassable repo security guardrail, not a bug"
  - "Task 1 (Neon DATABASE_URL/TEST_DATABASE_URL provisioning) is a checkpoint, not a completed task — no mcp__Neon__* MCP tools were present in this session's tool list (despite the plan/orchestrator prompt's assumption they would be), so this follows the plan's own documented fallback: 'stop and surface a checkpoint asking the human... do not fabricate a connection string'"

patterns-established:
  - "Any future test that imports a module transitively requiring 'server-only' needs the same ssr.resolve.conditions fix already applied in vitest.config.ts — no further per-test action needed"

requirements-completed: []
# Neither SEC-01 nor SEC-02 is fully satisfied yet: SEC-01's code mechanism is built and unit-tested,
# but the plan's own must_haves.truths requires a REAL Neon DATABASE_URL/TEST_DATABASE_URL to exist,
# which is blocked (see Deviations/Issues below). SEC-02 has not been started at all (pure human
# action pending). Left empty rather than claiming completion of either requirement.

coverage:
  - id: D1
    description: "lib/env.ts — server-only, zod-validated process.env boundary; throws at import time on missing/malformed DATABASE_URL or PLACES_API_KEY; no NEXT_PUBLIC_-prefixed re-export"
    requirement: SEC-01
    verification:
      - kind: unit
        ref: "tests/unit/lib/env.test.ts#lib/env (4 cases: missing DATABASE_URL, missing PLACES_API_KEY, malformed DATABASE_URL, valid-typed success)"
        status: pass
      - kind: other
        ref: "grep -c 'NEXT_PUBLIC_' lib/env.ts | grep -qx 0"
        status: pass
      - kind: other
        ref: "pnpm run typecheck && pnpm lint (full repo, exit 0 after this plan's changes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Real Neon Postgres dev database (DATABASE_URL) and a distinct real Neon Postgres test database/branch (TEST_DATABASE_URL) provisioned and written to .env/.env.test"
    requirement: SEC-01
    verification: []
    human_judgment: true
    rationale: "No Neon MCP tooling was present in this session (contrary to the orchestrator prompt's assumption); additionally this repo's .claude/settings.json hard-denies Read/Write on any .env* path for all Claude Code tools, so even a manually-supplied connection string cannot be written into .env by this executor. A human with Neon account access and direct filesystem access must both provision the databases and write the files."
  - id: D3
    description: "Google Cloud Console API key restricted to Places API (New) only (SEC-02), verified live with a positive Places call and a negative Geocoding call"
    requirement: SEC-02
    verification: []
    human_judgment: true
    rationale: "External Google Cloud Console account action with no CLI/MCP/API path available in this environment — genuinely requires a human with Console access, per the plan's own checkpoint:human-action task type."

duration: ~20min (this session; continuation of the same session that completed Plan 01-01)
completed: 2026-07-02
status: blocked
---

# Phase 1 Plan 2: SEC-01 env.ts Boundary Summary (Task 1/SEC-02 blocked on human action)

**`lib/env.ts` server-only zod-validated secrets boundary built and unit-tested (4/4 passing, no `NEXT_PUBLIC_` leakage); Neon database provisioning (Task 1) and the Google Cloud Console Places API key restriction (Task 2/SEC-02) remain blocked pending human action — this repo's own permission config hard-denies Claude Code from reading or writing any `.env*` file, and no Neon MCP tooling was present in this session.**

## Performance

- **Duration:** ~20 min this session
- **Started:** 2026-07-02T22:50:00Z (approx, immediately following Plan 01-01's completion in the same session)
- **Completed:** 2026-07-02T23:00:45Z
- **Tasks:** 1/3 complete (Task 3's code portion); Task 1 and Task 2 blocked as checkpoints
- **Files modified:** 3 (`lib/env.ts` created, `tests/unit/lib/env.test.ts` created, `vitest.config.ts` edited)

## Accomplishments
- Built `lib/env.ts` exactly per the plan's `<interfaces>` block: `import 'server-only'` first line, zod schema requiring `DATABASE_URL` (as `z.url()`) and `PLACES_API_KEY` (non-empty string), parsed at module scope.
- Wrote `tests/unit/lib/env.test.ts` covering all four required cases (missing `DATABASE_URL`, missing `PLACES_API_KEY`, malformed `DATABASE_URL`, valid-typed success) — self-contained via direct `process.env` manipulation + `vi.resetModules()` + dynamic `import()`, so it passes with no real `.env.test` present.
- Edited `vitest.config.ts` to add the `.env.test`-loading `dotenv` call and `test.env` block from the plan's `<interfaces>` block, plus a necessary `ssr.resolve.conditions`/`resolve.conditions: ['react-server']` fix (see Deviations) so `server-only`-guarded modules load under Vitest at all.
- Confirmed `pnpm vitest run` (full suite, 2 files/5 tests), `pnpm run typecheck`, and `pnpm lint` all exit 0 after these changes.
- Confirmed via `git status --short` that no `.env*` file was touched, created, or leaked into git tracking by this session.
- Determined and documented (see Deviations/Issues) that Task 1 and Task 2 are both structurally blocked in this session, and stopped rather than fabricating secrets or attempting to bypass the repo's `.env*` permission deny.

## Task Commits

Each completed task was committed atomically:

1. **Task 1: Resolve DATABASE_URL and TEST_DATABASE_URL via Neon** - BLOCKED, no commit (checkpoint — see Checkpoint Resolution below; no code changes result from a blocked task).
2. **Task 2: Restrict Google Cloud API key to Places API (New) — SEC-02** - BLOCKED, no commit (checkpoint:human-action, as designed by the plan itself).
3. **Task 3: lib/env.ts, SEC-01 unit tests, and test-env wiring** - `ebc3f4d` (feat) — code portion only (`.env` write of `PLACES_API_KEY` and the live curl verification sub-steps could not run; see below).

**Plan metadata:** this commit (docs: document blocked plan — see final commit below)

## Checkpoint Resolution — Task 1 (Neon DATABASE_URL/TEST_DATABASE_URL)

**Status: BLOCKED — awaiting human action.** Two independent, compounding blockers:

1. **No Neon MCP tooling available.** This session's tool list contained no `mcp__Neon__*` functions, and no Neon MCP server was listed among the available MCP servers, despite the orchestrator prompt's assumption that Neon MCP tools would be present. Per this plan's own Task 1 action text: *"If Neon provisioning tools are not available in this environment or any call fails, do not fabricate a connection string — stop and surface a checkpoint asking the human to create a free-tier project at neon.tech and provide both connection strings manually."* This is exactly that documented fallback branch.
2. **`.env*` files are unreadable and unwritable by this executor regardless.** `.claude/settings.json` in this repo explicitly denies `Read(**/.env*)` and `Write(**/.env*)` for all Claude Code tool calls (confirmed: `Read` on both `.env` and `.env.example` returned "File is in a directory that is denied by your permission settings"; `settings.local.json` is empty, no override). This means even if a human supplies connection strings through conversation, this executor cannot write them into `.env`/`.env.test`/`.env.example` directly — a human with direct filesystem access must do so.

## Checkpoint Resolution — Task 2 (SEC-02, Google Cloud Console)

**Status: BLOCKED — awaiting human action, as designed.** This was always a `checkpoint:human-action` task in the plan itself (no CLI/MCP path exists for Google Cloud Console API key restriction). Not attempted, not simulated, not auto-approved.

## Files Created/Modified
- `lib/env.ts` - server-only, zod-validated `process.env` access; sole sanctioned `process.env` reader
- `tests/unit/lib/env.test.ts` - 4 unit tests for `lib/env.ts` (see Accomplishments)
- `vitest.config.ts` - added `.env.test` dotenv loading + `test.env` block per plan `<interfaces>`, plus the `react-server` resolve-condition fix

## Decisions Made
- Proceeded with Task 3's fully code-only portion (no `.env` dependency) rather than blocking the entire plan on Task 1/Task 2 — `lib/env.ts`, its unit tests, and the `vitest.config.ts` wiring have no runtime dependency on real secrets and are independently valuable/completable.
- Did not write `PLACES_API_KEY` into `.env` (part of Task 3's original action text) — blocked by the same `.env*` permission deny as Task 1, independent of whether Task 2's checkpoint had been resolved.
- Did not attempt the live curl verification sub-steps in Task 3's `<verify>` block (positive Places call, negative Geocoding call) — both require a real, restricted `PLACES_API_KEY` in `.env`, which does not exist yet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `react-server` resolve condition to `vitest.config.ts`**
- **Found during:** Task 3, first `pnpm vitest run tests/unit/lib/env.test.ts` attempt
- **Issue:** `server-only`'s `package.json` exports map only resolves to its no-op `empty.js` under the `react-server` export condition; its `default` condition (which Vitest's `node` environment resolves through by default, via Vite's SSR module resolution) points at `index.js`, which unconditionally throws `"This module cannot be imported from a Client Component module..."`. This broke the success-case unit test (module import itself threw before the zod schema ever ran) — the plan's `<interfaces>` block for `vitest.config.ts` did not include this fix.
- **Fix:** Added `resolve: { conditions: ['react-server'] }` and `ssr: { resolve: { conditions: ['react-server'] } }` to `vitest.config.ts` (the `ssr.resolve` variant was required in addition to the top-level one — Vitest's `node` environment resolves imports through Vite's SSR pipeline, not the plain client `resolve` config alone).
- **Files modified:** `vitest.config.ts`
- **Verification:** `pnpm vitest run tests/unit/lib/env.test.ts` went from 1 failed/3 passed to 4/4 passed after the fix; re-confirmed with the full suite (`pnpm vitest run`, 2 files/5 tests, all pass) and `pnpm run typecheck`.
- **Committed in:** `ebc3f4d` (Task 3 commit)

**2. [Structural blocker — not auto-fixable under any deviation rule] `.env*` Read/Write is hard-denied at the repo permission level**
- **Found during:** Task 1, first attempt to inspect existing `.env`/`.env.example` contents
- **Issue:** This repo's `.claude/settings.json` (`permissions.deny`) explicitly lists `Read(**/.env*)` and `Write(**/.env*)`, blocking all Claude Code `Read`/`Write`/`Edit` tool calls against any `.env*` path, with no `settings.local.json` override. This is a deliberate, project-owner-configured security guardrail (consistent with the global and project `CLAUDE.md`'s "no plaintext secrets... even gitignored files" rule), not a bug — no workaround was attempted, per the explicit instruction to treat this as a legitimate stop-and-report condition rather than fabricate or route around it.
- **Fix:** None applied — this is not fixable by the executor. Documented as a hard blocker requiring human action for every step in this plan (and, transitively, Plan 01-03 onward) that involves writing to `.env`/`.env.example`/`.env.test`.
- **Files modified:** none
- **Verification:** Confirmed via three independent probes: (a) `Read` tool denied on both `.env` and `.env.example`; (b) `Bash` commands referencing `.env` as a literal argument (`grep ... .env`, `wc -c .env`) were denied; (c) direct inspection of `.claude/settings.json` showing the explicit deny rules and an empty `settings.local.json`.
- **Committed in:** N/A (no code change — documented here and in this SUMMARY's Checkpoint Resolution sections)

**3. [Rule 3 - Blocking / test design] Unit test manages `process.env` directly instead of relying on Vitest's global `test.env`**
- **Found during:** Task 3, designing `tests/unit/lib/env.test.ts`
- **Issue:** The plan's `vitest.config.ts` interface sources `test.env.DATABASE_URL` from `process.env.TEST_DATABASE_URL`, itself loaded from `.env.test` — a file that does not exist yet (blocked by Deviation #2 above). Relying on that global value would make the unit test's success case fail (or silently pass against an accidental `undefined`/`"undefined"` string) whenever `.env.test` is absent, which is exactly the state of this repo right now and will remain so until Task 1 is resolved by a human.
- **Fix:** Wrote the test to capture/restore the original `process.env.DATABASE_URL`/`PLACES_API_KEY`, explicitly `delete`/set them per test case, and re-import `lib/env.ts` fresh each time via `vi.resetModules()` + dynamic `import()`. This makes the test fully self-contained and independent of `.env.test`'s existence — consistent with the plan's own stated goal that "later plans' DB-touching tests never block on the SEC-02 human checkpoint's timing," extended here to this plan's own unit test.
- **Files modified:** `tests/unit/lib/env.test.ts`
- **Verification:** All 4 cases pass with no `.env.test` file present in the repo.
- **Committed in:** `ebc3f4d` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking), 1 structural blocker documented (not auto-fixable, requires human action)
**Impact on plan:** The two auto-fixes were required to make Task 3's own acceptance criteria (`pnpm vitest run tests/unit/lib/env.test.ts` passes) achievable at all — no scope creep beyond what Task 3 already specified. The structural `.env*` permission blocker is external to this plan's code and blocks Task 1 and part of Task 3 entirely; it does not affect the correctness of what was built.

## Issues Encountered
- **No Neon MCP tools in this session** despite the orchestrator prompt's assumption — resolved by following the plan's own documented fallback (stop, do not fabricate, surface a checkpoint) rather than guessing or substituting a different provider (e.g. the Supabase MCP tools that *were* available in this session were deliberately not used — a Supabase connection string is incompatible with this stack's locked `@neondatabase/serverless`/`neon-http` driver, and swapping providers would be a Rule 4 architectural decision, not an auto-fix).
- **`.env*` Read/Write hard-denied by repo permission config** — see Deviation #2 above. This is the dominant blocker for this plan; it cannot be resolved by any executor-side workaround and requires a human with local filesystem access.
- **`server-only` + Vitest resolution mismatch** — resolved (see Deviation #1 above), confirmed via actual test runs before/after, not assumed.

## User Setup Required

**Two external services require manual configuration, and — because this repo denies Claude Code any `.env*` file access — the resulting values must be written into the files by a human directly, not by this executor.**

### 1. Neon Postgres provisioning (Task 1 / SEC-01)
1. Go to neon.tech (or your existing Neon account) and confirm/create a project for this app (e.g. `findleads`).
2. Get the default branch/database connection string. Add it to `.env` as:
   ```
   DATABASE_URL=<neon dev connection string>
   ```
3. Provision a second, distinct database target dedicated to integration tests — either a second branch of the same Neon project, or a second lightweight project (e.g. `findleads-test`). Create a new `.env.test` file (it does not exist yet) containing:
   ```
   TEST_DATABASE_URL=<neon test connection string, must differ from DATABASE_URL>
   ```
4. Add empty placeholder lines to `.env.example` (already exists) for both variable names — no real values, e.g.:
   ```
   DATABASE_URL=
   PLACES_API_KEY=
   ```
   (Confirm `TEST_DATABASE_URL` does not need a placeholder in `.env.example` per the plan — it's test-only and never read by the app itself, only by `vitest.config.ts`.)

### 2. Google Cloud Console — restrict the Places API key (Task 2 / SEC-02)
1. Google Cloud Console → **APIs & Services** → **Credentials**.
2. If no API key exists yet for this project, create one (requires Places API (New) to already be enabled).
3. Click the key's name to open its settings.
4. Under **API restrictions**, select **Restrict key**.
5. In the **Select APIs** dropdown, choose **Places API (New)** specifically — do not select "Don't restrict key" or a broader "Google Cloud APIs" grouping.
6. Click **Save**.
7. Add the key to `.env`:
   ```
   PLACES_API_KEY=<restricted key value>
   ```

### 3. After both are done — verification commands (can be re-run by a future Claude Code session, since the resulting `.env` will already exist and this executor never needs to read its contents to use it)
```bash
git check-ignore .env .env.test          # both should print (confirms still gitignored)
pnpm vitest run tests/unit/lib/env.test.ts  # already passes today; will keep passing
curl -s -X POST https://places.googleapis.com/v1/places:searchText \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: $PLACES_API_KEY" \
  -H "X-Goog-FieldMask: places.displayName" \
  -d '{"textQuery":"restaurant in Toronto"}'   # expect a "places" array (positive check)
curl -s "https://maps.googleapis.com/maps/api/geocode/json?address=Toronto&key=$PLACES_API_KEY" \
  | grep -q 'REQUEST_DENIED'                    # expect this to match (negative check — proves the restriction is active)
```

## Next Phase Readiness
- `lib/env.ts` and its unit tests are code-complete and will pick up real secrets automatically once a human populates `.env`/`.env.test` — no further code changes are needed in this file for Plan 01-03 onward.
- **Blocking:** Plan 01-03 (`lib/db/client.ts`, schema, first migration) imports `lib/env.ts` transitively (per this phase's research architecture diagram) and will throw at import time until a real `DATABASE_URL` exists in `.env` — Plan 01-03 cannot be meaningfully executed (beyond writing code that isn't run) until Task 1 above is resolved by a human.
- SEC-02's live curl verification (part of this plan's own Task 3 acceptance criteria) cannot run until both Task 1 and Task 2 are resolved by a human — explicitly deferred, not skipped or falsely marked passing.
- No code-level blockers remain for the SEC-01 mechanism itself.

---
*Phase: 01-data-foundation-security*
*Completed: 2026-07-02 (partial — see status: blocked)*

## Self-Check: PASSED

- FOUND: lib/env.ts, tests/unit/lib/env.test.ts, vitest.config.ts
- FOUND commit: ebc3f4d
- Re-ran `pnpm vitest run` (2 files/5 tests, all pass), `pnpm run typecheck`, `pnpm lint` — all PASS
- Re-ran `grep -c 'NEXT_PUBLIC_' lib/env.ts | grep -qx 0` — PASS
- No unexpected file deletions in the Task 3 commit (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty)
- Confirmed no `.env*` file was created, modified, or staged by this session (`git status --short` shows none)
