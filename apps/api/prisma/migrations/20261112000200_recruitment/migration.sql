-- S1-04: job adverts, applications (employment history with explained gaps, referees) and the careers page slug.

-- AlterTable
ALTER TABLE "agencies" ADD COLUMN     "careers_slug" VARCHAR(60);

-- CreateTable
CREATE TABLE "job_postings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "discipline" VARCHAR(20) NOT NULL,
    "employment_type" VARCHAR(20) NOT NULL DEFAULT 'full_time',
    "location" VARCHAR(150) NOT NULL,
    "pay_from" DECIMAL(10,2),
    "pay_to" DECIMAL(10,2),
    "pay_period" VARCHAR(10) NOT NULL DEFAULT 'hour',
    "hours" VARCHAR(150),
    "summary" VARCHAR(300),
    "description" TEXT NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "closes_on" DATE,
    "published_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "job_posting_id" UUID,
    "reference" VARCHAR(12) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "address_line1" VARCHAR(255),
    "town" VARCHAR(100),
    "postcode" VARCHAR(10) NOT NULL,
    "right_to_work" VARCHAR(30) NOT NULL,
    "can_drive" BOOLEAN NOT NULL DEFAULT false,
    "earliest_start" DATE,
    "availability" VARCHAR(500),
    "cover_note" TEXT,
    "stage" VARCHAR(20) NOT NULL DEFAULT 'applied',
    "stage_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50),
    "declaration_accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" VARCHAR(5) NOT NULL,
    "employer" VARCHAR(200),
    "job_title" VARCHAR(150),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "reason_for_leaving" VARCHAR(500),
    "was_care_role" BOOLEAN NOT NULL DEFAULT false,
    "explanation" VARCHAR(1000),

    CONSTRAINT "application_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_referees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "organisation" VARCHAR(200),
    "relationship" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "contact_before_offer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "application_referees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_postings_agency_id_status_idx" ON "job_postings"("agency_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_reference_key" ON "applications"("reference");

-- CreateIndex
CREATE INDEX "applications_agency_id_stage_idx" ON "applications"("agency_id", "stage");

-- CreateIndex
CREATE INDEX "applications_agency_id_created_at_idx" ON "applications"("agency_id", "created_at");

-- CreateIndex
CREATE INDEX "applications_job_posting_id_idx" ON "applications"("job_posting_id");

-- CreateIndex
CREATE INDEX "application_history_application_id_idx" ON "application_history"("application_id");

-- CreateIndex
CREATE INDEX "application_referees_application_id_idx" ON "application_referees"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_careers_slug_key" ON "agencies"("careers_slug");

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_posting_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_history" ADD CONSTRAINT "application_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_referees" ADD CONSTRAINT "application_referees_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

