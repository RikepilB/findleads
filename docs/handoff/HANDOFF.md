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

## Current state — 2026-07-03 — MVP COMPLETE

**All 5 phases SHIPPED.** Data foundation/security → Places API client → checkpointed job
worker → monitoring/resumability/export → CRM leads dashboard (UI). 27/27 v1 requirements
satisfied. `gsd-tools query phase.complete 5` confirms `is_last_phase: true`, `next_phase: null`.

**Phase 5 close-out:** `gsd-verifier` found one real gap before sign-off — `app/leads/page.tsx`
was statically prerendered (missing `force-dynamic`, unlike its sibling `/jobs`), so newly
scraped leads wouldn't appear in a production build until an unrelated edit happened to
revalidate the page. Invisible in dev/tests, only visible via `next build`'s route table. Fixed
same-session (one line, commit `1d9b12d`), re-verified green (103/103 tests, typecheck, lint,
build), `05-VERIFICATION.md` updated to `passed`, 7/7.

Autopilot mode active throughout (user's own standing authorization: recommended choices, full
autonomy, stop only for irreversible/detrimental changes). All secrets set up (Neon + Google
Cloud Places API key, restricted, SEC-02 user-confirmed). Places API "No Caching" ToS risk
knowingly accepted for this personal tool (revisit before public launch).

**Open, not yet decided:** repo is public on GitHub (`RikepilB/findleads`), MIT licensed.
`master` far ahead of `origin/master` (only the early LICENSE commit was ever explicitly
confirmed for push) — deliberately deferred to a single batched confirm point until the MVP
shipped; now that it has, this needs to be raised with the user, not pushed unilaterally. What
"Ship MVP" (TaskCreate #15, now in_progress) means beyond the phase-completion bookkeeping
already done — push? a deploy target? a walkthrough? — is also genuinely open; ask, don't assume.

TaskCreate #10-14 all completed, #15 in_progress. Full detail: this session's own
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
