import { pgTable, pgEnum, serial, uuid, text, real, integer, boolean, timestamp, unique, jsonb, index } from 'drizzle-orm/pg-core'
import type { JobCursor } from '@/lib/jobs/checkpoint'

export const jobStatusEnum = pgEnum('job_status', ['pending', 'running', 'partial', 'done', 'error'])

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: jobStatusEnum('status').notNull().default('pending'),
  category: text('category').notNull(),
  location: text('location').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // Added by Phase 3 (additive migration) for the checkpointed worker:
  // progress count, resumable pagination cursor, and a safe error reason.
  leadsFound: integer('leads_found').notNull().default(0),
  cursor: jsonb('cursor').$type<JobCursor>(),
  errorReason: text('error_reason'),
  // Added by Phase 5 (additive migration) — SCRAPE-07: true when the worker
  // genuinely exhausted the 3-page/60-result Text Search cap, computed from
  // raw pagination signal BEFORE closed-business filtering can hide it.
  resultCapHit: boolean('result_cap_hit').notNull().default(false),
})

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  jobId: uuid('job_id').notNull().references(() => jobs.id),
  placeId: text('place_id').notNull(),
  businessName: text('business_name').notNull(),
  phone: text('phone'),
  address: text('address'),
  website: text('website'),
  rating: real('rating'),
  reviewCount: integer('review_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('leads_job_id_place_id_unique').on(table.jobId, table.placeId),
  // Postgres doesn't auto-index FK columns — the CSV-export join and per-job
  // lead reads scan without this.
  index('leads_job_id_idx').on(table.jobId),
])

export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  placeId: text('place_id').notNull().unique(),
  businessName: text('business_name').notNull(),
  phone: text('phone'),
  address: text('address'),
  website: text('website'),
  rating: real('rating'),
  reviewCount: integer('review_count'),
  notes: text('notes'),
  contacted: boolean('contacted').notNull().default(false),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // listBusinesses orders every row by updated_at on each /leads render.
  index('businesses_updated_at_idx').on(table.updatedAt),
])
