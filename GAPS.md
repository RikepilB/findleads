# GAPS — honest audit (2026-07-06)

> Every weakness found in a full codebase read, ordered by severity. Each entry: what, where,
> why it matters, and a fix scoped to a single small task. Companion to `PROJECT.md`
> (architecture) and `.claude/CLAUDE.md` (operational rules).
>
> Verified-good, for the record: no hardcoded secrets anywhere (checked source + committed
> config; `.env*` properly gitignored; `.mcp.json` uses `${GITHUB_TOKEN}` interpolation);
> Places API key is server-only; CSV formula injection is mitigated and integration-tested;
> SQL is parameterized via Drizzle throughout; job-continuation race is genuinely atomic.

## Status update — 2026-07-18 (fix sweep)

| # | Status |
|---|--------|
| 1 | **FIXED** `29f8ae6` — `packageManager` added |
| 2 | **FIXED (stopgap b)** `d58b594` — CI runs unit suite only + placeholder env; upgrade path: `TEST_DATABASE_URL` repo secret → drop the exclude |
| 3 | **DEFERRED, decided** — no deploy target exists; before any public deploy enable Vercel Deployment Protection (or a shared-secret gate). A client-side token gate would break the app's own UI, so nothing shipped now |
| 4 | **FIXED** `9c33bce` — `z.uuid()` guard, 404 |
| 5 | **FIXED** `9e2091f` — malformed JSON → 400 |
| 6 | **FIXED** `27d0639` — JobForm catch |
| 7 | **FIXED** `4be2598` — terminal-status guard + worker stops on 0-row checkpoint |
| 8 | **FIXED** `2113083` — README/AGENTS/architecture/decisions/tests-README rewritten |
| 9 | **OPEN** — Playwright smoke spec still the next testing investment |
| 10 | **FIXED** `f54163a` — transcripts local-only (moved + gitignored, never committed) |
| 11 | **FIXED** `415a363` — ES/GB/AR/CL rules |
| 12 | **FIXED** `85f64c6` — `lib/format/relativeTime.ts` |
| 13 | **FIXED** `b71ce56` — indexes migrated on dev DB; **test DB still needs `pnpm drizzle-kit migrate` against `.env.test`** (harmless until run — indexes don't affect test correctness) |
| 14 | **FIXED** `4be2598` — errorReason truncated to 200 chars |
| 15 | **FIXED** `a776b92` — nameless places dropped |

Suite after sweep: 123/123 green (was 103), lint/typecheck/build green.

## 1. CI has never run — fails at setup on every push (CRITICAL, confirmed)

- **What:** Every GitHub Actions run since the first push fails in 7-11 seconds with
  `Error: No pnpm version is specified.` — `pnpm/action-setup@v4` requires either a `version`
  input or a `packageManager` field in `package.json`, and neither exists.
- **Where:** `.github/workflows/ci.yml` (line: `uses: pnpm/action-setup@v4`), `package.json`
  (missing `packageManager`).
- **Why it matters:** The advertised gate (lint → typecheck → test → build) has **never
  executed** on GitHub. Every green claim so far is local-only. A regression pushed to master
  would sail through.
- **Fix (single task):** Add `"packageManager": "pnpm@10.30.3"` to `package.json`. Verify the
  next push's run gets past install. (It will then hit gap #2 — do both together.)

## 2. Integration tests cannot pass in CI — no test database (CRITICAL, latent behind #1)

- **What:** The 7 files under `tests/integration/` hit a real Neon database via
  `TEST_DATABASE_URL` loaded from `.env.test` (gitignored). CI has no such secret;
  `vitest.config.ts` then falls back to `postgresql://user:pass@localhost:5432/testdb`, which
  doesn't exist on a GitHub runner → connection failures.
- **Where:** `vitest.config.ts` (fallback env), `tests/integration/**`, `.github/workflows/ci.yml`.
- **Why it matters:** Once #1 is fixed, CI will go red on every push for a different reason,
  and the reflex will be to ignore it — worse than no CI.
- **Fix (single task), pick one:**
  a. Add `TEST_DATABASE_URL` as a GitHub Actions secret (Neon test branch) and pass it in
     `ci.yml`'s env — full-fidelity CI; or
  b. Make CI unit-only: change the test step to
     `pnpm test -- --run --exclude tests/integration/**` and note integration tests are
     local-only.
  (a) is better; (b) is a one-line stopgap.

## 3. Zero protection on cost-incurring endpoints (HIGH if ever deployed; by-design today)

- **What:** No auth and no rate limiting anywhere. `POST /api/jobs` triggers Enterprise-tier
  Places calls (1,000 free/month, then ~$35/1,000). `GET /api/jobs/[id]/export` and the leads
  page expose all data; Server Actions accept CRM writes from anyone.
- **Where:** `app/api/jobs/route.ts`, `app/api/jobs/[id]/route.ts`,
  `app/api/jobs/[id]/export/route.ts`, `app/leads/actions.ts`.
- **Why it matters:** "No auth" is a locked v1 decision for a single-user tool, and there is
  **no deployment yet** — so this is not a live vulnerability. But the repo is public, the
  ambition is to sell it, and the codebase's own rules (`.claude/rules/common/security.md`)
  demand rate limiting + auth checks — the code contradicts its own guardrails. If anyone
  deploys this to a public URL as-is, the Google bill is the blast radius.
- **Fix (single task):** Smallest honest gate: a `JOBS_API_TOKEN` env var checked via a
  shared-secret header in the three route handlers (+ reject Server Actions when absent), or
  enable Vercel Deployment Protection when a deploy target is chosen. Do this BEFORE any
  public deploy; record the decision in `.planning/PROJECT.md` Key Decisions.

## 4. Non-UUID job id returns 500, not 404 (MEDIUM — trivially triggered)

- **What:** `GET /api/jobs/abc` (or `/export`): `getJob('abc')` sends `'abc'` to a Postgres
  `uuid` comparison → `invalid input syntax for type uuid` → unhandled throw → 500.
- **Where:** `app/api/jobs/[id]/route.ts:19`, `app/api/jobs/[id]/export/route.ts:10`
  (both call `getJob(id)` with the raw path segment).
- **Why it matters:** Any URL typo produces a server error (and a stack trace in logs) instead
  of a clean 404. The poller only calls with real ids, so it's cosmetic today — but it's the
  first thing an outside user/tester hits.
- **Fix (single task):** In both routes, validate `id` with `z.uuid()` (Zod 4) before the DB
  call; return the existing 404 JSON on failure. Add one unit test per route
  (`tests/unit/app/api/jobs/[id]/route.test.ts` pattern is already there to copy).

## 5. Malformed JSON body crashes POST /api/jobs with 500 (MEDIUM)

- **What:** `await request.json()` throws on a non-JSON body (empty body, text/plain, broken
  JSON) before Zod ever runs → unhandled 500 instead of a 400.
- **Where:** `app/api/jobs/route.ts:25`.
- **Why it matters:** Contradicts the route's own contract (validated input → 400 with
  issues); `curl -X POST` with no body produces a server error.
