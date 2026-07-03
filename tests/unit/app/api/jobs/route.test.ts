import { describe, it, expect, vi, beforeEach } from 'vitest'

const afterMock = vi.fn()
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: afterMock }
})

const createJobMock = vi.fn().mockResolvedValue({ id: 'test-job-id' })
vi.mock('@/lib/db/jobs', () => ({
  createJob: (...args: unknown[]) => createJobMock(...args),
}))

const runScrapeJobMock = vi.fn()
vi.mock('@/lib/jobs/runScrapeJob', () => ({
  runScrapeJob: (...args: unknown[]) => runScrapeJobMock(...args),
}))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/jobs', () => {
  beforeEach(() => {
    afterMock.mockClear()
    createJobMock.mockClear()
    runScrapeJobMock.mockClear()
  })

  it('returns jobId immediately and schedules the worker via after() without awaiting it', async () => {
    const { POST } = await import('@/app/api/jobs/route')

    const req = makeRequest({ category: 'restaurant', location: 'Toronto, ON' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({ jobId: 'test-job-id' })
    expect(createJobMock).toHaveBeenCalledWith({ category: 'restaurant', location: 'Toronto, ON' })
    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(runScrapeJobMock).not.toHaveBeenCalled() // not invoked synchronously

    // Invoking the captured callback separately proves it's wired correctly,
    // without that invocation being part of the "immediate response" assertion above.
    await afterMock.mock.calls[0][0]()
    expect(runScrapeJobMock).toHaveBeenCalledWith('test-job-id')
  })

  it('returns 400 without creating a job or scheduling the worker when the body is invalid', async () => {
    const { POST } = await import('@/app/api/jobs/route')

    const req = makeRequest({ category: '', location: 'Toronto, ON' })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Invalid request body')
    expect(Array.isArray(body.issues)).toBe(true)
    expect(createJobMock).not.toHaveBeenCalled()
    expect(afterMock).not.toHaveBeenCalled()
    expect(runScrapeJobMock).not.toHaveBeenCalled()
  })
})
