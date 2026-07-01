import { analyticsQuerySchema } from './dashboard.validators';

describe('analyticsQuerySchema', () => {
  it('accepts an empty query (all filters optional)', () => {
    const result = analyticsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it('accepts a fully populated valid query', () => {
    const input = {
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      destination: 'UK',
      assignedToId: '123e4567-e89b-12d3-a456-426614174000',
    };
    const result = analyticsQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(input);
  });

  it.each([
    ['2025-1-1', 'dateFrom'],
    ['01-01-2025', 'dateFrom'],
    ['2025/01/01', 'dateFrom'],
    ['not-a-date', 'dateFrom'],
  ])('rejects malformed date %s for %s', (value, field) => {
    const result = analyticsQuerySchema.safeParse({ [field]: value });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid assignedToId', () => {
    const result = analyticsQuerySchema.safeParse({ assignedToId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a destination longer than 100 characters', () => {
    const result = analyticsQuerySchema.safeParse({ destination: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts a destination at the 100 character boundary', () => {
    const result = analyticsQuerySchema.safeParse({ destination: 'x'.repeat(100) });
    expect(result.success).toBe(true);
  });

  it('rejects a non-string dateFrom instead of coercing it', () => {
    const result = analyticsQuerySchema.safeParse({ dateFrom: 20250101 });
    expect(result.success).toBe(false);
  });
});
