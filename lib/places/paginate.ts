// Source: pattern derived from developers.google.com/maps/documentation/places/web-service/text-search
// (nextPageToken pagination) + project-level PITFALLS.md Pitfall 4 (~2-5s activation delay,
// MEDIUM-confidence community-observed figure — Google's own docs describe the token but not
// an exact delay). See 02-RESEARCH.md Code Example 3 / Pitfall 1 / Open Question 3.
export interface RetryConfig {
  maxAttempts: number
  delayMs: number
}

export const DEFAULT_PAGE_TOKEN_RETRY: RetryConfig = { maxAttempts: 3, delayMs: 3000 }

function isTokenNotYetActiveError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('INVALID_REQUEST')
}

/**
 * Fetches a page keyed by `pageToken`, retrying on the documented
 * "token not yet active" condition. Always waits before the FIRST attempt
 * too (Pitfall 1) — the delay is not just a retry backoff, it's a mandatory
 * activation wait.
 */
export async function fetchNextPage<T>(
  fetchPage: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  retry: RetryConfig = DEFAULT_PAGE_TOKEN_RETRY,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    await sleep(retry.delayMs)
    try {
      return await fetchPage()
    } catch (err) {
      if (!isTokenNotYetActiveError(err)) throw err
      lastError = err
    }
  }
  throw lastError
}
