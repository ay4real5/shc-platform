-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN     "days_per_week" DECIMAL(3,1),
ADD COLUMN     "holiday_days_override" DECIMAL(4,1);

-- AlterTable
ALTER TABLE "staff_time_off" ADD COLUMN     "days" DECIMAL(4,1);

