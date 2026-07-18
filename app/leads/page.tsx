import { listBusinesses } from '@/lib/db/businesses'
import { relativeTime } from '@/lib/format/relativeTime'
import ContactedToggle from './ContactedToggle'
import NotesField from './NotesField'

// This page reads live DB state directly (listBusinesses) and no code path
// revalidates it after a scrape completes (only notes/contacted edits do) —
// it must never be statically prerendered at build time (newly scraped
// leads would never appear until an unrelated edit fired elsewhere).
export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const rows = await listBusinesses()

  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-[28px] font-semibold leading-tight">No leads yet</h1>
        <p className="mt-4 text-sm text-gray-600">
          Run a scrape to start finding businesses with no website found on Google. Go to Job
          History to start one.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="mb-8 text-[28px] font-semibold leading-tight">Leads</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#F3F4F6] text-left">
            <th className="p-2 font-semibold">Business</th>
            <th className="p-2 font-semibold">Tier</th>
            <th className="p-2 font-semibold">Phone</th>
            <th className="p-2 font-semibold">Address</th>
            <th className="p-2 font-semibold">Rating</th>
            <th className="p-2 font-semibold">Contacted</th>
            <th className="p-2 font-semibold">Notes</th>
            <th className="p-2 font-semibold">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr key={b.id} className={i % 2 === 1 ? 'bg-[#F3F4F6]' : 'bg-white'}>
              <td className="p-2 align-top">{b.businessName}</td>
              <td className="p-2 align-top">
                {b.website ? (
                  <span className="inline-block rounded-full bg-[#F3F4F6] px-2 py-0.5 text-xs font-semibold text-[#4B5563]">
                    Has website
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-[#EFF6FF] px-2 py-0.5 text-xs font-semibold text-[#2563EB]">
                    No website found on Google
                  </span>
                )}
              </td>
              <td className="p-2 align-top">{b.phone ?? '—'}</td>
              <td className="p-2 align-top">{b.address ?? '—'}</td>
              <td className="p-2 align-top">{b.rating ?? '—'}</td>
              <td className="p-2 align-top">
                <ContactedToggle businessId={b.id} contacted={b.contacted} />
              </td>
              <td className="p-2 align-top">
                <NotesField businessId={b.id} initialNotes={b.notes ?? ''} />
              </td>
              <td className="p-2 align-top text-xs text-gray-500">
                {relativeTime(b.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
