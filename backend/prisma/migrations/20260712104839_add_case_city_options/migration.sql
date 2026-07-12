-- AlterTable
ALTER TABLE "visa_cases" ADD COLUMN "cityOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
