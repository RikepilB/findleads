// Shared fetch-stub helper for lib/places/* tests. Every function that calls
// the network (e.g. lib/places/client.ts's searchTextPlaces) accepts an
// injectable fetchImpl parameter defaulting to global fetch — tests pass
// this stub instead, so no global mock/cleanup is needed and no test's stub
// can leak into another (02-RESEARCH.md Pattern 1, Code Example 6).
import { vi } from 'vitest'

export function mockFetchOnce(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch
}
