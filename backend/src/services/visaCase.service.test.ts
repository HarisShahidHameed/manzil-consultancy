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
  appointmentDate: new Date('2026-08-01'),
  client: completeClient,
};

describe('assertTransitionAllowed — Appointment → File Processing gates', () => {
  it('allows APPOINTMENT → FILE_PROCESSING when info is complete and the appointment is booked', () => {
    expect(() => assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', baseCase)).not.toThrow();
  });

  it('allows APPOINTMENT → FILE_PROCESSING even when advance is unpaid — it is a soft warning, not a gate', () => {
    const unpaid = { ...baseCase, advancePaid: false };
    expect(() => assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', unpaid)).not.toThrow();
  });

  it('throws CLIENT_INFO_INCOMPLETE with the missing field names when required fields are absent', () => {
    const incomplete = { ...baseCase, client: { ...completeClient, passportNumber: null, nationality: null } };
    try {
      assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', incomplete);
      throw new Error('expected assertTransitionAllowed to throw');
    } catch (e) {
      expect((e as Error).message).toBe('CLIENT_INFO_INCOMPLETE');
      expect((e as Error & { missingFields: string[] }).missingFields).toEqual(['passportNumber', 'nationality']);
    }
  });

  it('throws APPOINTMENT_NOT_BOOKED when no appointment date is set', () => {
    const unbooked = { ...baseCase, appointmentDate: null };
    expect(() => assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', unbooked))
      .toThrow('APPOINTMENT_NOT_BOOKED');
  });

  it('reports missing info before the unbooked appointment', () => {
    const incomplete = { ...baseCase, appointmentDate: null, destination: null };
    try {
      assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', incomplete);
      throw new Error('expected assertTransitionAllowed to throw');
    } catch (e) {
      expect((e as Error).message).toBe('CLIENT_INFO_INCOMPLETE');
    }
  });

  it('does not apply the gates to other transitions', () => {
    const incomplete = { ...baseCase, appointmentDate: null, client: { ...completeClient, passportNumber: null } };
    expect(() =>
      assertTransitionAllowed('FILE_PROCESSING', 'INVOICED', incomplete)
    ).not.toThrow();
  });

  it('allows cancelling an incomplete Appointment case regardless of missing fields', () => {
    const incomplete = { ...baseCase, client: { ...completeClient, passportNumber: null } };
    expect(() => assertTransitionAllowed('APPOINTMENT', 'CANCELLED', incomplete)).not.toThrow();
  });
});

describe('assertTransitionAllowed — general workflow rules', () => {
  it('blocks stage-skipping (APPOINTMENT → INVOICED)', () => {
    expect(() => assertTransitionAllowed('APPOINTMENT', 'INVOICED', baseCase)).toThrow('STAGE_SKIP');
  });

  it('blocks a paused case from advancing', () => {
    const paused = { ...baseCase, onHold: true };
    expect(() => assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', paused)).toThrow('ON_HOLD');
  });

  it('blocks completion while invoices are unpaid', () => {
    const owing = { ...baseCase, invoices: [{ status: 'SENT' }] };
    expect(() => assertTransitionAllowed('INVOICED', 'COMPLETED', owing)).toThrow('DUES_PENDING');
  });

  it('allows completion once every invoice is paid', () => {
    const paid = { ...baseCase, invoices: [{ status: 'PAID' }] };
    expect(() => assertTransitionAllowed('INVOICED', 'COMPLETED', paid)).not.toThrow();
  });
});
