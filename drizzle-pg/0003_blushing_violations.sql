CREATE INDEX "construction_opportunities_client_idx" ON "construction_opportunities" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "construction_projects_opportunity_idx" ON "construction_projects" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "construction_projects_client_idx" ON "construction_projects" USING btree ("client_id");--> statement-breakpoint
ALTER FUNCTION public.contract_assignment_active_guard() SET search_path = public, pg_temp;
