-- Regions (S5-02, S-028): one of the company's regions per staff member.
ALTER TABLE "staff_profiles" ADD COLUMN "region" VARCHAR(60);

CREATE INDEX "staff_profiles_agency_id_region_idx" ON "staff_profiles"("agency_id", "region");
