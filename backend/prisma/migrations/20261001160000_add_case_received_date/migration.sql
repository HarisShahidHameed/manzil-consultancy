-- 1 Oct 2026 #10: each CASE carries its own entry (received) date. A returning client keeps
-- their client number, but a new case opened for them today must be dated today, not with
-- the date their profile was first received years ago — otherwise it files under that old
-- date in every date-ordered listing and never shows up in the current day's views.
ALTER TABLE "visa_cases" ADD COLUMN "receivedDate" TIMESTAMP(3);

-- A client's first case was received with the client, so it takes the client's date exactly.
UPDATE "visa_cases" v SET "receivedDate" = c."receivedDate"
FROM "clients" c
WHERE c."id" = v."clientId"
  AND v."id" = (SELECT v2."id" FROM "visa_cases" v2 WHERE v2."clientId" = v."clientId"
                ORDER BY v2."createdAt" ASC, v2."id" ASC LIMIT 1);

-- Every later case (a returning client) is dated the day it was opened. Stored as midnight,
-- the same date-only convention clients.receivedDate uses.
UPDATE "visa_cases" SET "receivedDate" = date_trunc('day', "createdAt") WHERE "receivedDate" IS NULL;

ALTER TABLE "visa_cases" ALTER COLUMN "receivedDate" SET NOT NULL,
                         ALTER COLUMN "receivedDate" SET DEFAULT CURRENT_TIMESTAMP;
