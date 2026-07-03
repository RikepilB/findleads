'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function JobForm() {
  const router = useRouter()
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, location }),
      })
      if (!res.ok) {
        setError('Could not start scrape — check the category and location and try again.')
        return
      }
      setCategory('')
      setLocation('')
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 flex items-end gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Category
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Location
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-[#2563EB] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Start Scrape
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  )
}
