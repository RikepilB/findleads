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

## Current state — 2026-07-03

**Phases 1-4: SHIPPED** (schema/DAL/security; Places API client; checkpointed job worker;
monitoring/resumability/CSV export). See prior entry below for per-phase detail — unchanged.

**Phase 5 (CRM Leads Dashboard) — FINAL PHASE — Wave 2 executing.** UI-SPEC approved 6/6
(Tailwind-only, no shadcn). Domain research found SCRAPE-07's cap-detection heuristic had a
false-negative mode — fixed via an additive `jobs.resultCapHit` column computed pre-filter
(Option B); also found a client poller is required or Phase 4's JOB-04/JOB-05 continuation/
watchdog go dormant for unwatched jobs. Planner died once mid-stream (nothing lost, respawned
clean), then produced 4 plans across 2 waves + `05-VALIDATION.md`. `gsd-plan-checker` found and
fixed 1 blocker (malformed checkpoint task XML) + 1 stale-doc warning. **Wave 1 shipped**: DAL
functions + `resultCapHit` fix (05-01), shared nav + Google attribution component (05-02) —
98/98 tests green. **Wave 2 in progress**: Leads page/Server Actions (05-03) and Job History
page/swr poller (05-04) executing in parallel now. Once both land + `gsd-verifier` passes +
`phase.complete 5` runs — **the MVP is complete**, no Phase 6.

Autopilot mode active throughout (user's own standing authorization: recommended choices, full
autonomy, stop only for irreversible/detrimental changes). All secrets set up (Neon + Google
Cloud Places API key, restricted, SEC-02 user-confirmed). Places API "No Caching" ToS risk
knowingly accepted for this personal tool (revisit before public launch).

Repo is public on GitHub (`RikepilB/findleads`), MIT licensed. `master` far ahead of
`origin/master` — push deliberately deferred to a single batched confirm point once the MVP
ships, not auto-pushed per phase. TaskCreate #10-15 tracks phase-by-phase progress
(#14 in_progress, #15 "Ship MVP" pending). Full detail: this session's own
`2026-07-02-crm-pivot-gsd-init/HANDOFF.md` (append-only log of the whole build).

---

## Session index (append-only, newest first)

- 2026-07-02-crm-pivot-gsd-init — pivoted design to web-presence filter + CRM, fixed an
  unauthorized public push (made private then user explicitly open-sourced it under MIT),
  initialized full `.planning/` GSD project, wrote `PROJECT.md`, kicked off domain research.
- 2026-07-01-mvp-design-brainstorm — architecture/data-model brainstorming, several MVP
  decisions locked in, ended mid-design awaiting user approval on section 1. Migrated from a
  root-level `PROYECTOS/handoff.md` that predated this repo's own handoff tree.

<!-- compact-handoff:auto-snapshot -->
<!-- Latest auto-snapshot: docs/handoff/2026-07-02-crm-pivot-gsd-init/snapshot-193941.md -->
## Latest auto snapshot — 2026-07-03T19:39:41.758Z
- Session folder: `docs/handoff/2026-07-02-crm-pivot-gsd-init/`
- Snapshot file: `docs/handoff/2026-07-02-crm-pivot-gsd-init/snapshot-193941.md`
- Branch: master
