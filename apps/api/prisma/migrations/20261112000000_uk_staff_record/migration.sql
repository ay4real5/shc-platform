-- S1-03: the staff record becomes a UK one. US payroll/visit fields go; city/zip are renamed, not dropped.
DROP INDEX IF EXISTS "staff_profiles_agency_id_ivr_code_key";

ALTER TABLE "staff_profiles"
  DROP COLUMN "ivr_code",
  DROP COLUMN "per_visit_rate",
  DROP COLUMN "ssn_encrypted",
  DROP COLUMN "tax_filing_status",
  DROP COLUMN "state",
  DROP COLUMN "service_area_zip_codes",
  DROP COLUMN "max_patients",
  DROP COLUMN "latitude",
  DROP COLUMN "longitude";

ALTER TABLE "staff_profiles" RENAME COLUMN "city" TO "town";
ALTER TABLE "staff_profiles" RENAME COLUMN "zip" TO "postcode";

ALTER TABLE "staff_profiles"
  ADD COLUMN "ni_number_encrypted" BYTEA,
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "address_line2" VARCHAR(255),
  ADD COLUMN "emergency_contact_name" VARCHAR(200),
  ADD COLUMN "emergency_contact_phone" VARCHAR(20),
  ADD COLUMN "emergency_contact_relationship" VARCHAR(50),
  ADD COLUMN "can_drive" BOOLEAN NOT NULL DEFAULT false;
