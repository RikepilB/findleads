'use client'

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { relativeTime } from '@/lib/format/relativeTime'
import {
  filterLeads,
  safeWebsiteUrl,
  sortLeads,
  summarizeLeads,
  type LeadFilter,
  type LeadSort,
} from '@/lib/leads/tracking'
import ContactedToggle from './ContactedToggle'
import NotesField from './NotesField'

export interface LeadRow {
  id: number
  businessName: string
  phone: string | null
  address: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
  notes: string | null
  contacted: boolean
  updatedAt: string
}

const compactViewport = '(max-width: 1023px)'

const filterLabels: Array<{ value: LeadFilter; label: string }> = [
  { value: 'ready-to-call', label: 'Ready to call' },
  { value: 'to-contact', label: 'To contact' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'no-website', label: 'No website' },
  { value: 'all', label: 'All' },
]

const sortOptions: Array<{ value: LeadSort; label: string }> = [
  { value: 'priority', label: 'Priority first' },
  { value: 'recent', label: 'Recently updated' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'name', label: 'Business name' },
]

export default function LeadWorkspace({ rows }: { rows: LeadRow[] }) {
  const compact = useSyncExternalStore(subscribeToViewport, getViewportSnapshot, getServerSnapshot)
  const pageSize = compact ? 10 : 25
  const metrics = useMemo(() => summarizeLeads(rows), [rows])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LeadFilter>(
    metrics.readyToCall > 0 ? 'ready-to-call' : 'to-contact',
  )
  const [sort, setSort] = useState<LeadSort>('priority')
  const [page, setPage] = useState(1)
  const filterCounts = useMemo(
    () => new Map(filterLabels.map((option) => [option.value, filterLeads(rows, option.value, '').length])),
    [rows],
  )
  const visible = useMemo(
    () => sortLeads(filterLeads(rows, filter, query), sort),
    [filter, query, rows, sort],
  )
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const firstVisible = (currentPage - 1) * pageSize
  const pageRows = visible.slice(firstVisible, firstVisible + pageSize)

  return (
    <>
      <section aria-label="Pipeline summary" className="border-y border-border">
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <Metric label="Tracked" value={metrics.total} />
          <Metric label="Ready to call" value={metrics.readyToCall} emphasis />
          <Metric label="To contact" value={metrics.toContact} />
          <Metric label="Contacted" value={metrics.contacted} detail={`${metrics.contactedPercent}% complete`} />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="lead-list-heading">
        <div className="border-b border-border pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="lead-list-heading" className="text-base font-semibold">Lead queue</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {visible.length} of {rows.length} businesses shown
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="lead-search">Search leads</label>
              <input
                id="lead-search"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="Search name, phone, address, or notes"
                className="h-10 w-full border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-focus sm:w-80"
              />
              <label htmlFor="lead-sort">
                <span className="sr-only">Sort leads</span>
                <select
                  id="lead-sort"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as LeadSort)
                    setPage(1)
                  }}
                  className="h-10 w-full min-w-44 border border-border bg-background px-3 text-sm font-medium outline-none transition focus:border-accent focus:ring-2 focus:ring-focus"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <label htmlFor="lead-filter" className="mt-4 block sm:hidden">
            <span className="sr-only">Filter leads</span>
            <select
              id="lead-filter"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as LeadFilter)
                setPage(1)
              }}
              className="h-10 w-full border border-border bg-background px-3 text-sm font-medium outline-none transition focus:border-accent focus:ring-2 focus:ring-focus"
            >
              {filterLabels.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({filterCounts.get(option.value)})
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 hidden overflow-x-auto border border-border sm:flex" aria-label="Filter leads">
            {filterLabels.map((option) => {
              const active = filter === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFilter(option.value)
                    setPage(1)
                  }}
                  className={`flex h-10 shrink-0 items-center gap-2 border-r border-border px-3 text-xs font-semibold last:border-r-0 ${
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-background text-muted-foreground hover:bg-surface hover:text-foreground'
                  }`}
                >
                  <span>{option.label}</span>
                  <span className={`tabular-nums ${active ? 'text-accent-foreground/75' : 'text-muted-foreground'}`}>
                    {filterCounts.get(option.value)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="border-b border-border py-14 text-center">
            <p className="text-sm font-semibold">No leads match this view</p>
            <button
              type="button"
              onClick={() => {
                setFilter('all')
                setQuery('')
                setSort('priority')
                setPage(1)
              }}
              className="mt-3 text-sm font-semibold text-link hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div>
            <table className="block w-full border-collapse text-sm lg:table lg:min-w-[1050px]">
              <thead className="hidden lg:table-header-group">
                <tr className="border-b border-border text-left">
                  <Header>Business</Header>
                  <Header>Signal</Header>
                  <Header>Contact</Header>
                  <Header>Rating</Header>
                  <Header>Stage</Header>
                  <Header>Notes</Header>
                  <Header>Updated</Header>
                </tr>
              </thead>
              <tbody className="block lg:table-row-group">
                {pageRows.map((lead) => (
                  <tr
                    key={lead.id}
                    className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-border py-5 align-top lg:table-row lg:py-0 lg:hover:bg-surface/60"
                  >
                    <td className="order-1 col-span-2 p-0 lg:table-cell lg:w-52 lg:p-3">
                      <p className="font-semibold text-foreground">{lead.businessName}</p>
                      <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground lg:max-w-52">
                        {lead.address ?? 'Address unavailable'}
                      </p>
                    </td>
                    <td className="order-2 min-w-0 p-0 lg:table-cell lg:w-40 lg:p-3">
                      <MobileLabel>Signal</MobileLabel>
                      <WebsiteSignal website={lead.website} />
                    </td>
                    <td className="order-4 min-w-0 p-0 lg:table-cell lg:w-40 lg:p-3">
                      <MobileLabel>Contact</MobileLabel>
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="font-medium text-link hover:underline">{lead.phone}</a>
                      ) : (
                        <span className="text-muted-foreground">No phone listed</span>
                      )}
                    </td>
                    <td className="order-5 p-0 tabular-nums lg:table-cell lg:w-24 lg:p-3">
                      <MobileLabel>Rating</MobileLabel>
                      {lead.rating ?? '—'}
                      {lead.reviewCount !== null ? <span className="ml-1 text-xs text-muted-foreground">({lead.reviewCount})</span> : null}
                    </td>
                    <td className="order-3 p-0 lg:table-cell lg:w-36 lg:p-3">
                      <MobileLabel>Stage</MobileLabel>
                      <ContactedToggle
                        key={`${lead.id}-${lead.contacted}`}
                        businessId={lead.id}
                        contacted={lead.contacted}
                      />
                    </td>
                    <td className="order-6 col-span-2 p-0 lg:table-cell lg:w-64 lg:p-3">
                      <MobileLabel>Notes</MobileLabel>
                      <NotesField businessId={lead.id} initialNotes={lead.notes ?? ''} />
                    </td>
                    <td className="order-7 col-span-2 p-0 text-xs text-muted-foreground lg:table-cell lg:w-28 lg:p-3">
                      <span className="lg:hidden">Updated </span>{relativeTime(new Date(lead.updatedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {visible.length > pageSize ? (
          <nav aria-label="Lead pages" className="flex items-center justify-between gap-4 border-b border-border py-4">
            <p className="text-xs text-muted-foreground">
              {firstVisible + 1}–{Math.min(firstVisible + pageSize, visible.length)} of {visible.length}
              <span className="hidden sm:inline"> · Page {currentPage} of {totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="h-9 border border-border px-3 text-sm font-semibold hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className="h-9 border border-border px-3 text-sm font-semibold hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </nav>
        ) : null}
      </section>
    </>
  )
}

function WebsiteSignal({ website }: { website: string | null }) {
  if (!website) {
    return <span className="status-chip max-w-full whitespace-normal bg-tier1-bg text-tier1-foreground">No website found on Google</span>
  }

  const href = safeWebsiteUrl(website)
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="status-chip bg-surface text-link hover:underline"
    >
      Open website
    </a>
  ) : (
    <span className="status-chip bg-surface text-muted-foreground">Website listed</span>
  )
}

function Metric({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string
  value: number | string
  detail?: string
  emphasis?: boolean
}) {
  return (
    <div className="min-h-24 px-4 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${emphasis ? 'text-accent' : 'text-foreground'}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  )
}

function Header({ children }: { children: ReactNode }) {
  return <th className="p-3 text-xs font-semibold text-muted-foreground">{children}</th>
}

function MobileLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium text-muted-foreground lg:hidden">{children}</p>
}

function subscribeToViewport(callback: () => void): () => void {
  const media = window.matchMedia(compactViewport)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

function getViewportSnapshot(): boolean {
  return window.matchMedia(compactViewport).matches
}

function getServerSnapshot(): boolean {
  return false
}
