import { describe, it, expect, vi, beforeEach } from 'vitest'

const afterMock = vi.fn()
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: afterMock }
})

const getJobMock = vi.fn()
const claimPartialJobMock = vi.fn()
const flagStaleJobMock = vi.fn()
vi.mock('@/lib/db/jobs', () => ({
  getJob: (...args: unknown[]) => getJobMock(...args),
  claimPartialJob: (...args: unknown[]) => claimPartialJobMock(...args),
  flagStaleJob: (...args: unknown[]) => flagStaleJobMock(...args),
}))

const runScrapeJobMock = vi.fn()
vi.mock('@/lib/jobs/runScrapeJob', () => ({
  runScrapeJob: (...args: unknown[]) => runScrapeJobMock(...args),
}))

function makeRequest() {
  return new Request('http://localhost/api/jobs/test-job-id')
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const BASE_JOB = {
  id: 'test-job-id',
  category: 'restaurant',
  location: 'Toronto, ON',
  createdAt: new Date('2026-07-03T00:00:00Z'),
  updatedAt: new Date('2026-07-03T00:00:00Z'),
  cursor: { pageToken: 'secret-page-token', pagesFetched: 1, done: false },
  errorReason: null,
}

describe('GET /api/jobs/[id]', () => {
  beforeEach(() => {
    afterMock.mockClear()
    getJobMock.mockReset()
    claimPartialJobMock.mockReset()
    flagStaleJobMock.mockReset()
    runScrapeJobMock.mockClear()
  })

  it('returns 404 when the job does not exist', async () => {
    getJobMock.mockResolvedValue(undefined)
    const { GET } = await import('@/app/api/jobs/[id]/route')

    const res = await GET(makeRequest(), makeParams('missing-id'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: 'Job not found' })
    expect(flagStaleJobMock).not.toHaveBeenCalled()
    expect(claimPartialJobMock).not.toHaveBeenCalled()
  })

  it('reflects a watchdog flip to error on a stale pending/running job', async () => {
    const stale = { ...BASE_JOB, status: 'running', leadsFound: 0 }
    const flagged = { ...stale, status: 'error', errorReason: 'Job timed out — no progress for over 8 minutes' }
    getJobMock.mockResolvedValue(stale)
    flagStaleJobMock.mockResolvedValue(flagged)
    const { GET } = await import('@/app/api/jobs/[id]/route')

    const res = await GET(makeRequest(), makeParams('test-job-id'))
    const body = await res.json()

    expect(flagStaleJobMock).toHaveBeenCalledWith('test-job-id')
    expect(body.status).toBe('error')
    expect(body.errorReason).toBe('Job timed out — no progress for over 8 minutes')
    expect(claimPartialJobMock).not.toHaveBeenCalled()
  })

  it('claims and schedules continuation exactly once on a won partial-job race', async () => {
    const partial = { ...BASE_JOB, status: 'partial', leadsFound: 5 }
    const claimed = { ...partial, status: 'running' }
    getJobMock.mockResolvedValue(partial)
    flagStaleJobMock.mockResolvedValue(undefined)
    claimPartialJobMock.mockResolvedValue(claimed)
    const { GET } = await import('@/app/api/jobs/[id]/route')

    const res = await GET(makeRequest(), makeParams('test-job-id'))
    const body = await res.json()

    expect(claimPartialJobMock).toHaveBeenCalledWith('test-job-id')
    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(runScrapeJobMock).not.toHaveBeenCalled() // scheduled, not awaited synchronously
    expect(body.status).toBe('running')

    await afterMock.mock.calls[0][0]()
    expect(runScrapeJobMock).toHaveBeenCalledWith('test-job-id')
  })

  it('does not schedule a second continuation when the claim race is lost', async () => {
    const partial = { ...BASE_JOB, status: 'partial', leadsFound: 5 }
    getJobMock.mockResolvedValue(partial)
    flagStaleJobMock.mockResolvedValue(undefined)
    claimPartialJobMock.mockResolvedValue(undefined) // another poll already won
    const { GET } = await import('@/app/api/jobs/[id]/route')

    const res = await GET(makeRequest(), makeParams('test-job-id'))
    const body = await res.json()

    expect(claimPartialJobMock).toHaveBeenCalledWith('test-job-id')
    expect(afterMock).not.toHaveBeenCalled()
    expect(body.status).toBe('partial') // reflects current read, unchanged
  })

  it('returns a distinct zero-result done job response, separate from an error response', async () => {
    const done = { ...BASE_JOB, status: 'done', leadsFound: 0, errorReason: null }
    getJobMock.mockResolvedValue(done)
    flagStaleJobMock.mockResolvedValue(undefined)
    const { GET } = await import('@/app/api/jobs/[id]/route')

    const res = await GET(makeRequest(), makeParams('test-job-id'))
    const body = await res.json()

    expect(body.status).toBe('done')
    expect(body.leadsFound).toBe(0)
    expect(body.errorReason).toBeNull()
    expect(claimPartialJobMock).not.toHaveBeenCalled()
  })

  it('never includes the cursor field in the response, regardless of status', async () => {
    const partial = { ...BASE_JOB, status: 'partial', leadsFound: 5 }
    const claimed = { ...partial, status: 'running' }
    getJobMock.mockResolvedValue(partial)
    flagStaleJobMock.mockResolvedValue(undefined)
    claimPartialJobMock.mockResolvedValue(claimed)
    const { GET } = await import('@/app/api/jobs/[id]/route')

    const res = await GET(makeRequest(), makeParams('test-job-id'))
    const body = await res.json()

    expect(body.cursor).toBeUndefined()
    expect(Object.keys(body)).not.toContain('cursor')
  })
})
