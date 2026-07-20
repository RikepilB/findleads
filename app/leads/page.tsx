import { listBusinesses } from '@/lib/db/businesses'
import { relativeTime } from '@/lib/format/relativeTime'
import ContactedToggle from './ContactedToggle'
import NotesField from './NotesField'

// This page reads live DB state directly (listBusinesses) and no code path
// revalidates it after a scrape completes (only notes/contacted edits do) —
// it must never be statically prerendered at build time (newly scraped
// leads would never appear until an unrelated edit fired elsewhere).
export const dynamic = 'force-dynamic'

// Small always-available explainer, collapsible via native <details> so it
// costs no client JS and doesn't compete with the table on repeat visits.
function AboutSection() {
  return (
    <details className="mb-10 rounded border border-border bg-surface px-5 py-4" open>
      <summary className="cursor-pointer text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        About findleads
      </summary>
      <h2 className="mt-4 font-serif text-xl italic text-accent">
        Businesses Google can&apos;t sell a website to yet.
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Google&apos;s own Places directory leaves the website field blank for a real slice of
        small businesses — every blank is a business that hasn&apos;t been sold a website yet.
        findleads searches Places by category and free-text location, flags the ones with no
        website as tier-1 leads, and wraps a lightweight CRM around the result: notes, a
        contacted toggle, CSV export. Built as a personal prospecting tool for freelance web
        designers and small agencies; the searches validated so far cover Toronto and Lima,
        Peru, but location is free text, not a fixed list.
      </p>
      <ol className="mt-4 max-w-2xl space-y-1 text-sm text-muted-foreground">
        <li>
          <span className="font-semibold text-foreground">1.</span> Job History → pick a
          category + location → Start Scrape.
        </li>
        <li>
          <span className="font-semibold text-foreground">2.</span> Come back here — no-website
          leads are tagged &quot;No website found on Google.&quot;
        </li>
        <li>
          <span className="font-semibold text-foreground">3.</span> Mark Contacted, leave a
          Note, export CSV when you&apos;re ready to work a batch.
        </li>
      </ol>
    </details>
  )
}

export default async function LeadsPage() {
  const rows = await listBusinesses()

  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Leads
        </p>
        <h1 className="mt-3 mb-10 font-serif text-3xl italic text-accent">No leads yet</h1>
        <AboutSection />
        <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
          Run a scrape to start finding businesses with no website found on Google. Go to Job
          History to start one.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        Leads
      </p>
      <h1 className="mt-3 mb-10 font-serif text-3xl italic text-accent">
        {rows.length} businesses tracked
      </h1>
      <AboutSection />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Business
            </th>
            <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Tier
            </th>
            <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Phone
            </th>
            <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Address
            </th>
            <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Rating
            </th>
            <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Contacted
            </th>
            <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Notes
            </th>
            <th className="p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Updated
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr
              key={b.id}
              className={`border-b border-border ${i % 2 === 1 ? 'bg-surface' : ''}`}
            >
              <td className="p-3 align-top">{b.businessName}</td>
              <td className="p-3 align-top">
                {b.website ? (
                  <span className="inline-block rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    Has website
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-tier1-bg px-2 py-0.5 text-xs font-semibold text-tier1-foreground">
                    No website found on Google
                  </span>
                )}
              </td>
              <td className="p-3 align-top">{b.phone ?? '—'}</td>
              <td className="p-3 align-top">{b.address ?? '—'}</td>
              <td className="p-3 align-top tabular-nums">{b.rating ?? '—'}</td>
              <td className="p-3 align-top">
                <ContactedToggle businessId={b.id} contacted={b.contacted} />
              </td>
              <td className="p-3 align-top">
                <NotesField businessId={b.id} initialNotes={b.notes ?? ''} />
              </td>
              <td className="p-3 align-top text-xs text-muted-foreground">
                {relativeTime(b.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