- **Fix (single task):** Wrap the `request.json()` in try/catch, return the existing
  `{ error: 'Invalid request body' }` 400 on catch. Add a unit test with a non-JSON body.

## 6. JobForm swallows network failures silently (MEDIUM)

- **What:** `handleSubmit` has `try … finally` with **no catch**. A network-level `fetch`
  rejection (offline, server down) escapes as an unhandled promise rejection; `error` state is
  never set; the user sees nothing happen.
- **Where:** `app/jobs/JobForm.tsx:17-32`.
- **Why it matters:** The only feedback path for the app's primary action fails exactly when
  things are broken. Violates the repo's own no-silent-error-swallowing rule.
- **Fix (single task):** Add `catch { setError('Could not start scrape — check your connection
  and try again.') }` before the `finally`. (No component test infra exists — see #9 — so
  verify manually or add it with #9.)

## 7. Watchdog can flip a still-alive job to error, and the worker resurrects it (MEDIUM off-Vercel, LOW on Vercel)

- **What:** `flagStaleJob` flips a `running` job to `error` after ~8.3min without progress.
  On Vercel the invocation is long dead by then. But under `next start` on a server with no
  execution ceiling, a genuinely slow-but-alive worker (e.g., long Places retries) could be
  flagged `error` mid-run — and its next checkpoint (`updateJobProgress`) **unconditionally
  overwrites status back** to `running`/`done`, because it has no status guard.
- **Where:** `lib/db/jobs.ts:32-57` (`updateJobProgress` — no `WHERE status` guard),
  `lib/db/jobs.ts:80-98` (`flagStaleJob`).
- **Why it matters:** Status can ping-pong `error → running → done` with a stale
  `errorReason` briefly shown to the user. Harmless today (Vercel assumption baked in), a real
  consistency bug if self-hosted — and self-hosting is plausible for this tool.
- **Fix (single task):** Add `inArray(jobs.status, ['pending','running','partial'])` (i.e.,
  never overwrite a terminal `error`/`done`) to `updateJobProgress`'s WHERE, and have
  `runScrapeJob` stop looping when a checkpoint reports 0 rows affected. Keep it one commit
  with a unit test for the 0-rows-affected path.

## 8. Four docs actively lie about the project state (MEDIUM — agents build from these)

- **What / where:**
  - `README.md:17` — "Design locked, **no code written yet**." The MVP is shipped.
  - `AGENTS.md:8-16` — "No source tree yet", "no `package.json`", predicts a `src/` layout
    that doesn't exist (real layout is root-level `app/`, `lib/`).
  - `docs/architecture.md` — "Not yet built"; describes the pre-pivot design; claims "no ToS
    risk," directly contradicting the accepted ToS-risk decision in `.planning/PROJECT.md`.
  - `docs/decisions.md` — ADR log stops at 2026-07-01; missing every post-pivot decision
    (ToS-risk acceptance, businesses/leads split, checkpointed worker, CRM scope).
  - `tests/README.md` — "no `package.json`", "not yet available."
- **Why it matters:** The repo's own philosophy is "the repo is the prompt." A fresh agent
  reading README/AGENTS first will conclude there is no code and try to scaffold or re-spec.
  This is the highest-leverage cheap fix in the repo.
- **Fix (single task each, or one sweep):** Rewrite the stale sections to point at reality:
  README status → shipped MVP + real commands; AGENTS.md structure/commands sections → actual
  tree + `pnpm` scripts; `docs/architecture.md` → either a 5-line pointer to root `PROJECT.md`
  or a real rewrite; append the 4 missing ADRs to `docs/decisions.md` (content can be lifted
  from `.planning/PROJECT.md` Key Decisions). `.claude/CLAUDE.md` is already fixed (2026-07-06).

## 9. No component tests, no E2E — the UI layer is test-blind (MEDIUM)

- **What:** All 103 tests are node-environment unit/integration tests. There is no React
  Testing Library, no jsdom, no Playwright. `tests/e2e/` contains only `.gitkeep`.
  Specifically untested:
  - `JobStatusPoller`'s `router.refresh()`-on-terminal-transition logic — a **real bug found
    only by manual browser QA** (fixed in commit `b1037b3`) — has no regression test; only its
    trivial `isTerminalStatus` helper is covered.
  - `JobForm` submit/error flow (see #6), `NotesField` blur-submit, `ContactedToggle` value
    inversion, both pages' conditional renders (error/zero-result/cap-hit states were
    code-read-verified only, per the phase-5 verification record).
- **Where:** `tests/` (absence), `app/jobs/*.tsx`, `app/leads/*.tsx`.
- **Why it matters:** The MVP's two real shipped bugs (`force-dynamic` missing; stale row
  after poll) were both invisible to the current suite. The layer where bugs actually happened
  is the layer with zero coverage. The golden path was verified manually once — not
  repeatable.
