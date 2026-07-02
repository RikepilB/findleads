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
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      PLACES_API_KEY: 'vitest-placeholder-not-a-real-key',
    },
  },
})
