import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJobMock = vi.fn()
vi.mock('@/lib/db/jobs', () => ({
  getJob: (...args: unknown[]) => getJobMock(...args),
}))

const buildJobLeadsCsvMock = vi.fn()
vi.mock('@/lib/csv/export', () => ({
  buildJobLeadsCsv: (...args: unknown[]) => buildJobLeadsCsvMock(...args),
}))

function makeRequest() {
  return new Request('http://localhost/api/jobs/test-job-id/export')
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/jobs/[id]/export', () => {
  beforeEach(() => {
    getJobMock.mockReset()
    buildJobLeadsCsvMock.mockReset()
  })

  it('returns 404 when the job does not exist', async () => {
    getJobMock.mockResolvedValue(undefined)
    const { GET } = await import('@/app/api/jobs/[id]/export/route')

    const res = await GET(makeRequest(), makeParams('missing-id'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: 'Job not found' })
    expect(buildJobLeadsCsvMock).not.toHaveBeenCalled()
  })

  it('returns 409 when the job is not done, without calling buildJobLeadsCsv', async () => {
    getJobMock.mockResolvedValue({ id: 'test-job-id', status: 'partial' })
    const { GET } = await import('@/app/api/jobs/[id]/export/route')

    const res = await GET(makeRequest(), makeParams('test-job-id'))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({ error: 'Job is not complete yet', status: 'partial' })
    expect(buildJobLeadsCsvMock).not.toHaveBeenCalled()
  })

  it('returns 200 with the CSV body and headers for a done job', async () => {
    getJobMock.mockResolvedValue({ id: 'test-job-id', status: 'done' })
    buildJobLeadsCsvMock.mockResolvedValue('business_name,phone\nMaple Diner,416-555-0100\n')
    const { GET } = await import('@/app/api/jobs/[id]/export/route')

    const res = await GET(makeRequest(), makeParams('test-job-id'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="job-test-job-id-leads.csv"',
    )
    expect(body).toBe('business_name,phone\nMaple Diner,416-555-0100\n')
    expect(buildJobLeadsCsvMock).toHaveBeenCalledWith('test-job-id')
  })
})
