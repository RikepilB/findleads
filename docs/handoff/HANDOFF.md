# findleads — Handoff (father)

**Read this first.** Whole-project handoff. Freshest state on top, then an append-only
index of every session folder. Nothing here is ever deleted — full prose lives in each
session's own `HANDOFF.md`; this file is the map.

## How this works (tree of context)

```
docs/handoff/
  HANDOFF.md                  ← this file (father): rolling current state + session index
  .current-session            ← pointer: active session folder name (used by the hooks)
  _meta/TEMPLATE.md           ← per-session template
  <YYYY-MM-DD>-<name>/        ← one immutable folder per session
    HANDOFF.md                ← session digest: goal · done · files · failed · next
    transcript.md             ← optional full /export archive
```

**Rules:** append, never overwrite. Only the father's `## Current state` is replaced each
session. Solved tasks → one concrete one-liner (file / PR / command).

---

## Current state — 2026-07-02

Design pivoted from a plain scraper to **web-presence filtering (no-website businesses) + a
lightweight CRM** as the core v1 hook. Full GSD planning pipeline is now complete: research (4
domain agents + synthesis) → `REQUIREMENTS.md` (27 v1 requirements) → `ROADMAP.md` (5 phases,
Vertical MVP mode, 100% requirement coverage). A real Places API ToS conflict was surfaced by
research (storing full lead data beyond `place_id` breaches the "No Caching" clause) —
presented to the user, who chose to **accept the risk** for this personal tool, revisit before
any public/paid launch.

**Autopilot mode active** (user confirmed via `/goal`: recommended choices + full autonomy,
stop only for irreversible/detrimental changes). All secrets are now set up (Neon
`findleads` project `polished-wildflower-97333280`, dev+test branches; Google Cloud project
`findleads-501305` with Places API (New) enabled and the key restricted — SEC-02 confirmed
directly by the user).

**Phase 1 (Data Foundation & Security): SHIPPED.** All 5 waves executed against real Neon
Postgres — schema, Drizzle client, DAL (`lib/db/{jobs,businesses,leads}.ts`), integration
tests. `gsd-verifier` scored 5/5. Marked complete.

**Phase 2 (Places API Scrape Client): SHIPPED.** All 4 plans executed, verified independently
by `gsd-verifier`. Two real bugs caught and fixed along the way: (1) accented "Perú" didn't
match the locale regex (JS `\b` is ASCII-only) — fixed via diacritic stripping; (2)
`PlacesApiError.message` didn't include the response body, so the pagination-retry matcher
would never fire on a real API error — fixed, regression-tested. **Lesson: verification
passing doesn't mean a later phase can't surface a latent bug in already-shipped code.**

**Phase 3 (Job Creation & Checkpointed Worker): 2/3 plans done.** 03-01 (checkpoint
primitives, additive jobs-schema migration on both real Neon DBs) and 03-02 (runScrapeJob
checkpointed worker loop, including a composition test exercising the real Places-client
wiring) both executed clean, all tests green. **03-03 (`POST /api/jobs` route + integration
proof) is the next and last plan** — paused deliberately at this clean, durable point rather
than push further in a strained context window (a subagent itself flagged high context and
recommended the pause).

Full test suite: 49+ tests green across Phases 1-3 combined, typecheck/lint clean throughout.
Earlier: walked the user through Google Cloud project setup via Chrome automation, then
handed the credential-restriction step to the user per their own request. Delivered a
live-fetched cost breakdown (Enterprise-tier billing, $35/1000 calls after 1,000/month free,
~$0/month at MVP scale). Stale pre-pivot docs were reconciled earlier — `.planning/` is the
source of truth. TaskCreate #10-15 tracks phase-by-phase progress. Repo is public on GitHub
(`RikepilB/findleads`), MIT
licensed, `master` ~38 commits ahead of `origin/master` (LICENSE push was the last confirmed
push; not auto-pushing further work — treating that as a deliberate batched confirm point).

---

## Session index (append-only, newest first)

- 2026-07-02-crm-pivot-gsd-init — pivoted design to web-presence filter + CRM, fixed an
  unauthorized public push (made private then user explicitly open-sourced it under MIT),
  initialized full `.planning/` GSD project, wrote `PROJECT.md`, kicked off domain research.
- 2026-07-01-mvp-design-brainstorm — architecture/data-model brainstorming, several MVP
  decisions locked in, ended mid-design awaiting user approval on section 1. Migrated from a
  root-level `PROYECTOS/handoff.md` that predated this repo's own handoff tree.

<!-- compact-handoff:auto-snapshot -->
<!-- Latest auto-snapshot: docs/handoff/2026-07-02-crm-pivot-gsd-init/snapshot-193238.md -->
## Latest auto snapshot — 2026-07-02T19:32:38.657Z
- Session folder: `docs/handoff/2026-07-02-crm-pivot-gsd-init/`
- Snapshot file: `docs/handoff/2026-07-02-crm-pivot-gsd-init/snapshot-193238.md`
- Branch: master
