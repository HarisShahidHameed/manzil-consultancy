import { assertTransitionAllowed } from './visaCase.service';

const completeClient = {
  passportNumber: 'AB123456',
  nationality: 'Pakistani',
  dob: new Date('1990-01-01'),
  passportIssue: new Date('2020-01-01'),
  passportExpiry: new Date('2030-01-01'),
};

const baseCase = {
  advancePaid: true,
  onHold: false,
  invoices: [] as { status: string }[],
  destination: 'UK',
  client: completeClient,
};

describe('assertTransitionAllowed — Intake completeness gate', () => {
  it('allows INTAKE → APPOINTMENT when all required fields are present and advance is paid', () => {
    expect(() => assertTransitionAllowed('INTAKE', 'APPOINTMENT', baseCase)).not.toThrow();
  });

  it('allows INTAKE → APPOINTMENT even when advance is unpaid — it is a soft warning, not a gate', () => {
    const unpaid = { ...baseCase, advancePaid: false };
    expect(() => assertTransitionAllowed('INTAKE', 'APPOINTMENT', unpaid)).not.toThrow();
  });

  it('throws INTAKE_INCOMPLETE with the missing field names when required fields are absent', () => {
    const incomplete = { ...baseCase, client: { ...completeClient, passportNumber: null, nationality: null } };
    try {
      assertTransitionAllowed('INTAKE', 'APPOINTMENT', incomplete);
      throw new Error('expected assertTransitionAllowed to throw');
    } catch (e) {
      expect((e as Error).message).toBe('INTAKE_INCOMPLETE');
      expect((e as Error & { missingFields: string[] }).missingFields).toEqual(['passportNumber', 'nationality']);
    }
  });

  it('reports missing fields even when advance is also unpaid', () => {
    const incomplete = { ...baseCase, advancePaid: false, destination: null };
    try {
      assertTransitionAllowed('INTAKE', 'APPOINTMENT', incomplete);
      throw new Error('expected assertTransitionAllowed to throw');
    } catch (e) {
      expect((e as Error).message).toBe('INTAKE_INCOMPLETE');
    }
  });

  it('does not apply the Intake gate to other transitions', () => {
    const incomplete = { ...baseCase, client: { ...completeClient, passportNumber: null } };
    expect(() =>
      assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', incomplete)
    ).not.toThrow();
  });

  it('allows cancelling an incomplete Intake case regardless of missing fields', () => {
    const incomplete = { ...baseCase, client: { ...completeClient, passportNumber: null } };
    expect(() => assertTransitionAllowed('INTAKE', 'CANCELLED', incomplete)).not.toThrow();
  });
});
