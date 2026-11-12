-- S2-02: DBS certificates and Update Service status checks.

-- CreateTable
CREATE TABLE "dbs_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "certificate_number" VARCHAR(12) NOT NULL,
    "issue_date" DATE NOT NULL,
    "level" VARCHAR(30) NOT NULL,
    "result" VARCHAR(12) NOT NULL,
    "decision" VARCHAR(12),
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "update_service" BOOLEAN NOT NULL DEFAULT false,
    "status_changed" BOOLEAN NOT NULL DEFAULT false,
    "next_due_on" DATE NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dbs_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dbs_status_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dbs_check_id" UUID NOT NULL,
    "checked_on" DATE NOT NULL,
    "result" VARCHAR(16) NOT NULL,
    "checked_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dbs_status_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dbs_checks_staff_profile_id_issue_date_idx" ON "dbs_checks"("staff_profile_id", "issue_date");

-- CreateIndex
CREATE INDEX "dbs_checks_agency_id_next_due_on_idx" ON "dbs_checks"("agency_id", "next_due_on");

-- CreateIndex
CREATE INDEX "dbs_status_checks_dbs_check_id_idx" ON "dbs_status_checks"("dbs_check_id");

-- AddForeignKey
ALTER TABLE "dbs_checks" ADD CONSTRAINT "dbs_checks_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dbs_status_checks" ADD CONSTRAINT "dbs_status_checks_dbs_check_id_fkey" FOREIGN KEY ("dbs_check_id") REFERENCES "dbs_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

