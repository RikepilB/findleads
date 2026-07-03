import { pgTable, pgEnum, serial, uuid, text, real, integer, boolean, timestamp, unique } from 'drizzle-orm/pg-core'

export const jobStatusEnum = pgEnum('job_status', ['pending', 'running', 'partial', 'done', 'error'])

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: jobStatusEnum('status').notNull().default('pending'),
  category: text('category').notNull(),
  location: text('location').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // leads_found / cursor / error_reason columns are added by Phase 3 via an
  // additive migration once the checkpointed worker needs them — not in
  // this phase's scope (JOB-* requirements belong to Phase 3, not Phase 1).
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
})
