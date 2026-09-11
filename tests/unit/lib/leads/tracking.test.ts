import { describe, expect, it } from 'vitest'
import { filterLeads, safeWebsiteUrl, sortLeads, summarizeLeads } from '@/lib/leads/tracking'

const leads = [
  { businessName: 'North Cafe', phone: '555-1000', address: 'Toronto', website: null, notes: 'Call Tuesday', contacted: false },
  { businessName: 'Sur Studio', phone: null, address: 'Lima', website: 'https://sur.example', notes: null, contacted: true },
  { businessName: 'Market Dental', phone: '555-2000', address: null, website: null, notes: null, contacted: true },
]

describe('lead tracking helpers', () => {
  it('summarizes the actionable pipeline', () => {
    expect(summarizeLeads(leads)).toEqual({
      total: 3,
      contacted: 2,
      toContact: 1,
      noWebsite: 2,
      callable: 2,
      readyToCall: 1,
      contactedPercent: 67,
    })
  })

  it('keeps small non-zero completion rates visible', () => {
    const sparseProgress = Array.from({ length: 400 }, (_, index) => ({
      businessName: `Lead ${index}`,
      phone: null,
      address: null,
      website: null,
      contacted: index === 0,
    }))

    expect(summarizeLeads(sparseProgress).contactedPercent).toBe(0.3)
  })

  it('filters by pipeline stage and searches lead fields case-insensitively', () => {
    expect(filterLeads(leads, 'ready-to-call', '')).toEqual([leads[0]])
    expect(filterLeads(leads, 'to-contact', '')).toEqual([leads[0]])
    expect(filterLeads(leads, 'no-website', 'DENTAL')).toEqual([leads[2]])
    expect(filterLeads(leads, 'all', 'lima')).toEqual([leads[1]])
    expect(filterLeads(leads, 'all', '555-1000')).toEqual([leads[0]])
    expect(filterLeads(leads, 'all', 'tuesday')).toEqual([leads[0]])
    expect(filterLeads(leads, 'all', 'sur.example')).toEqual([leads[1]])
  })

  it('sorts priority leads transparently and keeps alternate sorts deterministic', () => {
    const sortable = [
      { ...leads[1], rating: 5, reviewCount: 90, updatedAt: '2026-01-03T00:00:00Z' },
      { ...leads[2], rating: 4.8, reviewCount: 300, updatedAt: '2026-01-02T00:00:00Z' },
      { ...leads[0], rating: 4.4, reviewCount: 120, updatedAt: '2026-01-01T00:00:00Z' },
      { businessName: 'Alpha Repair', phone: null, address: null, website: null, contacted: false, rating: null, reviewCount: null, updatedAt: '2026-01-04T00:00:00Z' },
    ]

    expect(sortLeads(sortable, 'priority').map((lead) => lead.businessName)).toEqual([
      'North Cafe',
      'Alpha Repair',
      'Market Dental',
      'Sur Studio',
    ])
    expect(sortLeads(sortable, 'recent')[0].businessName).toBe('Alpha Repair')
    expect(sortLeads(sortable, 'rating')[0].businessName).toBe('Sur Studio')
    expect(sortLeads(sortable, 'name')[0].businessName).toBe('Alpha Repair')
  })

  it('allows only http and https website links', () => {
    expect(safeWebsiteUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(safeWebsiteUrl('http://example.com')).toBe('http://example.com/')
    expect(safeWebsiteUrl('javascript:alert(1)')).toBeNull()
    expect(safeWebsiteUrl('not a URL')).toBeNull()
    expect(safeWebsiteUrl(null)).toBeNull()
  })
})
