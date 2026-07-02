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
lightweight CRM** as the core v1 hook — the earlier 2026-07-01 scraper-only design is
superseded. Project runs on full GSD tracking. All 4 domain research agents (stack/features/
architecture/pitfalls) completed and surfaced a real Places API ToS conflict (the locked
store-everything-in-Postgres design breaches the "No Caching" clause beyond `place_id`) —
presented to the user, who chose to **accept the risk** for this personal single-user tool
(revisit before any public/paid launch). Also adopted 3 research-recommended refinements into
`PROJECT.md`: a `businesses`/`leads` identity-vs-sighting split (fixes "contacted" status
resetting on re-scrape), a checkpointed/resumable `after()` worker (fixes silent timeout past
Vercel Hobby's 300s ceiling), and folding the free `business_status` closed-business filter
into Phase 1. `gsd-research-synthesizer` is writing `.planning/research/SUMMARY.md` next, then
Requirements → Roadmap. Repo is public on GitHub (`RikepilB/findleads`), MIT licensed, `master`
6 commits ahead of `origin/master` (not pushed beyond the earlier confirmed LICENSE push).
**No product code written yet.** The pre-pivot docs (`docs/decisions.md`, `docs/architecture.md`,
`.claude/rules/findleads-architecture.md`, `.claude/CLAUDE.md`) are now stale (still describe
plain "upsert leads" with no ToS caveat) and still need reconciling with `.planning/` as the
source of truth.

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
