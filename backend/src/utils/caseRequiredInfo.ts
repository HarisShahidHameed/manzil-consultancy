// Client/case fields that must be filled in before a case can leave the
// Appointment stage for File Processing. Bulk-imported records are allowed to
// be missing these — they just stay in Appointment flagged as incomplete
// (see visaCase.service.ts assertTransitionAllowed) until completed.
export const CASE_REQUIRED_FIELDS = [
  'passportNumber', 'nationality', 'dob', 'passportIssue', 'passportExpiry', 'destination',
] as const;

export type CaseRequiredField = (typeof CASE_REQUIRED_FIELDS)[number];

interface RequiredClientFields {
  passportNumber: string | null;
  nationality: string | null;
  dob: Date | null;
  passportIssue: Date | null;
  passportExpiry: Date | null;
}

interface RequiredCaseFields {
  destination: string | null;
  destinationOptions?: string[];
}

export const getMissingRequiredFields = (
  client: RequiredClientFields,
  caseRecord: RequiredCaseFields
): CaseRequiredField[] => {
  const missing: CaseRequiredField[] = [];
  if (!client.passportNumber) missing.push('passportNumber');
  if (!client.nationality) missing.push('nationality');
  if (!client.dob) missing.push('dob');
  if (!client.passportIssue) missing.push('passportIssue');
  if (!client.passportExpiry) missing.push('passportExpiry');
  // A shortlisted-but-undecided destination is fine going into File Processing —
  // that's exactly where it gets finalized (see the FILE_PROCESSING>INVOICED gate).
  if (!caseRecord.destination && !caseRecord.destinationOptions?.length) missing.push('destination');
  return missing;
};
