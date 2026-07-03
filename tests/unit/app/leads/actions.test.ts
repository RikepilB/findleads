import { describe, expect, it, vi, beforeEach } from 'vitest'

const updateBusinessNotesMock = vi.fn()
const setBusinessContactedMock = vi.fn()
vi.mock('@/lib/db/businesses', () => ({
  updateBusinessNotes: (...args: unknown[]) => updateBusinessNotesMock(...args),
  setBusinessContacted: (...args: unknown[]) => setBusinessContactedMock(...args),
}))

const revalidatePathMock = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { updateNotesAction, setContactedAction } from '@/app/leads/actions'

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value)
  }
  return fd
}

describe('updateNotesAction', () => {
  beforeEach(() => {
    updateBusinessNotesMock.mockClear()
    revalidatePathMock.mockClear()
  })

  it('calls updateBusinessNotes with parsed values and revalidates on valid input', async () => {
    const fd = makeFormData({ businessId: '42', notes: 'Called, left voicemail' })

    const result = await updateNotesAction(fd)

    expect(result).toEqual({ ok: true })
    expect(updateBusinessNotesMock).toHaveBeenCalledWith(42, 'Called, left voicemail')
    expect(revalidatePathMock).toHaveBeenCalledWith('/leads')
  })

  it('rejects a non-numeric businessId without calling the DAL', async () => {
    const fd = makeFormData({ businessId: 'not-a-number', notes: 'hello' })

    const result = await updateNotesAction(fd)

    expect(result).toEqual({ ok: false, error: 'Invalid input' })
    expect(updateBusinessNotesMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('rejects a zero businessId without calling the DAL', async () => {
    const fd = makeFormData({ businessId: '0', notes: 'hello' })

    const result = await updateNotesAction(fd)

    expect(result).toEqual({ ok: false, error: 'Invalid input' })
    expect(updateBusinessNotesMock).not.toHaveBeenCalled()
  })

  it('rejects a negative businessId without calling the DAL', async () => {
    const fd = makeFormData({ businessId: '-5', notes: 'hello' })

    const result = await updateNotesAction(fd)

    expect(result).toEqual({ ok: false, error: 'Invalid input' })
    expect(updateBusinessNotesMock).not.toHaveBeenCalled()
  })

  it('rejects notes over 2000 characters without calling the DAL', async () => {
    const fd = makeFormData({ businessId: '42', notes: 'a'.repeat(2001) })

    const result = await updateNotesAction(fd)

    expect(result).toEqual({ ok: false, error: 'Invalid input' })
    expect(updateBusinessNotesMock).not.toHaveBeenCalled()
  })
})

describe('setContactedAction', () => {
  beforeEach(() => {
    setBusinessContactedMock.mockClear()
    revalidatePathMock.mockClear()
  })

  it('calls setBusinessContacted with a coerced boolean true and revalidates on valid input', async () => {
    const fd = makeFormData({ businessId: '7', contacted: 'true' })

    const result = await setContactedAction(fd)

    expect(result).toEqual({ ok: true })
    expect(setBusinessContactedMock).toHaveBeenCalledWith(7, true)
    expect(revalidatePathMock).toHaveBeenCalledWith('/leads')
  })

  it('calls setBusinessContacted with a coerced boolean false on valid input', async () => {
    const fd = makeFormData({ businessId: '7', contacted: 'false' })

    const result = await setContactedAction(fd)

    expect(result).toEqual({ ok: true })
    expect(setBusinessContactedMock).toHaveBeenCalledWith(7, false)
  })

  it('rejects an invalid businessId without calling the DAL', async () => {
    const fd = makeFormData({ businessId: 'nope', contacted: 'true' })

    const result = await setContactedAction(fd)

    expect(result).toEqual({ ok: false, error: 'Invalid input' })
    expect(setBusinessContactedMock).not.toHaveBeenCalled()
  })
})
