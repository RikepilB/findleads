# CLAUDE.md — how Claude Code operates in this repo

Loaded automatically at session start. Local overrides go in `CLAUDE.local.md` (gitignored).

## Orientation
- Start a session with the `catch-up` skill (reads `docs/handoff/HANDOFF.md` + git).
- Record finished work with the `handoff-context` skill (append-only — never overwrite).

## Operating rules
- **Package manager:** _TODO (pnpm / npm / poetry / uv …)_ — use one consistently.
- **Git:** never push directly to the default branch. Branch → PR → merge. Conventional commits.
- **Tests:** add focused tests near changed logic. CI gate: lint → typecheck → test → build.
- **Secrets:** never commit `.env*`, tokens, keys. Use `.env.example` for required vars.
- **Rules live in `.claude/rules/`** — `common/` + `typescript/`. Guardrails (what must never
  happen) are `common/coding-rules.md` + `common/review-checklist.md`.

## Architecture
_TODO: module boundaries, entry points. Keep `docs/architecture.md` authoritative._
