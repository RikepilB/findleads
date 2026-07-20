# findleads â€” Handoff (father)

**Read this first.** Whole-project handoff. Freshest state on top, then an append-only
index of every session folder. Nothing here is ever deleted â€” full prose lives in each
session's own `HANDOFF.md`; this file is the map.

## How this works (tree of context)

```
docs/handoff/
  HANDOFF.md                  â† this file (father): rolling current state + session index
  .current-session            â† pointer: active session folder name (used by the hooks)
  _meta/TEMPLATE.md           â† per-session template
  <YYYY-MM-DD>-<name>/        â† one immutable folder per session
    HANDOFF.md                â† session digest: goal Â· done Â· files Â· failed Â· next
    transcript.md             â† optional full /export archive
```

**Rules:** append, never overwrite. Only the father's `## Current state` is replaced each
session. Solved tasks â†’ one concrete one-liner (file / PR / command).

---

## Current state - 2026-07-19 - MVP shipped, GAPS fix-sweep mostly closed, Phase 6 still paused

**MVP shipped** (2026-07-03, see below for full detail) - all 5 phases, 27/27 requirements,
pushed to `origin/master`, repo `RikepilB/findleads` public on GitHub.

**GAPS fix-sweep (2026-07-18, via a Codex-exported session):** worked through `GAPS.md`'s
15-item audit - **13 of 15 closed**, commits `29f8ae6..c95dcde`: CI can now resolve pnpm and
run the unit suite green with a placeholder env (#1, #2), non-UUID job id and malformed JSON
body now 404/400 instead of 500 (#4, #5), JobForm surfaces network-level fetch failures instead
of swallowing them (#6), worker hardened with a terminal-status checkpoint guard + truncated
errorReason (#7, #14), README/AGENTS/architecture pointer rewritten + post-pivot ADRs appended
(#8), nameless Places results dropped instead of stored with an empty name (#15), locale
inference extended to ES/GB/AR/CL markets (#11), shared `relativeTime` helper extracted (#12),
`leads.job_id`/`businesses.updated_at` indexed (#13), session transcript dumps moved off repo
root and gitignored (#10). **#3 decided-deferred, #9 still open** - see `GAPS.md` for which and
why before touching either.

**Phase 6 (UI/UX polish) - still paused, untouched since 2026-07-03.** Brainstorm locked scope
to (A) focused copy/empty-state polish + (B) guided first-run flow on the existing `/jobs` and
`/leads` pages (no new architecture/DB/API), addressing the user's stated pain (flow/feedback/
trust, not visual style). **Still waiting on the user confirming Section 1 (placement)** before
Section 2 (exact copy) gets drafted and the phase spec gets written - GSD hasn't created
Phase 6 in `.planning/` yet because brainstorming's hard gate blocks that. Full detail in
`2026-07-02-crm-pivot-gsd-init/HANDOFF.md`.

**2026-07-19, unrelated one-shot task:** published a public, unlisted foglamp.dev architecture
scan of this repo - https://foglamp.dev/scan/findleads-amc6tw. Confirmed the repo has zero
AI/LLM usage (Places API + Neon CRM only); scan maps the scrape-job pipeline and CRM data flow
instead. `.foglamp/scan.json` is safe to commit (no code/secrets); `.foglamp/scan.lock.json`
holds the edit token and is gitignored. Does not touch or advance the paused Phase 6 brainstorm
above.

**2026-07-19, same day, follow-up: first live-deploy attempt, not yet done.** User asked to
deploy findleads live after seeing the foglamp link. Ruled out Cloudflare Drop (static-only,
incompatible with this app's Server Actions/API routes/Neon DB/`after()` worker); user confirmed
**Vercel via GitHub import** as the path (matches the project's existing assumption that Vercel
Hobby is the deploy target). No git-import tool exists in the connected Vercel MCP surface, and
the account has no team/project yet (`list_projects` errored, `list_teams` empty) - so this has
to happen through Vercel's own dashboard: import `RikepilB/findleads` at vercel.com/new, user
sets `DATABASE_URL` + `PLACES_API_KEY` themselves (never touched by this session), then Deploy.
**Findleads is still not live anywhere as of this writing** - waiting on the user to run that
import.

### Earlier detail (superseded by the summary above; kept for continuity)

**Current state — 2026-07-03 — MVP COMPLETE**

**All 5 phases SHIPPED.** Data foundation/security â†’ Places API client â†’ checkpointed job
worker â†’ monitoring/resumability/export â†’ CRM leads dashboard (UI). 27/27 v1 requirements
satisfied. `gsd-tools query phase.complete 5` confirms `is_last_phase: true`, `next_phase: null`.

**Phase 5 close-out:** `gsd-verifier` found one real gap before sign-off â€” `app/leads/page.tsx`
was statically prerendered (missing `force-dynamic`, unlike its sibling `/jobs`), so newly
scraped leads wouldn't appear in a production build until an unrelated edit happened to
revalidate the page. Invisible in dev/tests, only visible via `next build`'s route table. Fixed
same-session (one line, commit `1d9b12d`), re-verified green (103/103 tests, typecheck, lint,
build), `05-VERIFICATION.md` updated to `passed`, 7/7.

**Then manually walked the golden path** in a real production build (`next start` + Chrome
automation) since tests alone had already missed one real bug â€” confirmed leads/jobs render,
contacted/notes persist across reload, a fresh live scrape's new leads appear on `/leads`
immediately (the actual CRM-01 fix working), SCRAPE-07's cap message renders correctly off
`resultCapHit` even when `leadsFound<60`, and CSV export produces correct sanitized UTF-8 data.
Found and fixed a **second** real gap this way: the job poller's status badge updated live but
`leadsFound`/Export CSV stayed stale until reload â€” fixed with a `router.refresh()` call on
terminal transition (commit `b1037b3`), re-tested live, confirmed working. Golden path is
live-verified; error/empty/JOB-06 zero-result render paths remain code-read-verified only
(low-risk conditional renders, not worth burning API calls to force live) â€” MVP is genuinely
done on the golden path, not just green-on-paper.

Autopilot mode active throughout (user's own standing authorization: recommended choices, full
autonomy, stop only for irreversible/detrimental changes). All secrets set up (Neon + Google
Cloud Places API key, restricted, SEC-02 user-confirmed). Places API "No Caching" ToS risk
knowingly accepted for this personal tool (revisit before public launch).

**Pushed.** User said "ship" â€” pushed `master` to `origin/master` (131 commits, fast-forward,
`7b2ae8c..0c04f17`). Repo `RikepilB/findleads` on GitHub now has the complete MVP.

**Still open (asked user, awaiting answer):**
1. An orphaned `node.exe` on port 3000 (PID 55248, likely a zombie dev server from an earlier
   executor's live testing) â€” offered to kill it, not done unilaterally.
2. Real test data + Places API spend left in the dev DB from manual QA (locksmith/Lima 57
   leads, underwater-basket-weaving 45, pottery-classes 60, one contacted+notes edit on
   "Petite Thuet") â€” offered to clean up, not done unilaterally.

**Post-ship work now in flight (2026-07-03, same day, after push):**
- User confirmed the location field is free-text and works for any city already (Toronto/Lima
  are just the two validated markets) â€” flagged that `lib/places/locale.ts` only has
  language/region hints for those two, everything else falls back to `en`/`CA`; offered to
  extend if the user names which cities (Barcelona/London/Buenos Aires/Santiago mentioned).
- User asked for (a) a usage guide for the current UI and (b) a UI/UX improvement plan â€”
  gave (a) inline in chat. For (b), invoked `superpowers:brainstorming` per its mandatory
  skill-check rule (this is a real design decision, not a quick fix).
- `/handoff-to-issues`: harvested the 2 "still open" cleanup items into GitHub issues â€” user
  said "Yes" to both the issue creation and (interpreted, flagged explicitly to the user) scope
  A for the brainstorm. **Created:** issue #2 "Kill orphaned dev server process on port 3000",
  issue #3 "Clean up manual-QA test data from dev database" (both `chore` label). Repo's
  pre-existing issue #1 ("Write the MVP design spec") is stale/unrelated, left untouched.
- Brainstorming Q1 answered: this is meant to go **international**, with real ambition to
  become a **sellable service** (specific freelancer clients, or distributed online) â€” not
  just a personal tool. Flagged tension with PROJECT.md's current "functional, not polished
  SaaS" framing, doc not yet edited. Scoped this round to **(A) focused visual/UX polish on
  the existing 2 pages, no new features, still single-user** (my recommendation, user's "Yes"
  read as agreeing â€” explicitly flagged that reading so they can correct it).
  Q2 (biggest pain point) answered precisely: **flow + feedback + trust**, not visual polish â€”
  user doesn't know what to write, what works, what to expect, how to start/finish, whether the
  results shown are real. Proposed 3 approaches: (A) inline contextual copy at point of
  confusion, (B) guided first-run empty state replacing the bare "No jobs/leads yet", (C) a
  persistent "How this works" help panel. **User confirmed A+B, skip C.**
  Presented design Section 1 (placement): intro block + field hints + numbered empty-state
  walkthrough + a data-provenance trust line, split per-page (`/jobs` and `/leads` each get
  their own). No new architecture/DB/API â€” pure copy + small JSX additions to the 2 existing
  Server Components. **Awaiting confirm on placement before drafting exact copy.**
  User ran `/gsd-ship` mid-brainstorm â€” checked `init.phase-op`: `phase_found: false`, nothing
  to ship (Phase 5 already went out via direct push to master, this project's
  `branching_strategy: "none"`; the UI/UX work is still pre-spec, no plan/execute/verify cycle
  exists for it yet). Explained the mismatch, redirected back to finishing the brainstorm.

**TaskCreate #10-15 all completed now.** Pushed the 6 handoff-doc commits accumulated since the
MVP push (`0c04f17..ac27e34`) â€” nothing else was pending. "Ship MVP" is fully closed.

**Next up (not started â€” brainstorm not yet approved):** UI/UX improvement round, scoped to
(A) focused polish + (B) guided first-run flow on the existing `/jobs`/`/leads` pages â€”
addresses user's stated pain (flow/feedback/trust, not visual style). User wants this tracked
as **Phase 6** once the design is locked â€” brainstorming's hard gate means Phase 6 isn't
created in `.planning/` yet; still waiting on user confirming Section 1 (placement) before
drafting exact copy (Section 2) and writing the spec. Full detail: this session's own
`2026-07-02-crm-pivot-gsd-init/HANDOFF.md` (append-only log of the whole build).

**2026-07-06 side task, now closed (no effect on the paused brainstorm above):** user asked for a
read/analysis of two external repos, `gosom/google-maps-scraper` (real Go/Playwright scraper,
ToS risk, useful only as an architecture sanity-check for findleads' own job/REST design â€” not a
code source, different method) and `omkarcloud/google-maps-scraper` (confirmed no source code
in the repo at all â€” pure marketing funnel for a closed paid desktop app, nothing usable).
Nothing adopted from either. User then asked to "commit, test, push, ship" â€” `/gsd-ship`
confirmed `phase_found: false` (nothing to ship, same as the earlier check), so ran `pnpm test`
(103/103 green) and pushed the session's own handoff-doc edits only, commit `8c22971`
(`1d426da..8c22971`), repo now fully in sync with origin.

**2026-07-06 knowledge transfer (Fable 5):** full codebase read â†’ wrote root `PROJECT.md`
(narrative architecture/onboarding), root `GAPS.md` (15 severity-ordered weaknesses with
scoped fixes), and rewrote the stale `.claude/CLAUDE.md` (real commands/conventions/gotchas).
Headline discovery: **CI has never run once** â€” every push dies at pnpm setup
(`No pnpm version is specified.`; `package.json` lacks `packageManager`), and after that fix
integration tests still need a CI test-DB decision (GAPS.md #1/#2). Also found: non-UUID job
id â†’ 500, malformed JSON â†’ 500, JobForm missing catch, watchdog/worker status ping-pong
off-Vercel (GAPS.md #4-#7). **Brainstorm Section 1 confirm is still the actual next step for
Phase 6** â€” but GAPS.md #1 (one-line packageManager fix) is the highest-value quick win
available any time.

---

## Session index (append-only, newest first)

- 2026-07-02-crm-pivot-gsd-init â€” pivoted design to web-presence filter + CRM, fixed an
  unauthorized public push (made private then user explicitly open-sourced it under MIT),
  initialized full `.planning/` GSD project, wrote `PROJECT.md`, kicked off domain research.
- 2026-07-01-mvp-design-brainstorm â€” architecture/data-model brainstorming, several MVP
  decisions locked in, ended mid-design awaiting user approval on section 1. Migrated from a
  root-level `PROYECTOS/handoff.md` that predated this repo's own handoff tree.

<!-- compact-handoff:auto-snapshot -->
<!-- Latest auto-snapshot: docs/handoff/2026-07-19-foglamp-scan/snapshot-062739.md -->
## Latest auto snapshot — 2026-07-20T06:27:39.489Z
- Session folder: `docs/handoff/2026-07-19-foglamp-scan/`
- Snapshot file: `docs/handoff/2026-07-19-foglamp-scan/snapshot-062739.md`
- Branch: master
