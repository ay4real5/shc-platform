-- S2-04: documents to sign and onboarding packs.

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_on" DATE,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "signed_at" TIMESTAMPTZ(6),
    "signed_name" VARCHAR(200),
    "content_hash" VARCHAR(64),
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(255),

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "disciplines" TEXT[],
    "document_ids" UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signature_requests_staff_profile_id_status_idx" ON "signature_requests"("staff_profile_id", "status");

-- CreateIndex
CREATE INDEX "signature_requests_document_id_idx" ON "signature_requests"("document_id");

-- CreateIndex
CREATE INDEX "onboarding_packs_agency_id_idx" ON "onboarding_packs"("agency_id");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

