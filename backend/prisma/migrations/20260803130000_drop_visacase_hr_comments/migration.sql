-- Data migration: fold any existing case-level hrComments into the client's single
-- accumulated log (tagged as historical File Processing entries, in creation order)
-- before the column is dropped, so no existing notes are lost.
UPDATE "clients" c
SET "hrComments" = COALESCE(NULLIF(c."hrComments", '') || E'\n', '') || sub.combined
FROM (
  SELECT "clientId", string_agg('[File Processing] ' || "hrComments", E'\n' ORDER BY "createdAt") AS combined
  FROM "visa_cases"
  WHERE "hrComments" IS NOT NULL AND "hrComments" <> ''
  GROUP BY "clientId"
) sub
WHERE sub."clientId" = c.id;

-- AlterTable
ALTER TABLE "visa_cases" DROP COLUMN "hrComments";
