-- S2-05: health declarations (special category data, encrypted).

-- CreateTable
CREATE TABLE "health_declarations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "answers_encrypted" BYTEA NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "outcome" VARCHAR(25),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note_encrypted" BYTEA,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "health_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "health_declarations_staff_profile_id_key" ON "health_declarations"("staff_profile_id");

-- AddForeignKey
ALTER TABLE "health_declarations" ADD CONSTRAINT "health_declarations_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

