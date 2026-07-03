export interface JobCursor {
  pageToken: string | null
  pagesFetched: number
  done: boolean
}

export function initialCursor(): JobCursor {
  return { pageToken: null, pagesFetched: 0, done: false }
}

// ~250s, leaving headroom under Vercel Hobby's non-configurable 300s ceiling
// (vercel.com/docs/functions/configuring-functions/duration).
export const SAFETY_WINDOW_MS = 250_000

// Text Search (New)'s own documented hard cap — 3 pages of up to 20 results
// each (60 total). Enforced defensively here even though Google itself
// should stop returning nextPageToken after page 3.
export const MAX_PAGES = 3

// 2x SAFETY_WINDOW_MS: comfortably beyond even a full safety-window
// invocation plus pagination retry overhead, so a legitimately slow (but
// still in-progress) job is never false-flagged as stale (JOB-05).
export const WATCHDOG_MS = SAFETY_WINDOW_MS * 2 // 500_000ms (~8.3 min)
