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

**Autopilot mode active** (user re-confirmed via `/goal`: recommended choices + full autonomy,
stop only for irreversible/detrimental changes). Phase 1 (Data Foundation & Security): Wave 1
done (Next.js scaffold, pnpm/Vitest wired, all checks green — survived 2 mid-run rate-limit
deaths via targeted resume, not restart). Wave 2 built the SEC-01 code mechanism
(`lib/env.ts` + tests) but is **blocked on real secrets**: Neon project `findleads`
(`polished-wildflower-97333280`, dev+test branches) was created with user approval and
connection strings handed to the user to paste into `.env`/`.env.test` (Claude Code is
structurally denied `.env*` read/write/reference by this repo's own permission config — a
deliberate guardrail, applies to Bash literal-argument references too, not worked around).
The Google Cloud Places API key restriction (SEC-02) still needs the user's manual action in
Cloud Console — re-confirmed still pending (checked once more, not polling repeatedly). Phase
1 Waves 3-5 stay correctly blocked/un-faked until both are done.

**Phase 2 (Places API Scrape Client) is fully SHIPPED** — all 4 plans executed, verified
independently by `gsd-verifier` (didn't just trust summaries), marked complete in
ROADMAP/STATE/REQUIREMENTS. Two real bugs caught and fixed along the way, both worth
remembering: (1) accented "Perú" didn't match the locale-detection regex (JS `\b` is
ASCII-only) — fixed via diacritic stripping; (2) `PlacesApiError`'s `.message` didn't include
the response body, so the pagination-retry matcher (checking `.message` for
`INVALID_REQUEST`) would never actually fire against a real API error — this was in
already-*verified* Phase 2 code, surfaced only when Phase 3's research composed the pieces
together. Both fixed with regression tests, all green. **Lesson: verification passing doesn't
mean a later phase can't still surface a latent bug in already-shipped code — worth fixing on
sight, not deferring.**

Now on **Phase 3 (Job Creation & Checkpointed Worker)**: research done, planning in progress.
Phase 3 execution is correctly held blocked pending the same user setup (its worker imports
Phase 1's not-yet-built DB layer) — but planning proceeds now against Phase 1's *locked
interface* so execution is instant-ready once unblocked. Stale pre-pivot docs were reconciled
earlier — `.planning/` is the source of truth. TaskCreate #10-15 tracks phase-by-phase
progress. Repo is public on GitHub (`RikepilB/findleads`), MIT licensed, `master` ~35 commits
ahead of `origin/master` (LICENSE push was the last confirmed push; not auto-pushing further
work — treating that as a deliberate batched confirm point).

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
