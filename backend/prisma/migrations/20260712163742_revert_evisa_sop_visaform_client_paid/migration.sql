/*
  Warnings:

  - You are about to drop the column `docEVisaClientPaid` on the `visa_cases` table. All the data in the column will be lost.
  - You are about to drop the column `docSopClientPaid` on the `visa_cases` table. All the data in the column will be lost.
  - You are about to drop the column `docVisaFormClientPaid` on the `visa_cases` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "visa_cases" DROP COLUMN "docEVisaClientPaid",
DROP COLUMN "docSopClientPaid",
DROP COLUMN "docVisaFormClientPaid";
