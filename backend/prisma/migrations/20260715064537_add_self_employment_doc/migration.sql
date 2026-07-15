-- AlterTable
ALTER TABLE "visa_cases" ADD COLUMN     "docSelfEmployment" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "docSelfEmploymentClientPaid" DECIMAL(10,2),
ADD COLUMN     "docSelfEmploymentCost" DECIMAL(10,2);
