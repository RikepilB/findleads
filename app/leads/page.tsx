import Link from 'next/link'
import { listBusinesses } from '@/lib/db/businesses'
import LeadWorkspace from './LeadWorkspace'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const rows = await listBusinesses()

  if (rows.length === 0) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <p className="text-sm font-medium text-accent">Lead pipeline</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Build your first prospect list</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Search one business category in one location. Results stay here so you can track outreach over time.
        </p>
        <Link href="/jobs" className="mt-6 inline-flex h-10 items-center bg-accent px-4 text-sm font-semibold text-accent-foreground hover:opacity-90">
          Start a scrape
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Lead pipeline</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Prospects worth working</h1>
        </div>
        <Link href="/jobs" className="text-sm font-semibold text-link hover:underline">Run another search</Link>
      </div>
      <LeadWorkspace rows={rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))} />
    </main>
  )
}
