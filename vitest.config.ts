import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { config as loadEnv } from 'dotenv'

// Loads TEST_DATABASE_URL from .env.test (if present) so DB-touching tests
// (Plan 01-05) get an isolated real test database, decoupled from the
// production .env and from the SEC-02 checkpoint's completion state.
loadEnv({ path: '.env.test' })

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // `server-only`'s package.json only maps to a no-op under the
    // `react-server` export condition; Vitest's default Node resolution
    // otherwise resolves to the throwing `index.js` branch, breaking every
    // test that imports a server-only module (e.g. lib/env.ts). Vitest's
    // `node` environment resolves modules through Vite's SSR pipeline, so
    // the condition must be set under `ssr.resolve` too — the top-level
    // `resolve.conditions` alone does not reach SSR module resolution.
    conditions: ['react-server'],
  },
  ssr: {
    resolve: {
      conditions: ['react-server'],
    },
  },
  test: {
    environment: 'node',
    env: {
      // Falls back to a syntactically valid Postgres URL when
      // TEST_DATABASE_URL is unset (no .env.test provisioned yet — see
      // 01-02-SUMMARY.md). Without this fallback, Vitest's `test.env`
      // assigns `undefined` to process.env.DATABASE_URL, which Node's
      // process.env setter coerces to the literal string "undefined";
      // z.url().parse("undefined") then throws at module-load time for
      // any test that transitively imports lib/env.ts (e.g.
      // lib/places/client.ts in Plan 02-03). Keep this additive — do not
      // replace TEST_DATABASE_URL outright — so Plan 01-05's real-database
      // integration-test path is unaffected once .env.test exists.
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://user:pass@localhost:5432/testdb',
      PLACES_API_KEY: 'vitest-placeholder-not-a-real-key',
    },
  },
})
