// Fields that must be filled in before a case can leave the Intake stage.
// Bulk-imported records are allowed to be missing these — they just stay
// stuck in Intake (see visaCase.service.ts assertTransitionAllowed) until completed.
export const INTAKE_REQUIRED_FIELDS = [
  'passportNumber', 'nationality', 'dob', 'passportIssue', 'passportExpiry', 'destination',
] as const;

export type IntakeRequiredField = (typeof INTAKE_REQUIRED_FIELDS)[number];

interface IntakeClientFields {
  passportNumber: string | null;
  nationality: string | null;
  dob: Date | null;
  passportIssue: Date | null;
  passportExpiry: Date | null;
}

interface IntakeCaseFields {
  destination: string | null;
}

export const getMissingIntakeFields = (
  client: IntakeClientFields,
  caseRecord: IntakeCaseFields
): IntakeRequiredField[] => {
  const missing: IntakeRequiredField[] = [];
  if (!client.passportNumber) missing.push('passportNumber');
  if (!client.nationality) missing.push('nationality');
  if (!client.dob) missing.push('dob');
  if (!client.passportIssue) missing.push('passportIssue');
  if (!client.passportExpiry) missing.push('passportExpiry');
  if (!caseRecord.destination) missing.push('destination');
  return missing;
};
