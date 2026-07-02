# findleads — Architecture & Workflow

> **STALE (2026-07-02):** this file predates the CRM-pivot + GSD adoption and describes the
> pre-pivot design (plain "upsert leads", no ToS caveat, no `businesses`/`leads` split). It is
> kept for historical context on the job-execution model, which is still broadly accurate.
> `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and
> `.planning/phases/<NN>-*/*-RESEARCH.md` / `*-PLAN.md` are the current source of truth —
> defer to those wherever this file disagrees. See `.claude/CLAUDE.md` for the summary.

## What this is

A lead-generation scraper (RawLeads-style) over the official **Google Places API** — not
scraping, not headless browsing. Single Next.js deployable, single Neon Postgres database.
Locked in a brainstorming session
(`docs/handoff/2026-07-01-mvp-design-brainstorm/HANDOFF.md`) — nothing below is speculative;
all of it was chosen and agreed with the user.

## MVP scope (what's IN)

- **Source:** Google Places API only. Instagram / general web search / LinkedIn are phase 2.
- **Fields:** whatever Places API returns (name, address, phone, rating, etc.) — **no email**;
  Places API doesn't return it, and email enrichment is explicitly phase 2, not MVP.
- **Targets:** Toronto + Lima, Peru — a free-text location field, not a hardcoded enum.
- **Auth:** none. Single user, no login, no billing, no outreach builder.

## Job execution model

- A **DB row per job** (status, params, results) is the source of truth — no external queue
  (no BullMQ / pg-boss / Redis).
- `POST /api/jobs` creates the row and kicks off the scrape via Next.js `after()` so the
  response returns immediately while the fetch/pagination runs post-response.
- The client **polls** `GET /api/jobs/:id` (~1s interval) until the job completes.
- Rationale: MVP validation for two markets doesn't need real queue infra — `after()` +
  polling is the simplest thing that works. Revisit only if job volume/duration outgrows it.

## Dedup

`unique(job_id, place_id)` — dedup is scoped to a single job's results only. **No cross-job
global dedup in MVP** — re-running a job for the same area can and will re-surface the same
places. Don't build global dedup until asked; it's an explicit non-goal for now.

## Data flow (once implemented)

1. `POST /api/jobs` — validate location + params (Zod), insert job row (`status: pending`),
   call `after(runScrapeJob(jobId))`, return `{ jobId }` immediately.
2. `runScrapeJob` — call Places API (handle pagination + partial-page failures), upsert leads
   with the per-job dedup key, update job row (`status: done|error`, result count).
3. `GET /api/jobs/:id` — return current status + results (or partial results while running).
4. CSV export — reads a completed job's leads; no separate job needed.

## Error handling (design intent — confirm in the spec before building)

- Places API failures (rate limit, invalid key, zero results) → job `status: error` with a
  human-readable reason, not a silent empty result.
- Partial pagination failure → keep what was fetched, mark job `partial`, don't discard.
- Zero results → a valid, non-error outcome — distinguish it from a real failure in the UI.

## Testing intent

- Unit: dedup logic, CSV export, Places-API-response → lead mapping.
- Integration: job creation + a **mocked** Places API (never hit the real API in tests).
- Light E2E: create a job → see it complete → export CSV.

## Do not build yet (superseded)

The spec-doc gate below is superseded by GSD's own planning flow — see the STALE banner at
the top of this file. Current process: `/gsd-plan-phase N` produces
`.planning/phases/<NN>-*/*-PLAN.md`, which is what `/gsd-execute-phase N` builds from.

<details>
<summary>Original (pre-GSD) gate, kept for history</summary>

No code exists. Before writing implementation:
1. Write `docs/specs/<date>-findleads-mvp-design.md` covering all of the above plus the
   remaining open sections (API routes, error handling, testing) from the brainstorming
   session's own next-steps.
2. Self-review the spec (placeholders / contradictions / ambiguity / scope).
3. Get user sign-off on the written spec.
4. Run the `writing-plans` skill for an implementation plan — do not start coding directly
   from this file or from conversation memory.

</details>

## Git workflow

| When | Action |
|---|---|
| Starting a feature | Branch: `feat/<name>` or `fix/<name>` from `main` |
| Before merging | `pnpm lint && pnpm typecheck && pnpm test` (once these commands exist) |
| Schema changes | Own commit, additive migrations only — never edit/delete a shipped one |

## Key reminders

- **No code, no `package.json`, no lockfile yet** — this file describes the *design*, not
  existing code. Don't treat any of the above as already implemented.
- **Don't skip the spec step** — the brainstorming session ended specifically flagging this
  as the next step, before any implementation.
