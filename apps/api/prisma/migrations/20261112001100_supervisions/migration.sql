-- CreateTable
CREATE TABLE "supervisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "scheduled_for" DATE,
    "held_on" DATE,
    "supervisor_id" UUID,
    "notes_encrypted" BYTEA,
    "acknowledged_at" TIMESTAMPTZ(6),
    "staff_comment_encrypted" BYTEA,
    "reminder_sent_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supervisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervision_overdue_alerts" (
    "staff_profile_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "due_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervision_overdue_alerts_pkey" PRIMARY KEY ("staff_profile_id","type","due_on")
);

-- CreateIndex
CREATE INDEX "supervisions_agency_id_status_idx" ON "supervisions"("agency_id", "status");

-- CreateIndex
CREATE INDEX "supervisions_staff_profile_id_type_idx" ON "supervisions"("staff_profile_id", "type");

-- AddForeignKey
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisions" ADD CONSTRAINT "supervisions_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