- **Fix (single task):** Don't boil the ocean. One Playwright smoke spec (`tests/e2e/`):
  start `next start` against the test DB, create a job with a stubbed Places response, assert
  the row reaches `done`, leads appear on `/leads`, and export returns CSV. Wire it as a
  separate CI job (needs #1/#2 first). Component-test infra can come later if ever.

## 10. Session transcripts sitting untracked in a public repo's working tree (MEDIUM hygiene)

- **What:** Two `/export` transcript dumps (~730KB total) at repo root, untracked:
  `2026-07-03-154438-…txt`, `2026-07-03-173923-…txt`. Full session logs — tool calls, internal
  reasoning, infra details.
- **Where:** Repo root.
- **Why it matters:** One careless `git add .` publishes them to a public GitHub repo. They
  also don't belong at root (the handoff convention puts transcripts inside
  `docs/handoff/<session>/`).
- **Fix (single task):** Move them into `docs/handoff/2026-07-02-crm-pivot-gsd-init/` (or
  delete them), and add a root-level ignore pattern (e.g. `/2026-*.txt`) to `.gitignore`.
  While there: add `nul` to `.gitignore` too (see PROJECT.md Gotchas — it self-respawns).

## 11. Locale inference silently mis-serves every market except Toronto/Lima (LOW now, known)

