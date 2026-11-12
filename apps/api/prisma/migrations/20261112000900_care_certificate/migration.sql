-- CreateTable
CREATE TABLE "care_certificate_sign_offs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "standard" SMALLINT NOT NULL,
    "completed_on" DATE NOT NULL,
    "signed_off_by" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_certificate_sign_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_certificate_sign_offs_agency_id_idx" ON "care_certificate_sign_offs"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "care_certificate_sign_offs_staff_profile_id_standard_key" ON "care_certificate_sign_offs"("staff_profile_id", "standard");

-- AddForeignKey
ALTER TABLE "care_certificate_sign_offs" ADD CONSTRAINT "care_certificate_sign_offs_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_certificate_sign_offs" ADD CONSTRAINT "care_certificate_sign_offs_signed_off_by_fkey" FOREIGN KEY ("signed_off_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

