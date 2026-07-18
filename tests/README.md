# Tests

> Tests define expected behavior — a quality signal the agent reads.

- `unit/` — pure functions and route handlers with mocked seams (node environment)
- `integration/` — DAL + worker against a REAL Neon test DB (`TEST_DATABASE_URL` from
  `.env.test`, injected as `DATABASE_URL` by `vitest.config.ts`); self-clean in `afterEach`
- `e2e/` — empty today (`.gitkeep`); Playwright smoke spec is the planned first entry
  (GAPS.md #9)

## Running

`pnpm test` (watch) · `pnpm test -- --run` (one-shot) ·
`pnpm test -- --run --exclude "tests/integration/**"` (what CI runs — no test DB there).

Gotcha: vitest resolves with `conditions: ['react-server']` so `server-only` imports work —
importing a client-API package (e.g. `swr`) in a test crashes at load. Put unit-testable
client logic in directive-free modules (`app/jobs/isTerminalStatus.ts` pattern).