- **What:** `LOCALE_RULES` has exactly two entries; any other location ("Barcelona",
  "Buenos Aires", "São Paulo") silently gets `en`/`CA`, biasing Places results language and
  ranking.
- **Where:** `lib/places/locale.ts:13-16`.
- **Why it matters:** The location field is free-text by design and the user has already
  talked about Barcelona/London/Buenos Aires/Santiago. Wrong-locale searches degrade result
  quality invisibly — no error, just worse leads.
- **Fix (single task):** Extend `LOCALE_RULES` with rules for the next named markets (one line
  each + one test each in `tests/unit/lib/places/locale.test.ts`). Do NOT build geocoding —
  explicitly ruled out.

## 12. `relativeTime` duplicated across both pages (LOW)

- **What:** Identical 13-line helper in `app/jobs/page.tsx:96-108` and
  `app/leads/page.tsx:78-90` (the comment even admits it "mirrors" the other).
- **Why it matters:** Pure drift risk; already the repo's only copy-pasted logic.
- **Fix (single task):** Extract to `lib/format/relativeTime.ts`, import in both pages, add a
  small unit test. No behavior change.

## 13. Missing indexes + unbounded list queries (LOW at current scale)

- **What:** (a) `leads.job_id` FK has no index (Postgres doesn't auto-index FKs) — the
  export join and per-job queries scan; (b) `businesses` has no index on `updated_at` —
  `listBusinesses` sorts every row; (c) `listBusinesses`/`listJobs` have no LIMIT/pagination —
  `/leads` renders every business ever seen.
- **Where:** `lib/db/schema.ts`, `lib/db/businesses.ts:51-53`, `lib/db/jobs.ts:28-30`.
- **Why it matters:** Irrelevant at hundreds of rows; a slow page and heavy DB round-trips at
  tens of thousands (each scrape adds ≤60). Months away from mattering, if ever.
- **Fix (single task):** One additive migration adding `index on leads(job_id)` and
  `index on businesses(updated_at desc)`. Leave pagination until the UI needs it.

## 14. Raw upstream error bodies stored and shown to the user (LOW)

- **What:** `PlacesApiError.message` embeds the entire Google error response body; a `ZodError`
  message is a JSON dump of issues. Both pass the allowlist in `runScrapeJob`'s catch and land
  in `jobs.error_reason`, which `/jobs` renders verbatim.
- **Where:** `lib/jobs/runScrapeJob.ts:126-138`, `lib/places/client.ts:40-48`,
  `app/jobs/page.tsx:62-70`.
- **Why it matters:** Not a secret leak (the key is never in the response), but a wall of JSON
  in a user-facing table cell. Note: `paginate.ts` matches retries on
  `message.includes('INVALID_REQUEST')` — any truncation must preserve the reason token.
- **Fix (single task):** Truncate `errorReason` to ~200 chars at the write site in
  `runScrapeJob`'s catch (keep the start of the message, which contains the status + reason).
  One unit test.

## 15. Empty business names stored as `''` (COSMETIC)

- **What:** `mapPlaceToLead` falls back to `''` when `displayName` is absent; that empty
  string satisfies the NOT NULL column and renders as a blank cell.
- **Where:** `lib/places/mapPlaceToLead.ts:40`, `lib/db/schema.ts` (`business_name` NOT NULL).
- **Why it matters:** A nameless lead is useless but survives filtering and occupies CRM rows.
  Rare (Google nearly always returns a name).
- **Fix (single task):** Return `null` from `mapPlaceToLead` when `displayName?.text` is
  missing/empty (treat like a closed business). One unit test with a nameless fixture place.

---

### Not gaps (checked, deliberate — don't "fix")

- Per-job dedup only (`unique(job_id, place_id)`) — global dedup is explicitly out of scope.
- Storing Places content durably despite the ToS "No Caching" clause — accepted, documented
  decision; revisit only at public/paid launch.
- SWR not polling in hidden tabs — default behavior, accepted.
- No job-deletion feature (and `leads.job_id ON DELETE NO ACTION`) — manual cleanup must
  delete `leads` before `jobs` (relevant to GitHub issue #3).
- `drizzle.config.ts` reading `process.env` directly with `!` — CLI-only file, can't import
  the `server-only` env module.
