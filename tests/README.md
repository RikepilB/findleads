# Tests

> Tests define expected behavior — a quality signal the agent reads.

- `unit/` — pure functions, components, isolated logic
- `integration/` — API routes, DB ops, module seams
- `e2e/` — critical user flows end-to-end

## Running
Not yet available — no `package.json`. Planned: `pnpm test`. CI runs
lint → typecheck → test → build.
