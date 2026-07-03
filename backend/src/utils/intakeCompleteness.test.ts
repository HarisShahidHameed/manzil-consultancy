import { getMissingIntakeFields } from './intakeCompleteness';

const completeClient = {
  passportNumber: 'AB123456',
  nationality: 'Pakistani',
  dob: new Date('1990-01-01'),
  passportIssue: new Date('2020-01-01'),
  passportExpiry: new Date('2030-01-01'),
};

describe('getMissingIntakeFields', () => {
  it('returns an empty list when every required field is present', () => {
    expect(getMissingIntakeFields(completeClient, { destination: 'UK' })).toEqual([]);
  });

  it('flags each missing client field by name', () => {
    const missing = getMissingIntakeFields(
      { ...completeClient, passportNumber: null, nationality: null },
      { destination: 'UK' }
    );
    expect(missing).toEqual(['passportNumber', 'nationality']);
  });

  it('flags a missing destination (case-level field)', () => {
    expect(getMissingIntakeFields(completeClient, { destination: null })).toEqual(['destination']);
  });

  it('flags every field when everything is missing, in a stable order', () => {
    const missing = getMissingIntakeFields(
      { passportNumber: null, nationality: null, dob: null, passportIssue: null, passportExpiry: null },
      { destination: null }
    );
    expect(missing).toEqual(['passportNumber', 'nationality', 'dob', 'passportIssue', 'passportExpiry', 'destination']);
  });

  it('does not flag lastName or gender — they are not required to leave Intake', () => {
    // getMissingIntakeFields only ever looks at the 6 required fields; this test
    // documents that assumption so a future change to the field list is deliberate.
    const missing = getMissingIntakeFields(completeClient, { destination: 'UK' });
    expect(missing).not.toContain('lastName');
    expect(missing).not.toContain('gender');
  });
});
