-- 1 Oct 2026 #7: monthly operational report. Counting "cancelled / missed / dropped / paused /
-- completed IN a given month" needs to know WHEN each of those happened, which nothing
-- recorded before. These columns are stamped by the service from now on.

-- A client who could not make it to their appointment. Distinct from DROPPED (client gave up
-- on the service) so the report can count the two separately.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'MISSED';

ALTER TABLE "visa_cases"
  ADD COLUMN "completedAt"                TIMESTAMP(3),
  ADD COLUMN "cancelledAt"                TIMESTAMP(3),
  ADD COLUMN "onHoldAt"                   TIMESTAMP(3),
  ADD COLUMN "appointmentStatusChangedAt" TIMESTAMP(3);

-- Best-available backfill so past months are not all zero. These are APPROXIMATIONS:
-- updatedAt is the last time the row was touched for any reason, not necessarily the day the
-- status changed. A completed case uses its first invoice's issue date where it has one,
-- which is exact (invoicing and completion are a single step).
UPDATE "visa_cases" v SET "completedAt" = COALESCE(
  (SELECT MIN(i."issueDate") FROM "invoices" i WHERE i."caseId" = v."id"), v."updatedAt")
WHERE v."stage" = 'COMPLETED';
UPDATE "visa_cases" SET "cancelledAt" = "updatedAt" WHERE "stage" = 'CANCELLED';
UPDATE "visa_cases" SET "onHoldAt" = "updatedAt" WHERE "onHold" = true;
UPDATE "visa_cases" SET "appointmentStatusChangedAt" = "updatedAt"
WHERE "appointmentStatus" IS NOT NULL AND "appointmentStatus" <> 'WAITING';
