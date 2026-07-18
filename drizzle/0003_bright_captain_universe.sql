CREATE INDEX "businesses_updated_at_idx" ON "businesses" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "leads_job_id_idx" ON "leads" USING btree ("job_id");