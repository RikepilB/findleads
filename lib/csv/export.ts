import 'server-only'
import { stringify } from 'csv-stringify/sync'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leads, businesses } from '@/lib/db/schema'
import { sanitizeCsvCell } from './sanitize'

const CSV_COLUMNS = [
  'business_name',
  'phone',
  'address',
  'website',
  'rating',
  'review_count',
  'notes',
  'contacted',
] as const

/**
 * Builds a CSV of a job's leads (EXPORT-01), joined to businesses' CURRENT
 * CRM state (notes/contacted) via place_id — leads carries no such columns
 * (Phase 1's identity/sighting split), so businesses is the only correct
 * source for them. Every untrusted string column is sanitized against
 * formula injection (EXPORT-02) before reaching stringify().
 */
export async function buildJobLeadsCsv(jobId: string): Promise<string> {
  const rows = await db
    .select({
      businessName: leads.businessName,
      phone: leads.phone,
      address: leads.address,
      website: leads.website,
      rating: leads.rating,
      reviewCount: leads.reviewCount,
      notes: businesses.notes,
      contacted: businesses.contacted,
    })
    .from(leads)
    .innerJoin(businesses, eq(leads.placeId, businesses.placeId))
    .where(eq(leads.jobId, jobId))

  const records = rows.map((row) => [
    sanitizeCsvCell(row.businessName),
    row.phone ? sanitizeCsvCell(row.phone) : '',
    row.address ? sanitizeCsvCell(row.address) : '',
    row.website ? sanitizeCsvCell(row.website) : 'no website found on Google',
    row.rating ?? '',
    row.reviewCount ?? '',
    row.notes ? sanitizeCsvCell(row.notes) : '',
    row.contacted ? 'yes' : 'no',
  ])

  return stringify(records, { header: true, columns: CSV_COLUMNS })
}
