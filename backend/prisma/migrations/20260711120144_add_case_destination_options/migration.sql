-- AlterTable
ALTER TABLE "visa_cases" ADD COLUMN "destinationOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
