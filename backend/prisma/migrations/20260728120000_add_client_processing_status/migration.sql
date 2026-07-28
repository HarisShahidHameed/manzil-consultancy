-- CreateEnum
CREATE TYPE "ClientProcessingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "status" "ClientProcessingStatus" NOT NULL DEFAULT 'PENDING';
