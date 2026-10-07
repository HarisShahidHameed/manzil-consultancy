-- 1 Oct 2026 #9: an advance waiver now says WHY in one of three fixed ways — a plain waiver,
-- a family member, or a friend — and the listings show that sub-type instead of "Waived".
CREATE TYPE "AdvanceWaiverType" AS ENUM ('WAIVED', 'FAMILY', 'FRIEND');

ALTER TABLE "visa_cases" ADD COLUMN "advanceWaiverType" "AdvanceWaiverType";

-- Every waiver recorded before the sub-types existed was a plain one.
UPDATE "visa_cases" SET "advanceWaiverType" = 'WAIVED' WHERE "advanceWaived" = true;
