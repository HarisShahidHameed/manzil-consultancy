-- Client emails: the welcome email and the two date-driven reminders.
CREATE TYPE "EmailType" AS ENUM ('WELCOME', 'HOTEL_CANCELLATION', 'FLIGHT_CHECKIN');
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- welcomeEmailEligible defaults to false, so no case that already exists can ever be sent a
-- late welcome email when somebody next edits it.
ALTER TABLE "visa_cases"
  ADD COLUMN "welcomeEmailEligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hotelCancellationDate" TIMESTAMP(3),
  ADD COLUMN "flightDateTime" TIMESTAMP(3);

CREATE TABLE "email_logs" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "type" "EmailType" NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "scheduledFor" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_logs_dedupeKey_key" ON "email_logs"("dedupeKey");
CREATE INDEX "email_logs_caseId_idx" ON "email_logs"("caseId");
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "visa_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
