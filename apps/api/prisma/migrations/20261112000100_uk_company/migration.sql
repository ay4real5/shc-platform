-- S1-03: the company record becomes a UK one. US provider, tax, EDI, EVV and payroll columns go; city/zip renamed.
DROP INDEX IF EXISTS "agencies_npi_key";

ALTER TABLE "agencies"
  DROP COLUMN "npi",
  DROP COLUMN "tax_id",
  DROP COLUMN "fax",
  DROP COLUMN "state",
  DROP COLUMN "edi_control_number",
  DROP COLUMN "medicare_provider_number",
  DROP COLUMN "medicaid_provider_number",
  DROP COLUMN "evv_state_config",
  DROP COLUMN "payroll_mileage_rate",
  DROP COLUMN "workweek_start_day";

ALTER TABLE "agencies" RENAME COLUMN "city" TO "town";
ALTER TABLE "agencies" RENAME COLUMN "zip" TO "postcode";
ALTER TABLE "agencies" ALTER COLUMN "timezone" SET DEFAULT 'Europe/London';
