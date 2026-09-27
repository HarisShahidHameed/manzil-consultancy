-- A stored, generated numeric view of clientRef: "CL-953" -> 953, "CL-942-G1-02" -> 942.
--
-- It exists purely so listings can ORDER BY the number. clientRef is text, so an
-- alphabetical sort files CL-1000 above CL-953 — the reported "CL-953 listed above
-- CL-951" bug. Prisma cannot order by a computed expression, and the case listing has far
-- too many filters to restate as raw SQL just to get an ORDER BY, so the computation is
-- pushed down into the column itself and every listing can then sort on it normally.
--
-- GENERATED ALWAYS means Postgres maintains it: it can never drift from clientRef, and no
-- application code has to remember to update it when a ref is minted or rewritten by
-- grouping. It is read-only — nothing may ever write to it.
--
-- POSIX [0-9] rather than \d: a generated column's expression must be immutable, and the
-- bracket form keeps the pattern a plain immutable string literal.
ALTER TABLE "clients"
  ADD COLUMN "clientRefNum" INTEGER
  GENERATED ALWAYS AS ((NULLIF(substring("clientRef" from '^CL-([0-9]+)'), ''))::integer) STORED;

-- Matches the default listing order (newest received first, then ascending client number).
CREATE INDEX "clients_receivedDate_clientRefNum_idx"
  ON "clients" ("receivedDate" DESC, "clientRefNum" ASC);
