import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PAGE_TOKEN_RETRY, fetchNextPage } from '@/lib/places/paginate'
import { PlacesApiError } from '@/lib/places/client'

describe('fetchNextPage', () => {
  it('waits before the first fetchPage call, not only between retries', async () => {
    const sleepStub = vi.fn().mockResolvedValue(undefined)
    const fetchPage = vi.fn().mockResolvedValue('page-1')

    const result = await fetchNextPage(fetchPage, sleepStub)

    expect(result).toBe('page-1')
    expect(sleepStub).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    // sleep must be invoked before fetchPage on attempt 1
    expect(sleepStub.mock.invocationCallOrder[0]).toBeLessThan(
      fetchPage.mock.invocationCallOrder[0],
    )
  })

  it('retries on a token-not-yet-active error and resolves once fetchPage eventually succeeds', async () => {
    const sleepStub = vi.fn().mockResolvedValue(undefined)
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('INVALID_REQUEST: token not active'))
      .mockRejectedValueOnce(new Error('INVALID_REQUEST: token not active'))
      .mockResolvedValueOnce('page-3')

    const result = await fetchNextPage(fetchPage, sleepStub)

    expect(result).toBe('page-3')
    expect(sleepStub).toHaveBeenCalledTimes(3)
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('rethrows the last error after exhausting DEFAULT_PAGE_TOKEN_RETRY.maxAttempts', async () => {
    const sleepStub = vi.fn().mockResolvedValue(undefined)
    const persistentError = new Error('INVALID_REQUEST: token not active')
    const fetchPage = vi.fn().mockRejectedValue(persistentError)

    await expect(fetchNextPage(fetchPage, sleepStub)).rejects.toThrow(persistentError)
    expect(fetchPage).toHaveBeenCalledTimes(DEFAULT_PAGE_TOKEN_RETRY.maxAttempts)
    expect(sleepStub).toHaveBeenCalledTimes(DEFAULT_PAGE_TOKEN_RETRY.maxAttempts)
  })

  it('rethrows immediately on a non-token error, without retrying', async () => {
    const sleepStub = vi.fn().mockResolvedValue(undefined)
    const rateLimitError = new Error('RATE_LIMITED')
    const fetchPage = vi.fn().mockRejectedValue(rateLimitError)

    await expect(fetchNextPage(fetchPage, sleepStub)).rejects.toThrow(rateLimitError)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(sleepStub).toHaveBeenCalledTimes(1)
  })

  it('retries on a real PlacesApiError whose INVALID_REQUEST reason lives in the response body, not message alone', async () => {
    // Regression test: PlacesApiError's constructor used to set `message` to
    // just the status code — Google's actual error reason (e.g.
    // "INVALID_REQUEST") only ever appears in the response body text, so a
    // real token-not-yet-active failure from searchTextPlaces() would never
    // have matched this retry check. See 03-RESEARCH.md Pitfall 5.
    const sleepStub = vi.fn().mockResolvedValue(undefined)
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(
        new PlacesApiError(400, '{"error":{"status":"INVALID_REQUEST","message":"token not active"}}'),
      )
      .mockResolvedValueOnce('page-2')

    const result = await fetchNextPage(fetchPage, sleepStub)

    expect(result).toBe('page-2')
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('honors a custom RetryConfig overriding DEFAULT_PAGE_TOKEN_RETRY', async () => {
    const sleepStub = vi.fn().mockResolvedValue(undefined)
    const persistentError = new Error('INVALID_REQUEST: token not active')
    const fetchPage = vi.fn().mockRejectedValue(persistentError)

    await expect(
      fetchNextPage(fetchPage, sleepStub, { maxAttempts: 1, delayMs: 10 }),
    ).rejects.toThrow(persistentError)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(sleepStub).toHaveBeenCalledWith(10)
  })
})
