import { listJobs } from '@/lib/db/jobs'
import { relativeTime } from '@/lib/format/relativeTime'
import JobForm from './JobForm'
import JobStatusPoller from './JobStatusPoller'

// This page reads live job state directly from the DB on every request —
// it must never be statically prerendered at build time (a job history
// table baked in at build time would be permanently stale).
export const dynamic = 'force-dynamic'

export default async function JobsPage() {
  const rows = await listJobs()

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Job History
      </p>
      <h1 className="mt-3 mb-10 font-serif text-3xl italic text-accent">Run a scrape</h1>
      <JobForm />

      {rows.length === 0 ? (
        <div className="mt-10">
          <h2 className="text-sm font-semibold">No jobs yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start your first scrape above — it&apos;ll appear here once it&apos;s running.
          </p>
        </div>
      ) : (
        <table className="mt-10 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Status
              </th>
              <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Category
              </th>
              <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Location
              </th>
              <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Leads found
              </th>
              <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Created
              </th>
              <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Export
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={`border-b border-border ${i % 2 === 1 ? 'bg-surface' : ''}`}>
                <td className="p-2 align-top">
                  <JobStatusPoller jobId={r.id} initialStatus={r.status} />
                </td>
                <td className="p-2 align-top">{r.category}</td>
                <td className="p-2 align-top">{r.location}</td>
                <td className="p-2 align-top">
                  {r.leadsFound}
                  {r.resultCapHit ? (
                    <p className="mt-1 text-xs text-gray-600">
                      60+ results found, showing first 60 — refine your search.
                    </p>
                  ) : null}
                  {r.status === 'done' && r.leadsFound === 0 ? (
                    <div className="mt-1">
                      <p className="text-xs font-semibold">0 leads found.</p>
                      <p className="text-xs text-gray-600">
                        This search came back empty — try a broader category or a larger
                        location. Not every category+location combination has businesses
                        without a website.
                      </p>
                    </div>
                  ) : null}
                  {r.status === 'error' ? (
                    <div className="mt-1">
                      <p className="text-xs font-semibold text-danger-foreground">This job failed.</p>
                      <p className="text-xs text-gray-600">
                        {r.errorReason}. Check the category and location, then start a new
                        scrape — failed jobs aren&apos;t retried automatically.
                      </p>
                    </div>
                  ) : null}
                </td>
                <td className="p-2 align-top text-xs text-gray-500">
                  {relativeTime(r.createdAt)}
                </td>
                <td className="p-2 align-top">
                  {r.status === 'done' ? (
                    <a
                      href={`/api/jobs/${r.id}/export`}
                      className="text-sm font-semibold text-[#2563EB]"
                    >
                      Export CSV
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
