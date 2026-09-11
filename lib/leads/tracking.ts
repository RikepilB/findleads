export interface TrackableLead {
  businessName: string
  phone: string | null
  address: string | null
  website: string | null
  notes?: string | null
  contacted: boolean
}

export interface SortableLead extends TrackableLead {
  rating: number | null
  reviewCount: number | null
  updatedAt: string
}

export type LeadFilter = 'all' | 'ready-to-call' | 'to-contact' | 'contacted' | 'no-website'
export type LeadSort = 'priority' | 'recent' | 'rating' | 'name'

export function isReadyToCall(lead: TrackableLead): boolean {
  return !lead.contacted && !lead.website && Boolean(lead.phone)
}

export function summarizeLeads(leads: TrackableLead[]) {
  const contacted = leads.filter((lead) => lead.contacted).length
  const noWebsite = leads.filter((lead) => !lead.website).length
  const callable = leads.filter((lead) => Boolean(lead.phone)).length
  const readyToCall = leads.filter(isReadyToCall).length
  const rawContactedPercent = leads.length === 0 ? 0 : (contacted / leads.length) * 100

  return {
    total: leads.length,
    contacted,
    toContact: leads.length - contacted,
    noWebsite,
    callable,
    readyToCall,
    contactedPercent:
      rawContactedPercent > 0 && rawContactedPercent < 1
        ? Number(rawContactedPercent.toFixed(1))
        : Math.round(rawContactedPercent),
  }
}

export function filterLeads<T extends TrackableLead>(
  leads: T[],
  filter: LeadFilter,
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase()

  return leads.filter((lead) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'ready-to-call' && isReadyToCall(lead)) ||
      (filter === 'to-contact' && !lead.contacted) ||
      (filter === 'contacted' && lead.contacted) ||
      (filter === 'no-website' && !lead.website)

    if (!matchesFilter) return false
    if (!needle) return true

    return [lead.businessName, lead.phone, lead.address, lead.website, lead.notes]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(needle))
  })
}

export function sortLeads<T extends SortableLead>(leads: T[], sort: LeadSort): T[] {
  return [...leads].sort((left, right) => {
    if (sort === 'name') return left.businessName.localeCompare(right.businessName)

    if (sort === 'recent') {
      return timestamp(right.updatedAt) - timestamp(left.updatedAt) || compareNames(left, right)
    }

    if (sort === 'rating') {
      return (
        nullableNumberDescending(left.rating, right.rating) ||
        nullableNumberDescending(left.reviewCount, right.reviewCount) ||
        compareNames(left, right)
      )
    }

    return (
      Number(left.contacted) - Number(right.contacted) ||
      Number(isReadyToCall(right)) - Number(isReadyToCall(left)) ||
      Number(Boolean(left.website)) - Number(Boolean(right.website)) ||
      Number(Boolean(right.phone)) - Number(Boolean(left.phone)) ||
      nullableNumberDescending(left.reviewCount, right.reviewCount) ||
      nullableNumberDescending(left.rating, right.rating) ||
      compareNames(left, right)
    )
  })
}

export function safeWebsiteUrl(value: string | null): string | null {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function nullableNumberDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return right - left
}

function compareNames(left: TrackableLead, right: TrackableLead): number {
  return left.businessName.localeCompare(right.businessName)
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}
