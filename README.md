# findleads

> **The repo is the prompt.** This README states the product intent; `.claude/CLAUDE.md` /
> `AGENTS.md` state how agents operate; `PROJECT.md` holds the full architecture narrative;
> `GAPS.md` the honest weakness audit; `tests/` define expected behavior.

## What it does

A personal lead-gen tool over the official **Google Places API (Text Search New)**: search a
business category + free-text location, flag businesses with **no website** (tier-1 leads),
and manage them in a lightweight CRM (notes, contacted flag, CSV export). Validated markets:
**Toronto** and **Lima, Peru** — but location is free text and works anywhere.

## Status

**Shipped, working MVP.** All 5 planned phases complete (27/27 v1 requirements). Single
user, no auth, no deploy target yet — runs locally. `.planning/` is the authoritative
planning record; `PROJECT.md` (repo root) is the narrative walkthrough.

## Stack

- Next.js 16 App Router (full-stack, single deployable), TypeScript strict, Tailwind v4.
- Neon Postgres via Drizzle (`neon-http`); Zod at every boundary; SWR polling on the client.
- DB-backed job rows + Next.js `after()` as the whole async runtime — no external queue.
- Google Places API (official, not scraping) as the only data source.

## Setup

1. Copy `.env.example` → `.env` and fill `DATABASE_URL` (Neon) + `PLACES_API_KEY`.
2. `pnpm install`
3. `pnpm drizzle-kit migrate` (applies `drizzle/*.sql` to your DB)
4. `pnpm dev` → open `/jobs`

## Key workflows

- `/jobs` — start a scrape (category + location), watch it complete live, export CSV.
- `/leads` — every business ever seen, tier-1 (no website) flagged, notes + contacted persist
  across re-scrapes.
- API: `POST /api/jobs` → poll `GET /api/jobs/:id` → `GET /api/jobs/:id/export` (CSV).

## Commands

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test -- --run`
(unit + integration; integration needs a `.env.test` with `TEST_DATABASE_URL`).

## Map

- `PROJECT.md` — full architecture, data flow, design decisions, gotchas (start here)
- `GAPS.md` — severity-ordered audit of known weaknesses
- `.claude/CLAUDE.md` — how Claude Code operates in this repo
- `AGENTS.md` — tool-agnostic agent instructions (Claude Code + Codex)
- `docs/decisions.md` — decision log (ADRs)
- `docs/handoff/HANDOFF.md` — append-only session handoff tree
- `.planning/` — GSD planning record (requirements, roadmap, phase plans)
