import { describe, expect, it, vi, beforeEach } from 'vitest'
import closedBusinessFixture from '../../../fixtures/places/text-search-with-closed-business.json'

// Mocked at the module boundary (not vi.stubGlobal('fetch', ...)) so the
// composition test below still exercises the real inferLocale +
// buildTextQuery + mapPlaceToLead composition inside defaultFetchOnePage —
// only searchTextPlaces itself is replaced.
const getJobMock = vi.fn()
const updateJobProgressMock = vi.fn()
vi.mock('@/lib/db/jobs', () => ({
  getJob: (...args: unknown[]) => getJobMock(...args),
  updateJobProgress: (...args: unknown[]) => updateJobProgressMock(...args),
}))

const upsertBusinessMock = vi.fn()
vi.mock('@/lib/db/businesses', () => ({
  upsertBusiness: (...args: unknown[]) => upsertBusinessMock(...args),
}))

const insertLeadSnapshotMock = vi.fn()
vi.mock('@/lib/db/leads', () => ({
  insertLeadSnapshot: (...args: unknown[]) => insertLeadSnapshotMock(...args),
}))

const searchTextPlacesMock = vi.fn()
vi.mock('@/lib/places/client', () => ({
  searchTextPlaces: (...args: unknown[]) => searchTextPlacesMock(...args),
}))

import { runScrapeJob } from '@/lib/jobs/runScrapeJob'
import { SAFETY_WINDOW_MS, initialCursor } from '@/lib/jobs/checkpoint'

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    category: 'restaurant',
    location: 'Toronto, ON',
    cursor: null,
    leadsFound: 0,
    status: 'pending',
    ...overrides,
  }
}

function lead(placeId: string) {
  return {
    placeId,
    businessName: `Business ${placeId}`,
    phone: null,
    address: null,
    website: null,
    rating: null,
    reviewCount: null,
    tier: null,
    tierReason: null,
  }
}

beforeEach(() => {
  getJobMock.mockReset()
  updateJobProgressMock.mockReset().mockResolvedValue(undefined)
  upsertBusinessMock.mockReset().mockResolvedValue(undefined)
  insertLeadSnapshotMock.mockReset().mockResolvedValue(undefined)
  searchTextPlacesMock.mockReset()
})

