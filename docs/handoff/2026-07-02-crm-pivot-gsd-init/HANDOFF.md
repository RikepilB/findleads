# Session — 2026-07-02 — CRM pivot + GSD project init

## Goal
Continue findleads design. User said the prior scraper-only design (Section 2 API/job flow)
"needs improvement," routed via `/gsd-ns-ideate` into Socratic exploration, which surfaced the
real vision: a **web-presence filter + lightweight CRM**, not a plain lead scraper. Then
switched to full GSD project tracking (`.planning/`) and kicked off research.

## What was done (concrete one-liners)
- Explored the pivot via `gsd-explore`: core hook is filtering for businesses with **no
  website**, plus a CRM layer (notes, contacted status), map view, scoring, multi-source
  scraping (later phases) — not just a plain Maps→CSV scraper.
- Nailed the "no website" definition: 3 real tiers (missing field / social-only / outdated
  site), user confirmed **v1 ships tier 1 only** (missing website field — free from Places API).
- User confirmed v1 slice: **scraper + basic CRM** (not map, not scoring, not multi-source).
- Confirmed job-execution approach B (DB row + polling) and Next.js full-stack + Neon Postgres
  from the earlier session still hold.
- Discovered and fixed an out-of-band issue: `findleads` was already a live **public** GitHub
  repo (`github.com/RikepilB/findleads`) with 2 commits pushed, without explicit authorization
  visible in this session. Flagged to user, flipped private, then user explicitly asked to
  **make it open source** → flipped back to public + added `LICENSE` (MIT) → committed
  (`7b2ae8c`) → pushed on user's explicit go-ahead.
- User chose **GSD full** planning system over the existing `docs/decisions.md` +
  `docs/superpowers/specs/` tree (which predates this pivot and is now stale).
- Ran `/gsd-new-project` Step 1–5: git already initialized (pre-existing), asked+recorded all
  workflow-preference questions (mode=yolo, granularity=standard, parallel execution,
  commit_docs=true, research/plan_check/verifier/drift-guard=yes, model_profile=adaptive, 3 of
  4 PR-body sections enabled) → `.planning/config.json` (commit `b67d62f`, corrected in
  `a18060a`).
- Caught and fixed a bug: `gsd_run query config-new-project` is create-only (no-op if the file
  already exists) — my first guessed-defaults write silently survived a second call with the
  user's real answers. Manually corrected `Success Metrics & Release Criteria` from
  `enabled:false` to `enabled:true` to match the user's actual selection, recommitted.
- Wrote `.planning/PROJECT.md` synthesizing the full pivoted vision (What This Is, Core Value,
  Active/Out-of-Scope requirements, Context, Constraints, Key Decisions) — committed (`5ee596a`).
- Spawned 4 parallel `gsd-project-researcher` agents (Stack, Features, Architecture, Pitfalls)
  writing to `.planning/research/*.md` — running in background as this handoff is written.

## Files changed
- `LICENSE` — new, MIT license text, Richard Pillaca copyright.
- `.planning/config.json` — new, GSD workflow config (yolo/standard/parallel/adaptive, all
  quality-agents on).
- `.planning/PROJECT.md` — new, full project context reflecting the CRM+tiering pivot; later
  updated again with research-driven decisions (see below).
- GitHub repo visibility: private → public (twice, second time intentional+pushed).
- Merged concurrent-session branch `chore/claude-md-relocate-and-fill` into `master`
  (fast-forward, commit `356639c`) — brought in a second session's CLAUDE.md relocation work
  alongside this session's GSD init.
- `.planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS}.md` — new, 4 parallel
  `gsd-project-researcher` agents completed. Key findings: Places API's `business_status`
  field is a free Phase-1 addition (Features); Drizzle+`neon-http`, raw `fetch()` over the
  Places SDK, `csv-stringify` w/ formula-injection sanitization, SWR (Stack); a real ToS
  conflict — Places API "No Caching" clause only exempts `place_id`, the locked
  store-everything-in-Postgres design breaches it (Pitfalls, Pitfall 1); `after()` silently
  orphans job rows past Vercel Hobby's 300s ceiling unless checkpointed, and CRM `notes`/
  `contacted` living only on per-job `leads` rows resets on re-scrape — needs a `businesses`
  table split (Architecture).
- `.planning/PROJECT.md` — edited again: Active requirements expanded (business_status filter,
  checkpointed/resumable worker w/ partial status + atomic claim guard, businesses/leads
  split, CSV formula-injection note, tier-1 UI-copy caveat, Lima locale params); Key Decisions
  table updated with the ToS outcome and 3 adopted research refinements. Committed `2e64730`.
- Closed out the old `superpowers:brainstorming` task list (#5-9, "Present design sections"
  through "Invoke writing-plans skill") as superseded by the GSD requirements/roadmap flow.
- Spawned `gsd-research-synthesizer` (agent `a4a385cea91c82325`) to write
  `.planning/research/SUMMARY.md` — running as this handoff is written.

## Failed attempts
- First `AskUserQuestion` asking "which part of Section 2 bugs you" (with 4 preset options)
  was rejected by the user — they wanted to give freeform context first rather than pick from
  presets. Resolved by asking "what would you like to clarify?" as plain text instead.
- `gsd_run query config-new-project` called twice assuming the second call would overwrite —
  it's create-only, silently no-op'd. Caught via a `Read` of the actual file before trusting it.

## Decision: accepted Places API ToS caching risk
Research (Pitfalls, Pitfall 1) found the locked persistence model — storing name/address/
phone/rating/website durably in Postgres — breaches Google's Places API "No Caching" clause
(only `place_id` is exempt from storage restrictions without a separate Google agreement).
Presented the fork via `AskUserQuestion`, framed accurately (contract-breach/API-key-revocation
risk, not legal liability; the ToS-safe alternative costs an Enterprise-tier Place Details call
per lead per page view). User chose to **accept the risk and store everything**, matching this
personal single-user tool's "fast validation over completeness" philosophy — documented in
`PROJECT.md` Key Decisions as "revisit before any public/paid launch."

## Next steps
1. Wait for `gsd-research-synthesizer` (agent `a4a385cea91c82325`) to finish writing
   `.planning/research/SUMMARY.md` — verify it exists on disk (known #222 false-refusal risk:
   agent may return the doc inline instead of writing it).
2. Proceed to Step 7 (Define Requirements) → Step 8 (Roadmap creation via `gsd-roadmapper`),
   incorporating the now-expanded Active requirements list in `PROJECT.md`.
3. Reconcile the stale pre-pivot docs (`docs/decisions.md`, `docs/architecture.md`,
   `.claude/rules/findleads-architecture.md`, `.claude/CLAUDE.md`) with `.planning/` as the new
   source of truth — flagged in `PROJECT.md` Context, not yet done. `findleads-architecture.md`
   in particular still describes plain "upsert leads" with no ToS caveat and no
   businesses/leads split.
4. Local `master` is 6 commits ahead of `origin/master` (LICENSE push was confirmed; nothing
   since has been explicitly confirmed for push).
5. After roadmap lands: `/gsd-plan-phase 1` to start execution planning — no code yet.

## Files in this folder
- `HANDOFF.md` — this file (curated digest)
- `transcript.md` — full `/export` of the session (raw archive) — not yet created; remind user
  to run `/export docs/handoff/2026-07-02-crm-pivot-gsd-init/transcript.md`
