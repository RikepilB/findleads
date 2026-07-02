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

**Autopilot mode active:** user directed (`/gsd-ship` redirected mid-command) to autonomously
drive plan→execute→verify→ship across all 5 roadmap phases using recommended defaults, with
check-ins only for genuine decision forks. Phase 1 (Data Foundation & Security) is planned
(5 sequential single-plan waves + Walking Skeleton, plan-checker passed after one fixed
blocker) and **execution has started** — Wave 1 (Next.js scaffold, first real code in this
repo) is running. Stale pre-pivot docs (`.claude/CLAUDE.md`,
`.claude/rules/findleads-architecture.md`) have been reconciled — `.planning/` is now
explicitly the source of truth in both files. TaskCreate #10-15 tracks phase-by-phase
progress. Repo is public on GitHub (`RikepilB/findleads`), MIT licensed, `master` 14 commits
ahead of `origin/master` (LICENSE push was the last confirmed push — no further push confirmed
yet).

**Known upcoming blocker (not yet hit):** Phase 1's Wave 2 requires a genuine human action —
restricting the Google Cloud API key to Places API only in Cloud Console — that cannot be
automated from this session. Also unconfirmed whether a Neon `DATABASE_URL` already exists
(Wave 2 attempts MCP-based provisioning first). If reached and unresolvable autonomously, stop
and ask the user rather than fake it.

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
