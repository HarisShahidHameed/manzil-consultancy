-- Client answer to Q11 (13 Oct 2026): a returning client who opens a new case comes back to
-- the top of the Clients page. That page is one row per person, so it orders by the person's
-- LATEST intake: the later of their own received date and their newest case's received date.
--
-- Kept by triggers rather than application code, so every path that adds, moves or deletes a
-- case stays correct — including scripts/merge-duplicate-clients.ts, which re-points cases
-- from one client to another. READ-ONLY from the application's point of view.
ALTER TABLE "clients" ADD COLUMN "lastIntakeDate" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION manzil_client_last_intake(cid TEXT, own_received TIMESTAMP(3))
RETURNS TIMESTAMP(3) LANGUAGE sql STABLE AS $$
  SELECT GREATEST(own_received,
    COALESCE((SELECT MAX(v."receivedDate") FROM "visa_cases" v WHERE v."clientId" = cid), own_received));
$$;

-- A client row: stamp it from its own date (and any cases it already has) on insert, and
-- recompute whenever its received date is corrected.
CREATE OR REPLACE FUNCTION manzil_clients_last_intake_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."lastIntakeDate" := manzil_client_last_intake(NEW."id", NEW."receivedDate");
  RETURN NEW;
END $$;

CREATE TRIGGER clients_last_intake
BEFORE INSERT OR UPDATE OF "receivedDate" ON "clients"
FOR EACH ROW EXECUTE FUNCTION manzil_clients_last_intake_trg();

-- A case added, re-dated, moved to another client or deleted: refresh the client(s) involved.
-- Only "lastIntakeDate" is written, so this never re-fires the clients trigger above.
CREATE OR REPLACE FUNCTION manzil_cases_last_intake_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE "clients" c SET "lastIntakeDate" = manzil_client_last_intake(c."id", c."receivedDate")
    WHERE c."id" = NEW."clientId";
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE "clients" c SET "lastIntakeDate" = manzil_client_last_intake(c."id", c."receivedDate")
    WHERE c."id" = OLD."clientId" AND (TG_OP = 'DELETE' OR OLD."clientId" <> NEW."clientId");
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER visa_cases_last_intake
AFTER INSERT OR UPDATE OF "receivedDate", "clientId" OR DELETE ON "visa_cases"
FOR EACH ROW EXECUTE FUNCTION manzil_cases_last_intake_trg();

-- Existing rows.
UPDATE "clients" c SET "lastIntakeDate" = manzil_client_last_intake(c."id", c."receivedDate");
