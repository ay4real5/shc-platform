-- Company logo for the careers page (S5-05, DECISIONS S-032).
ALTER TABLE "agencies" ADD COLUMN "logo" BYTEA,
ADD COLUMN "logo_type" VARCHAR(20);
