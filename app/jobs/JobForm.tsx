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
        setError('Could not start search — check the category and location and try again.')
        return
      }
      setCategory('')
      setLocation('')
      router.refresh()
    } catch {
      // A network-level fetch rejection (offline, server down) must surface
      // like any other failure — never an unhandled promise rejection.
      setError('Could not start search — check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-y border-border py-6">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Business category
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            maxLength={200}
            autoComplete="off"
            placeholder="e.g. shoe repair"
            className="h-11 border border-border bg-background px-3 text-sm font-normal outline-none transition focus:border-accent focus:ring-2 focus:ring-focus"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Location
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
            maxLength={200}
            autoComplete="off"
            placeholder="e.g. Toronto, ON"
            className="h-11 border border-border bg-background px-3 text-sm font-normal outline-none transition focus:border-accent focus:ring-2 focus:ring-focus"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="h-11 bg-accent px-5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
        >
          {submitting ? 'Starting…' : 'Start search'}
        </button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger-foreground">{error}</p> : null}
    </form>
  )
}
