ALTER TABLE "jobs" ADD COLUMN "leads_found" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cursor" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "error_reason" text;