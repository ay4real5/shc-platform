-- S2-01: Right to Work checks.

-- CreateTable
CREATE TABLE "right_to_work_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "share_code" VARCHAR(9),
    "document_type" VARCHAR(50),
    "seen_how" VARCHAR(12),
    "permission" VARCHAR(15) NOT NULL,
    "permission_expires_on" DATE,
    "follow_up_on" DATE,
    "restrictions" VARCHAR(500),
    "outcome" VARCHAR(10) NOT NULL,
    "checked_on" DATE NOT NULL,
    "checked_by_id" UUID NOT NULL,
    "document_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "right_to_work_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "right_to_work_checks_staff_profile_id_checked_on_idx" ON "right_to_work_checks"("staff_profile_id", "checked_on");

-- CreateIndex
CREATE INDEX "right_to_work_checks_agency_id_follow_up_on_idx" ON "right_to_work_checks"("agency_id", "follow_up_on");

-- AddForeignKey
ALTER TABLE "right_to_work_checks" ADD CONSTRAINT "right_to_work_checks_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

