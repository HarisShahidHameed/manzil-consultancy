-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('APPOINTMENT_ONLY', 'FULL_SERVICE');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "serviceType" "ServiceType" NOT NULL DEFAULT 'FULL_SERVICE';
