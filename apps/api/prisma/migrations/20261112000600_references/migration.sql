-- S2-03: reference requests and answers.

-- CreateTable
CREATE TABLE "reference_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "referee_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'sent',
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "responded_at" TIMESTAMPTZ(6),
    "answers" JSONB,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "verification_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reference_requests_token_hash_key" ON "reference_requests"("token_hash");

-- CreateIndex
CREATE INDEX "reference_requests_application_id_idx" ON "reference_requests"("application_id");

-- AddForeignKey
ALTER TABLE "reference_requests" ADD CONSTRAINT "reference_requests_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_requests" ADD CONSTRAINT "reference_requests_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "application_referees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

