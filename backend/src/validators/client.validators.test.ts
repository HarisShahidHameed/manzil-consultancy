import { updateCaseSchema } from './client.validators';

// A box the user empties has to reach the service as an explicit null, or the key is dropped,
// the stored value stays, and the next refetch brings the deleted text back.
describe('updateCaseSchema: emptying a field', () => {
  const textFields = ['city', 'fraNo', 'tlsAccount', 'appointmentNotes', 'salamComments'] as const;
  const dateFields = ['travelDate', 'hotelDate'] as const;

  it.each([...textFields, ...dateFields])('turns an empty %s into null', (field) => {
    expect(updateCaseSchema.parse({ [field]: '' })).toEqual({ [field]: null });
  });

  it.each(textFields)('treats a %s of only spaces as empty', (field) => {
    expect(updateCaseSchema.parse({ [field]: '   ' })).toEqual({ [field]: null });
  });

  it('leaves everything out when nothing was sent, so untouched values stay', () => {
    expect(updateCaseSchema.parse({})).toEqual({});
    expect(Object.keys(updateCaseSchema.parse({}))).toEqual([]);
  });

  it('keeps real values as typed', () => {
    expect(updateCaseSchema.parse({ salamComments: 'File Ready\nAgency will pay', travelDate: '2026-11-20' }))
      .toEqual({ salamComments: 'File Ready\nAgency will pay', travelDate: '2026-11-20' });
  });

  it('still enforces the length limit and the date format', () => {
    expect(() => updateCaseSchema.parse({ fraNo: 'x'.repeat(101) })).toThrow();
    expect(() => updateCaseSchema.parse({ travelDate: '20/11/2026' })).toThrow();
  });
});
