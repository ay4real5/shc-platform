-- S1-05: application timeline, interviews, and the hired login.

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "hired_user_id" UUID;

-- CreateTable
CREATE TABLE "application_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "from_stage" VARCHAR(20),
    "to_stage" VARCHAR(20),
    "text" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "mode" VARCHAR(10) NOT NULL DEFAULT 'in_person',
    "location" VARCHAR(500),
    "interviewer_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'scheduled',
    "score" INTEGER,
    "outcome" VARCHAR(10),
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_events_application_id_created_at_idx" ON "application_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

-- CreateIndex
CREATE INDEX "interviews_agency_id_starts_at_idx" ON "interviews"("agency_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "applications_hired_user_id_key" ON "applications"("hired_user_id");

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

