# findleads

> **The repo is the prompt.** This README states the product intent; `.claude/CLAUDE.md` /
> `AGENTS.md` state how agents operate; `docs/` holds architecture + decisions; `tests/`
> define expected behavior; `.github/` carries task + review context.

## What it does

A lead-generation tool (RawLeads-style) that scrapes business listings via the official
**Google Places API** for a given area — initial validation targets are **Toronto** and
**Lima, Peru**. A user submits a location + search params, the app runs an async scrape job,
and returns a deduplicated, exportable (CSV) list of businesses. MVP is intentionally narrow:
one data source, no email enrichment, no auth, no billing.

## Status

**Design locked, no code written yet.** Full decision log:
`docs/handoff/2026-07-01-mvp-design-brainstorm/HANDOFF.md`. Next step: write and review
`docs/specs/<date>-findleads-mvp-design.md` before any implementation begins.

## Stack (planned)

- Next.js (App Router), Node runtime API routes — full-stack, single deployable.
- Neon Postgres — DB-backed job queue via a job row + Next.js `after()`, no external queue.
- Google Places API (official API, not scraping) as the only MVP data source.

## Setup

1. Copy `.env.example` → `.env` and fill the values (`DATABASE_URL`, Places API key once
   chosen).
2. `pnpm install` (no `package.json` yet — lands with the first implementation PR).
3. `pnpm dev`.

## Key workflows

- Submit a job: `POST /api/jobs` (location + params) → poll `GET /api/jobs/:id` until done →
  export CSV. Full data flow: `.claude/rules/findleads-architecture.md`.

## Map

- `.claude/CLAUDE.md` — how Claude Code operates in this repo
- `AGENTS.md` — tool-agnostic agent instructions (Claude Code + Codex)
- `.claude/rules/findleads-architecture.md` — locked MVP design (source of truth until code
  exists)
- `docs/architecture.md` — human-facing mirror of the above, updated once code lands
- `docs/decisions.md` — decision log (ADRs)
- `docs/handoff/HANDOFF.md` — append-only session handoff tree
- `.claude/` — agents, rules (guardrails), commands, skills index (committed on purpose —
  it's part of the prompt)
