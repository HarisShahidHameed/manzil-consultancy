-- Split the free-text "residentialAddress" column into structured address fields.
ALTER TABLE "clients" ADD COLUMN "addressStreet" TEXT;
ALTER TABLE "clients" ADD COLUMN "addressCity" TEXT;
ALTER TABLE "clients" ADD COLUMN "addressShire" TEXT;
ALTER TABLE "clients" ADD COLUMN "addressPostalCode" TEXT;
ALTER TABLE "clients" ADD COLUMN "addressCountry" TEXT;

-- Carry over existing free-text values as the street line so nothing is lost.
UPDATE "clients" SET "addressStreet" = "residentialAddress" WHERE "residentialAddress" IS NOT NULL;

ALTER TABLE "clients" DROP COLUMN "residentialAddress";
