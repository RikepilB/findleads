'use client'

import useSWR from 'swr'
import { isTerminalStatus } from './isTerminalStatus'

// Response shape returned by GET /api/jobs/[id] (app/api/jobs/[id]/route.ts) —
// cursor is deliberately omitted there, so it's omitted here too.
type JobStatusResponse = {
  id: string
  status: string
  category: string
  location: string
  leadsFound: number
  errorReason: string | null
  createdAt: string
  updatedAt: string
}

const fetcher = (url: string): Promise<JobStatusResponse> =>
  fetch(url).then((r) => r.json())

// Re-exported so consumers of this component can import the helper from
// here too; the unit test imports it from './isTerminalStatus' directly
// (see that file's comment for why).
export { isTerminalStatus }

// Status badge color table per 05-UI-SPEC.md "Status badge colors" section.
function badgeClasses(status: string, leadsFound?: number): string {
  if (status === 'partial') return 'bg-amber-100 text-amber-700'
  if (status === 'error') return 'bg-red-100 text-red-700'
  if (status === 'done') {
    // JOB-06: a genuine zero-result completion is neutral, not green.
    // leadsFound is only known once a poll response has arrived (or the
    // row was already terminal on mount, in which case this defaults to
    // the more common non-zero outcome — the row's own leadsFound-driven
    // copy in app/jobs/page.tsx is the source of truth for that
    // distinction, this badge is a visual affordance only).
    if (leadsFound === 0) return 'bg-[#F3F4F6] text-[#4B5563]'
    return 'bg-green-100 text-green-700'
  }
  // pending / running
  return 'bg-[#F3F4F6] text-[#4B5563]'
}

export default function JobStatusPoller({
  jobId,
  initialStatus,
}: {
  jobId: string
  initialStatus: string
}) {
  const { data } = useSWR<JobStatusResponse>(
    isTerminalStatus(initialStatus) ? null : `/api/jobs/${jobId}`,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest && isTerminalStatus(latest.status) ? 0 : 1500,
    },
  )

  const status = data?.status ?? initialStatus

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${badgeClasses(status, data?.leadsFound)}`}
    >
      {status}
    </span>
  )
}
