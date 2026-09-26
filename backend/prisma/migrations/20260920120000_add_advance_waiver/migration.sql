-- AlterTable
ALTER TABLE "visa_cases" ADD COLUMN     "advanceWaived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "advanceWaiverReason" TEXT;