describe('runScrapeJob', () => {
  it('exercises the real defaultFetchOnePage composition (inferLocale + buildTextQuery + searchTextPlaces + mapPlaceToLead)', async () => {
    getJobMock.mockResolvedValue(makeJob())
    searchTextPlacesMock.mockResolvedValue(closedBusinessFixture)

    // No fetchOnePage override — the real defaultFetchOnePage runs.
    await runScrapeJob('job-1', { now: () => 0 })

    expect(searchTextPlacesMock).toHaveBeenCalledTimes(1)
    const [params] = searchTextPlacesMock.mock.calls[0]
    expect(params.textQuery).toContain('restaurant')
    expect(params.textQuery).toContain('Toronto, ON')

    // Fixture has 3 places, 1 CLOSED_PERMANENTLY, correctly excluded by the
    // real mapPlaceToLead.
    expect(upsertBusinessMock).toHaveBeenCalledTimes(2)
    expect(insertLeadSnapshotMock).toHaveBeenCalledTimes(2)

    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({ status: 'done', leadsFound: 2, cursor: null })
  })

  it('checkpoints via updateJobProgress after every unit of work with incrementing leadsFound and advancing cursor (JOB-02)', async () => {
    getJobMock.mockResolvedValue(makeJob())
    const page1Cursor = { pageToken: null, pagesFetched: 1, done: false }
    const page2Cursor = { pageToken: null, pagesFetched: 2, done: true }
    const fetchOnePage = vi
      .fn()
      .mockResolvedValueOnce({ mapped: [lead('a')], nextCursor: page1Cursor })
      .mockResolvedValueOnce({ mapped: [lead('b'), lead('c')], nextCursor: page2Cursor })

    await runScrapeJob('job-1', { now: () => 0, fetchOnePage })

    // status='running' is written once before the loop begins.
    expect(updateJobProgressMock.mock.calls[0][1]).toMatchObject({
      status: 'running',
      leadsFound: 0,
      cursor: initialCursor(),
    })

    const runningCalls = updateJobProgressMock.mock.calls.filter(
      ([, params]) => params.status === 'running',
    )
    expect(runningCalls).toHaveLength(3) // initial + page1 checkpoint + page2 checkpoint
    expect(runningCalls[1][1]).toMatchObject({ leadsFound: 1, cursor: page1Cursor })
    expect(runningCalls[2][1]).toMatchObject({ leadsFound: 3, cursor: page2Cursor })

    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({ status: 'done', leadsFound: 3, cursor: null })
  })

  it('stops before another fetchOnePage call once now() exceeds startedAt + SAFETY_WINDOW_MS, marking partial with the last-saved cursor (JOB-03)', async () => {
    getJobMock.mockResolvedValue(makeJob())
    const cursorAfterPage1 = { pageToken: 'token-2', pagesFetched: 1, done: false }
    const fetchOnePage = vi
      .fn()
      .mockResolvedValueOnce({ mapped: [lead('a')], nextCursor: cursorAfterPage1 })

    let callCount = 0
    const now = () => {
      callCount += 1
      // 1st call: startedAt. 2nd call: safety check before page 1 (must
      // pass through). 3rd call: safety check before page 2 (must trip).
      return callCount <= 2 ? 0 : SAFETY_WINDOW_MS + 1
    }

    await runScrapeJob('job-1', { now, fetchOnePage })

    expect(fetchOnePage).toHaveBeenCalledTimes(1)
    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({
      status: 'partial',
      cursor: cursorAfterPage1,
      leadsFound: 1,
    })
  })

  it('does not add new dedup logic — a lead repeated across two fetchOnePage calls is passed to insertLeadSnapshot both times, relying on onConflictDoNothing (JOB-07)', async () => {
    getJobMock.mockResolvedValue(makeJob())
    const duplicateLead = lead('dup-1')
    const fetchOnePage = vi
      .fn()
      .mockResolvedValueOnce({
        mapped: [duplicateLead],
        nextCursor: { pageToken: 'x', pagesFetched: 1, done: false },
      })
      .mockResolvedValueOnce({
        mapped: [duplicateLead],
        nextCursor: { pageToken: null, pagesFetched: 2, done: true },
      })

    await runScrapeJob('job-1', { now: () => 0, fetchOnePage })

    expect(insertLeadSnapshotMock).toHaveBeenCalledTimes(2)
    expect(insertLeadSnapshotMock).toHaveBeenNthCalledWith(1, 'job-1', duplicateLead)
    expect(insertLeadSnapshotMock).toHaveBeenNthCalledWith(2, 'job-1', duplicateLead)
    expect(upsertBusinessMock).toHaveBeenCalledTimes(2)
  })

  it('resumes from a persisted cursor and leadsFound rather than starting over', async () => {
    const savedCursor = { pageToken: 'resume-token', pagesFetched: 1, done: false }
    getJobMock.mockResolvedValue(makeJob({ cursor: savedCursor, leadsFound: 5 }))
    const fetchOnePage = vi.fn().mockResolvedValueOnce({
      mapped: [lead('a')],
      nextCursor: { pageToken: null, pagesFetched: 2, done: true },
    })

    await runScrapeJob('job-1', { now: () => 0, fetchOnePage })

    expect(fetchOnePage).toHaveBeenCalledWith('restaurant', 'Toronto, ON', savedCursor)
    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({ status: 'done', leadsFound: 6 })
  })

  it('resolves to status=error with the raw message for a PlacesApiError thrown inside the loop', async () => {
    getJobMock.mockResolvedValue(makeJob())
    class FakePlacesApiError extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'PlacesApiError'
      }
    }
    const fetchOnePage = vi
      .fn()
      .mockRejectedValue(new FakePlacesApiError('Places API request failed: 400: INVALID_REQUEST'))

    await runScrapeJob('job-1', { now: () => 0, fetchOnePage })

    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({
      status: 'error',
      errorReason: 'Places API request failed: 400: INVALID_REQUEST',
    })
  })

  it('resolves to status=error with a generic fallback errorReason for an unexpected error type, never leaking the raw message', async () => {
    getJobMock.mockResolvedValue(makeJob())
    const fetchOnePage = vi
      .fn()
      .mockRejectedValue(new Error('connection string leaked: postgres://user:pass@host/db'))

    await runScrapeJob('job-1', { now: () => 0, fetchOnePage })

    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({ status: 'error', errorReason: 'Unexpected worker error' })
  })

  it('throws if the job is not found (nothing to checkpoint against)', async () => {
    getJobMock.mockResolvedValue(undefined)

    await expect(runScrapeJob('missing-job', { now: () => 0 })).rejects.toThrow('missing-job')
  })

  it('flags resultCapHit=true on the final done write when the cap-genuinely-hit page also happens to contain a closed business (SCRAPE-07, Pitfall 1 Option B)', async () => {
    // Job is already at pagesFetched=2 (MAX_PAGES - 1); this fetch will be
    // the 3rd page (pagesFetched === MAX_PAGES). The real defaultFetchOnePage
    // composition runs (no fetchOnePage override) so the raw pagination
    // signal is computed BEFORE mapPlaceToLead's closed-business filter
    // removes the CLOSED_PERMANENTLY place from `mapped`/`leadsFound`.
    const savedCursor = { pageToken: 'token-3', pagesFetched: 2, done: false, capHit: false }
    getJobMock.mockResolvedValue(makeJob({ cursor: savedCursor, leadsFound: 40 }))
    searchTextPlacesMock.mockResolvedValue({
      ...closedBusinessFixture,
      nextPageToken: 'token-4',
    })

    await runScrapeJob('job-1', { now: () => 0 })

    // Fixture has 3 places, 1 CLOSED_PERMANENTLY, correctly excluded by the
    // real mapPlaceToLead — leadsFound only grows by 2, not 3.
    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({
      status: 'done',
      leadsFound: 42,
      cursor: null,
      resultCapHit: true,
    })
  })

  it('flags resultCapHit=false when pagination ends naturally (no nextPageToken) even at MAX_PAGES', async () => {
    const savedCursor = { pageToken: 'token-3', pagesFetched: 2, done: false, capHit: false }
    getJobMock.mockResolvedValue(makeJob({ cursor: savedCursor, leadsFound: 40 }))
    searchTextPlacesMock.mockResolvedValue({
      ...closedBusinessFixture,
      nextPageToken: undefined,
    })

    await runScrapeJob('job-1', { now: () => 0 })

    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({ status: 'done', resultCapHit: false })
  })

  it('preserves capHit=true across checkpoints once set, even after cursor is nulled on the final write', async () => {
    getJobMock.mockResolvedValue(makeJob())
    const page1Cursor = { pageToken: 'x', pagesFetched: 1, done: false, capHit: false }
    const page2Cursor = { pageToken: null, pagesFetched: 2, done: true, capHit: true }
    const fetchOnePage = vi
      .fn()
      .mockResolvedValueOnce({ mapped: [lead('a')], nextCursor: page1Cursor })
      .mockResolvedValueOnce({ mapped: [lead('b')], nextCursor: page2Cursor })

    await runScrapeJob('job-1', { now: () => 0, fetchOnePage })

    const finalCall = updateJobProgressMock.mock.calls.at(-1)?.[1]
    expect(finalCall).toMatchObject({ status: 'done', resultCapHit: true })
  })
})
