import { afterEach, describe, expect, it, vi } from 'vitest'

// lib/env.ts parses `process.env` at module scope, so these tests manage
// process.env directly (not vitest's global test.env, which loads from
// .env.test — a file that may not exist yet, e.g. before Neon provisioning
// completes) and re-import the module fresh per case via vi.resetModules().

const VALID_DATABASE_URL = 'postgres://user:pass@host:5432/db'
const VALID_PLACES_API_KEY = 'test-placeholder-key'

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL
const ORIGINAL_PLACES_API_KEY = process.env.PLACES_API_KEY

function setEnv(databaseUrl: string | undefined, placesApiKey: string | undefined) {
  if (databaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = databaseUrl

  if (placesApiKey === undefined) delete process.env.PLACES_API_KEY
  else process.env.PLACES_API_KEY = placesApiKey
}

async function importEnv() {
  vi.resetModules()
  return import('@/lib/env')
}

describe('lib/env', () => {
  afterEach(() => {
    setEnv(ORIGINAL_DATABASE_URL, ORIGINAL_PLACES_API_KEY)
  })

  it('throws when DATABASE_URL is missing', async () => {
    setEnv(undefined, VALID_PLACES_API_KEY)
    await expect(importEnv()).rejects.toThrow()
  })

  it('throws when PLACES_API_KEY is missing', async () => {
    setEnv(VALID_DATABASE_URL, undefined)
    await expect(importEnv()).rejects.toThrow()
  })

  it('throws when DATABASE_URL is not a valid URL', async () => {
    setEnv('not-a-valid-url', VALID_PLACES_API_KEY)
    await expect(importEnv()).rejects.toThrow()
  })

  it('parses and returns typed values when both vars are present and valid', async () => {
    setEnv(VALID_DATABASE_URL, VALID_PLACES_API_KEY)
    const { env } = await importEnv()
    expect(env.DATABASE_URL).toBe(VALID_DATABASE_URL)
    expect(env.PLACES_API_KEY).toBe(VALID_PLACES_API_KEY)
  })
})
