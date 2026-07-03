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
