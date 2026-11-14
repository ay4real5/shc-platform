-- Sponsored workers (S5-04, DECISIONS S-031): visa records and sponsor-duty reports.
CREATE TABLE "visa_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "route" VARCHAR(30) NOT NULL,
    "sponsored" BOOLEAN NOT NULL DEFAULT false,
    "cos_reference" VARCHAR(10),
    "soc_code" VARCHAR(4),
    "started_on" DATE,
    "expires_on" DATE NOT NULL,
    "weekly_hours_limit" INTEGER,
    "notes" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visa_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sponsor_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "event" VARCHAR(30) NOT NULL,
    "happened_on" DATE NOT NULL,
    "due_by" DATE NOT NULL,
    "reported_on" DATE,
    "reported_by_id" UUID,
    "notes" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visa_records_staff_profile_id_key" ON "visa_records"("staff_profile_id");
CREATE INDEX "visa_records_agency_id_expires_on_idx" ON "visa_records"("agency_id", "expires_on");
CREATE INDEX "sponsor_reports_agency_id_reported_on_due_by_idx" ON "sponsor_reports"("agency_id", "reported_on", "due_by");
CREATE INDEX "sponsor_reports_staff_profile_id_idx" ON "sponsor_reports"("staff_profile_id");

ALTER TABLE "visa_records" ADD CONSTRAINT "visa_records_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsor_reports" ADD CONSTRAINT "sponsor_reports_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
