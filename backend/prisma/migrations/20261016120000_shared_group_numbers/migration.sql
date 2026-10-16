-- 16 Oct 2026: group members share ONE client number again (CL-942-G1-01, CL-942-G1-02, ...),
-- only the member position differs. From 26 Sep 2026 each member had kept a number of its
-- own, so a group grew as CL-950-G2-01, CL-951-G2-02, ...

-- Numbers given up when an existing client joins a group. generateClientRef hands the lowest
-- of these out again before moving the counter on, so grouping never leaves a visible gap.
CREATE TABLE "client_number_pool" (
    "number"     INTEGER      NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_number_pool_pkey" PRIMARY KEY ("number")
);

-- Convert existing groups: every member takes the number of the group's first member (lowest
-- position), keeping its own position. A member whose position is shared with another member
-- of the same group is skipped rather than risk a duplicate ref; the application puts it right
-- the next time that group is touched (backfillGroupMembers). Legacy-format refs
-- (CL-110-Khan-1, CL-110-GRP-002-2) are likewise left for the application to upgrade.
WITH m AS (
  SELECT "id", "groupId",
         CAST(SUBSTRING("clientRef" FROM '^CL-(\d+)-G\d+-\d+$') AS INTEGER) AS num,
         CAST(SUBSTRING("clientRef" FROM '^CL-\d+-G\d+-(\d+)$') AS INTEGER) AS pos,
         SUBSTRING("clientRef" FROM '^CL-\d+(-G\d+-\d+)$')                  AS suffix
  FROM "clients"
  WHERE "groupId" IS NOT NULL AND "clientRef" ~ '^CL-\d+-G\d+-\d+$'
),
g AS (
  SELECT DISTINCT ON ("groupId") "groupId", num AS group_num
  FROM m
  ORDER BY "groupId", pos, num
),
changed AS (
  UPDATE "clients" c
  SET "clientRef" = 'CL-' || g.group_num || m.suffix
  FROM m JOIN g ON g."groupId" = m."groupId"
  WHERE c."id" = m."id"
    AND m.num <> g.group_num
    AND NOT EXISTS (SELECT 1 FROM m m2 WHERE m2."groupId" = m."groupId" AND m2.pos = m.pos AND m2."id" <> m."id")
  RETURNING m.num AS released
)
INSERT INTO "client_number_pool" ("number")
SELECT DISTINCT released FROM changed
ON CONFLICT ("number") DO NOTHING;

-- A released number someone else still carries (e.g. it is another group's number) is not free.
DELETE FROM "client_number_pool" p
WHERE EXISTS (SELECT 1 FROM "clients" c WHERE c."clientRefNum" = p."number");
