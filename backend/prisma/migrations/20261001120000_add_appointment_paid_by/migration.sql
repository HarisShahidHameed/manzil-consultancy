-- 1 Oct 2026 #5: who paid for the appointment (client vs agency) is now captured by the
-- Appointment team when the date is allotted, instead of being inferred in File Processing
-- from whether an appointment cost had been typed in.
CREATE TYPE "PaymentSource" AS ENUM ('CLIENT', 'AGENCY');

ALTER TABLE "visa_cases" ADD COLUMN "appointmentPaidBy" "PaymentSource";

-- Backfill only what the data actually proves: an appointment cost on file means the agency
-- fronted it (that is exactly what the old Paid By radio inferred). Everything else stays
-- NULL = "not recorded", which the UI treats as the old inferred behaviour and leaves
-- editable in File Processing, rather than guessing CLIENT for cases nobody ever answered.
UPDATE "visa_cases" SET "appointmentPaidBy" = 'AGENCY' WHERE "docAppointmentCost" > 0;
