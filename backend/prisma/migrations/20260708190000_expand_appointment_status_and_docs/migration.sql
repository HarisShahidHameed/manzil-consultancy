-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'HOLD';
ALTER TYPE "AppointmentStatus" ADD VALUE 'DROPPED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'BACK_UP';

-- Data backfill: the Intake stage was folded into Appointment (a case now enters
-- the appointment queue directly). Existing rows must be moved off the value
-- before it's dropped from the enum below, or the cast to CaseStage_new fails.
UPDATE "visa_cases" SET "stage" = 'APPOINTMENT' WHERE "stage" = 'INTAKE';

-- AlterEnum
BEGIN;
CREATE TYPE "CaseStage_new" AS ENUM ('APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "visa_cases" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "visa_cases" ALTER COLUMN "stage" TYPE "CaseStage_new" USING ("stage"::text::"CaseStage_new");
ALTER TYPE "CaseStage" RENAME TO "CaseStage_old";
ALTER TYPE "CaseStage_new" RENAME TO "CaseStage";
DROP TYPE "CaseStage_old";
ALTER TABLE "visa_cases" ALTER COLUMN "stage" SET DEFAULT 'APPOINTMENT';
COMMIT;

-- DropIndex
DROP INDEX "clients_passportNumber_key";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "contract";

-- AlterTable
ALTER TABLE "visa_cases" ADD COLUMN     "docAppointmentClientPaid" DECIMAL(10,2),
ADD COLUMN     "docHotelClientPaid" DECIMAL(10,2),
ADD COLUMN     "docInsuranceClientPaid" DECIMAL(10,2),
ADD COLUMN     "docTicketClientPaid" DECIMAL(10,2),
ALTER COLUMN "stage" SET DEFAULT 'APPOINTMENT',
ALTER COLUMN "appointmentStatus" SET DEFAULT 'WAITING';
