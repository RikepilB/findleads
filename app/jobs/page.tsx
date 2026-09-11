import { listJobs } from '@/lib/db/jobs'
import { relativeTime } from '@/lib/format/relativeTime'
import type { ReactNode } from 'react'
import JobForm from './JobForm'
import JobStatusPoller from './JobStatusPoller'

export const dynamic = 'force-dynamic'

export default async function JobsPage() {
  const rows = await listJobs()
  const active = rows.filter((row) => ['pending', 'running', 'partial'].includes(row.status)).length
  const completed = rows.filter((row) => row.status === 'done').length
  const failed = rows.filter((row) => row.status === 'error').length
  const totalLeads = rows.reduce((sum, row) => sum + row.leadsFound, 0)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium text-accent">Scrape runs</p>
      <div className="mt-2 mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Find a focused batch of leads</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each run searches up to 3 Google Places pages and stores up to 60 businesses. Narrow categories and locations produce cleaner outreach lists.
          </p>
        </div>
        <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">Capacity:</span> 60 results per run</p>
      </div>

      <JobForm />

      <section aria-label="Run summary" className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
        <RunMetric label="Active" value={active} />
        <RunMetric label="Completed" value={completed} />
        <RunMetric label="Failed" value={failed} />
        <RunMetric label="Leads collected" value={totalLeads} />
      </section>

      {rows.length === 0 ? (
        <div className="py-14 text-center">
          <h2 className="text-sm font-semibold">No scrape runs yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your first run will appear here with live status and export access.</p>
        </div>
      ) : (
        <section className="mt-8" aria-labelledby="run-history-heading">
          <h2 id="run-history-heading" className="mb-4 text-base font-semibold">Run history</h2>
          <div>
            <table className="block w-full border-collapse text-sm md:table md:min-w-[820px]">
              <thead className="hidden md:table-header-group">
                <tr className="border-b border-border text-left">
                  <Header>Status</Header>
                  <Header>Search</Header>
                  <Header>Location</Header>
                  <Header>Results</Header>
                  <Header>Activity</Header>
                  <Header>Output</Header>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border py-5 align-top md:table-row md:py-0 md:hover:bg-surface/60"
                  >
                    <td className="order-3 p-0 md:table-cell md:p-3">
                      <MobileLabel>Status</MobileLabel>
                      <JobStatusPoller jobId={row.id} initialStatus={row.status} initialLeadsFound={row.leadsFound} />
                    </td>
                    <td className="order-1 col-span-2 p-0 font-semibold md:table-cell md:p-3 md:font-medium">{row.category}</td>
                    <td className="order-2 col-span-2 p-0 text-muted-foreground md:table-cell md:p-3 md:text-foreground">{row.location}</td>
                    <td className="order-4 max-w-64 p-0 tabular-nums md:table-cell md:p-3">
                      <MobileLabel>Results</MobileLabel>
                      <span className="font-semibold">{row.leadsFound}</span>
                      <span className="text-muted-foreground"> / 60</span>
                      {row.resultCapHit ? <p className="mt-1 text-xs leading-5 text-muted-foreground">Limit reached. Refine the category or location for another batch.</p> : null}
                      {row.status === 'done' && row.leadsFound === 0 ? <p className="mt-1 text-xs leading-5 text-muted-foreground">No matches. Try a broader category or location.</p> : null}
                      {row.status === 'error' ? <p className="mt-1 text-xs leading-5 text-danger-foreground">{row.errorReason ?? 'This run failed.'}</p> : null}
                    </td>
                    <td className="order-5 p-0 text-xs text-muted-foreground md:table-cell md:p-3">
                      <MobileLabel>Activity</MobileLabel>
                      <p>Created {relativeTime(row.createdAt)}</p>
                      <p className="mt-1">Updated {relativeTime(row.updatedAt)}</p>
                    </td>
                    <td className="order-6 p-0 text-right md:table-cell md:p-3 md:text-left">
                      <MobileLabel>Output</MobileLabel>
                      {row.status === 'done' ? <a href={`/api/jobs/${row.id}/export`} className="font-semibold text-link hover:underline">Export CSV</a> : <span className="text-muted-foreground">Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}

function RunMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Header({ children }: { children: ReactNode }) {
  return <th className="p-3 text-xs font-semibold text-muted-foreground">{children}</th>
}

function MobileLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium text-muted-foreground md:hidden">{children}</p>
}
