jest.mock('../config/database', () => {
  const visaCase = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  };
  const client = { findUnique: jest.fn(), update: jest.fn() };
  return {
    prisma: {
      visaCase,
      client,
      // The service does its primary write and its family-group propagation in one
      // transaction; the mock just runs the callback against the same fake client.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ visaCase, client })),
    },
  };
});

import { prisma } from '../config/database';
// The listing's query schema, imported so the drill-down round trip goes through the real
// wire coercion rather than a test-local imitation of it.
import { caseQuerySchema } from '../controllers/visaCase.controller';
import {
  assertTransitionAllowed,
  isAdvanceSettled,
  createCase,
  updateCase,
  getAppointmentMetrics,
  listCases,
  CASE_DATE_FIELDS,
} from './visaCase.service';

const caseMock = prisma.visaCase as unknown as Record<string, jest.Mock>;

// The shape updateCase reads before it writes (BEFORE_UPDATE_SELECT), with only the bits
// these tests care about filled in.
const existingCase = (over: Record<string, unknown> = {}) => ({
  stage: 'APPOINTMENT',
  onHold: false,
  advancePaid: false,
  advancePaidDate: null,
  advanceWaived: false,
  whatsappGroupCreated: false,
  destination: 'France',
  destinationOptions: [],
  city: null,
  cityOptions: [],
  appointmentDate: null,
  appointmentDateSetAt: null,
  fileProcessingStartedAt: null,
  invoices: [],
  client: { groupId: null, serviceType: 'FULL_SERVICE' },
  ...over,
});

const mockUpdateFlow = (before: Record<string, unknown>) => {
  caseMock.findUnique.mockResolvedValue(before);
  caseMock.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'case-1', clientId: 'client-1', ...data }));
  caseMock.updateMany.mockResolvedValue({ count: 0 });
};

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
  appointmentPaidBy: 'AGENCY',
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

describe('assertTransitionAllowed — APPOINTMENT_ONLY clients skip File Processing/Invoiced', () => {
  const apptOnlyCase = { ...baseCase, client: { ...completeClient, serviceType: 'APPOINTMENT_ONLY' } };

  it('allows APPOINTMENT → COMPLETED directly when info is complete and the appointment is booked', () => {
    expect(() => assertTransitionAllowed('APPOINTMENT', 'COMPLETED', apptOnlyCase)).not.toThrow();
  });

  it('blocks APPOINTMENT → FILE_PROCESSING — not a stage in an appointment-only case\'s path at all', () => {
    expect(() => assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', apptOnlyCase)).toThrow('STAGE_INVALID');
  });

  it('still enforces the required-info gate before completing directly', () => {
    const incomplete = { ...apptOnlyCase, client: { ...apptOnlyCase.client, passportNumber: null } };
    expect(() => assertTransitionAllowed('APPOINTMENT', 'COMPLETED', incomplete)).toThrow('CLIENT_INFO_INCOMPLETE');
  });

  it('still enforces the appointment-booked gate before completing directly', () => {
    const unbooked = { ...apptOnlyCase, appointmentDate: null };
    expect(() => assertTransitionAllowed('APPOINTMENT', 'COMPLETED', unbooked)).toThrow('APPOINTMENT_NOT_BOOKED');
  });

  it('a FULL_SERVICE client cannot skip straight to COMPLETED from APPOINTMENT', () => {
    expect(() => assertTransitionAllowed('APPOINTMENT', 'COMPLETED', baseCase)).toThrow('STAGE_SKIP');
  });
});

describe('advance waiver — refusal / free-service cases are settled, never unpaid', () => {
  it('treats a waived case as settled even though no money was received', () => {
    expect(isAdvanceSettled({ advancePaid: false, advanceWaived: true })).toBe(true);
    expect(isAdvanceSettled({ advancePaid: true, advanceWaived: false })).toBe(true);
    expect(isAdvanceSettled({ advancePaid: false, advanceWaived: false })).toBe(false);
  });

  it('does not let a zero advance flip a waived case back to unpaid', async () => {
    mockUpdateFlow(existingCase({ advanceWaived: true }));
    await updateCase('case-1', { advance: 0 });
    expect(caseMock.update.mock.calls[0][0].data).not.toHaveProperty('advancePaid');
  });

  it('still derives advancePaid from the amount on a case that is not waived', async () => {
    mockUpdateFlow(existingCase());
    await updateCase('case-1', { advance: 0 });
    expect(caseMock.update.mock.calls[0][0].data.advancePaid).toBe(false);
  });

  it('clears the waiver reason when the waiver itself is lifted', async () => {
    mockUpdateFlow(existingCase({ advanceWaived: true }));
    await updateCase('case-1', { advanceWaived: false });
    expect(caseMock.update.mock.calls[0][0].data.advanceWaiverReason).toBeNull();
  });
});

describe('family bookings — one advance and one WhatsApp group for the whole group', () => {
  it('propagates a paid advance to the group\'s other active cases, without the amounts', async () => {
    mockUpdateFlow(existingCase({ client: { groupId: 'group-1', serviceType: 'FULL_SERVICE' } }));
    await updateCase('case-1', { advancePaid: true, advance: 500 });

    const propagated = caseMock.updateMany.mock.calls[0][0];
    expect(propagated.where).toEqual({
      id: { not: 'case-1' },
      client: { groupId: 'group-1' },
      stage: { in: ['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED'] },
    });
    expect(propagated.data.advancePaid).toBe(true);
    expect(propagated.data.advancePaidDate).toBeInstanceOf(Date);
    expect(propagated.data).not.toHaveProperty('advance');
    expect(propagated.data).not.toHaveProperty('charges');
    expect(propagated.data).not.toHaveProperty('discount');
  });

  it('propagates un-marking too, so a mistake can be corrected from any member', async () => {
    mockUpdateFlow(existingCase({ advancePaid: true, client: { groupId: 'group-1', serviceType: 'FULL_SERVICE' } }));
    await updateCase('case-1', { advancePaid: false });
    expect(caseMock.updateMany.mock.calls[0][0].data).toEqual({ advancePaid: false, advancePaidDate: null });
  });

  it('propagates a waiver, carrying its reason across the family', async () => {
    mockUpdateFlow(existingCase({ client: { groupId: 'group-1', serviceType: 'FULL_SERVICE' } }));
    await updateCase('case-1', { advanceWaived: true, advanceWaiverReason: 'Prior refusal' });
    expect(caseMock.updateMany.mock.calls[0][0].data).toEqual({
      advanceWaived: true,
      advanceWaiverReason: 'Prior refusal',
      // A bare waiver is the plain kind (1 Oct 2026 #9), and the kind travels with it.
      advanceWaiverType: 'WAIVED',
    });
  });

  it('propagates the shared WhatsApp group both ways', async () => {
    mockUpdateFlow(existingCase({ client: { groupId: 'group-1', serviceType: 'FULL_SERVICE' } }));
    await updateCase('case-1', { whatsappGroupCreated: true });
    expect(caseMock.updateMany.mock.calls[0][0].data).toEqual({ whatsappGroupCreated: true });

    caseMock.updateMany.mockClear();
    mockUpdateFlow(existingCase({ whatsappGroupCreated: true, client: { groupId: 'group-1', serviceType: 'FULL_SERVICE' } }));
    await updateCase('case-1', { whatsappGroupCreated: false });
    expect(caseMock.updateMany.mock.calls[0][0].data).toEqual({ whatsappGroupCreated: false });
  });

  it('does not propagate a flag the update did not actually change', async () => {
    mockUpdateFlow(existingCase({ advancePaid: true, client: { groupId: 'group-1', serviceType: 'FULL_SERVICE' } }));
    await updateCase('case-1', { advancePaid: true });
    expect(caseMock.updateMany).not.toHaveBeenCalled();
  });

  it('propagates nothing for a client who belongs to no group', async () => {
    mockUpdateFlow(existingCase({ client: { groupId: null, serviceType: 'FULL_SERVICE' } }));
    await updateCase('case-1', { advancePaid: true });
    expect(caseMock.updateMany).not.toHaveBeenCalled();
  });

  // A group member is an individual client who happens to be linked to a family, not a
  // permanent dependant of it. The family's settled advance belongs to the booking it was
  // paid for; a case opened later must start unpaid, or a member returning a year later for
  // a visa of their own gets a case that reads as settled with nobody having paid for it.
  describe('a member opening a case of their own later', () => {
    const mockCreateFlow = (siblings: Record<string, unknown>[], groupId: string | null) => {
      (prisma.client.findUnique as jest.Mock).mockResolvedValue({ groupId });
      caseMock.findMany.mockResolvedValue(siblings);
      caseMock.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-case', ...data }));
      caseMock.updateMany.mockResolvedValue({ count: 0 });
    };

    it("does not inherit the family's already-paid advance", async () => {
      mockCreateFlow([{
        advancePaid: true, advancePaidDate: new Date('2026-01-01'),
        advanceWaived: false, advanceWaiverReason: null, whatsappGroupCreated: false,
      }], 'group-1');

      await createCase('client-1', { destination: 'Japan' });

      const created = caseMock.create.mock.calls[0][0].data;
      expect(created.advancePaid).toBe(false);
      expect(created.advancePaidDate).toBeUndefined();
    });

    it("does not inherit the family's waiver either", async () => {
      mockCreateFlow([{
        advancePaid: false, advancePaidDate: null,
        advanceWaived: true, advanceWaiverReason: 'Prior refusal', whatsappGroupCreated: false,
      }], 'group-1');

      await createCase('client-1', { destination: 'Japan' });

      const created = caseMock.create.mock.calls[0][0].data;
      expect(created.advanceWaived).toBeUndefined();
      expect(created.advanceWaiverReason).toBeUndefined();
    });

    // The WhatsApp group is the exception: one group per family unit regardless of member
    // count, so it IS a standing property of the family rather than of one booking.
    it("does inherit the family's shared WhatsApp group", async () => {
      mockCreateFlow([{
        advancePaid: true, advancePaidDate: new Date('2026-01-01'),
        advanceWaived: false, advanceWaiverReason: null, whatsappGroupCreated: true,
      }], 'group-1');

      await createCase('client-1', { destination: 'Japan' });

      expect(caseMock.create.mock.calls[0][0].data.whatsappGroupCreated).toBe(true);
    });

    it('still settles the family when this new case is the one carrying the payment', async () => {
      mockCreateFlow([{
        advancePaid: false, advancePaidDate: null,
        advanceWaived: false, advanceWaiverReason: null, whatsappGroupCreated: false,
      }], 'group-1');

      await createCase('client-1', { destination: 'France', advance: 200 });

      expect(caseMock.create.mock.calls[0][0].data.advancePaid).toBe(true);
      expect(caseMock.updateMany.mock.calls[0][0].data.advancePaid).toBe(true);
    });
  });
});

describe('advanceState — waived is its own state, not a hole in a boolean', () => {
  beforeEach(() => {
    caseMock.findMany.mockResolvedValue([]);
    caseMock.count.mockResolvedValue(0);
  });

  const whereFor = async (opts: Parameters<typeof listCases>[0]) => {
    await listCases(opts);
    return caseMock.findMany.mock.calls[0][0].where;
  };

  it('asks for paid as money actually received and not waived', async () => {
    expect(await whereFor({ advanceState: 'paid' })).toMatchObject({ advancePaid: true, advanceWaived: false });
  });

  it('asks for unpaid without catching a case whose advance was waived', async () => {
    expect(await whereFor({ advanceState: 'unpaid' })).toMatchObject({ advancePaid: false, advanceWaived: false });
  });

  it('can finally ask for waived cases, whatever the payment flag says', async () => {
    const where = await whereFor({ advanceState: 'waived' });
    expect(where).toMatchObject({ advanceWaived: true });
    expect(where).not.toHaveProperty('advancePaid');
  });

  // The three predicates partition every row: waived is advanceWaived: true, and the other
  // two pin advanceWaived: false and split that remainder on advancePaid. Asserted here so
  // a later edit that, say, drops advanceWaived from `paid` is caught as the overlap it is.
  it('covers every case exactly once — the three states partition the table', async () => {
    const rows = [
      { advancePaid: false, advanceWaived: false },
      { advancePaid: true,  advanceWaived: false },
      { advancePaid: false, advanceWaived: true  },
      { advancePaid: true,  advanceWaived: true  },
    ];
    const states: Array<'paid' | 'unpaid' | 'waived'> = ['paid', 'unpaid', 'waived'];
    const predicates: Record<string, unknown>[] = [];
    for (const s of states) {
      caseMock.findMany.mockClear();
      predicates.push(await whereFor({ advanceState: s }));
    }
    for (const row of rows) {
      const matched = predicates.filter(p =>
        Object.entries(p).every(([k, v]) => (row as Record<string, unknown>)[k] === v));
      expect(matched).toHaveLength(1);
    }
  });

  it('keeps the legacy advancePaid boolean working, on the very same predicates', async () => {
    expect(await whereFor({ advancePaid: true })).toMatchObject({ advancePaid: true, advanceWaived: false });
    caseMock.findMany.mockClear();
    expect(await whereFor({ advancePaid: false })).toMatchObject({ advancePaid: false, advanceWaived: false });
  });

  it('lets advanceState win when a caller sends both spellings', async () => {
    expect(await whereFor({ advancePaid: true, advanceState: 'waived' }))
      .toMatchObject({ advanceWaived: true });
  });

  it('filters on neither when the caller asks for neither', async () => {
    const where = await whereFor({});
    expect(where).not.toHaveProperty('advancePaid');
    expect(where).not.toHaveProperty('advanceWaived');
  });
});

describe('listCases date range — half-open, whitelisted column', () => {
  beforeEach(() => {
    caseMock.findMany.mockResolvedValue([]);
    caseMock.count.mockResolvedValue(0);
  });

  const from = new Date('2026-09-25T00:00:00.000Z');
  const to   = new Date('2026-09-26T00:00:00.000Z');

  it('ranges over the named column as [from, to)', async () => {
    await listCases({ dateField: 'fileProcessingStartedAt', from, to });
    expect(caseMock.findMany.mock.calls[0][0].where.fileProcessingStartedAt).toEqual({ gte: from, lt: to });
  });

  it('excludes the upper bound so adjacent buckets never double-count', async () => {
    await listCases({ dateField: 'createdAt', from, to });
    const range = caseMock.findMany.mock.calls[0][0].where.createdAt;
    expect(range).not.toHaveProperty('lte');
    expect(range.lt.getTime()).toBe(to.getTime());
    // The instant that closes one bucket opens the next, and belongs only to the next.
    expect(range.gte.getTime()).toBe(from.getTime());
  });

  it('accepts an open-ended range on either side', async () => {
    await listCases({ dateField: 'createdAt', from });
    expect(caseMock.findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: from });
    caseMock.findMany.mockClear();
    await listCases({ dateField: 'createdAt', to });
    expect(caseMock.findMany.mock.calls[0][0].where.createdAt).toEqual({ lt: to });
  });

  it('refuses a range with no column to range over', async () => {
    await expect(listCases({ from, to })).rejects.toThrow('DATE_RANGE_WITHOUT_FIELD');
  });

  it('never lets an unknown column name reach the where clause', () => {
    // The type system rejects this at compile time; the runtime whitelist is the query
    // schema's z.enum(CASE_DATE_FIELDS), so what is asserted here is that the two lists
    // are the same list — a new sortable timestamp must be added deliberately.
    expect([...CASE_DATE_FIELDS]).toEqual(['appointmentDateSetAt', 'fileProcessingStartedAt', 'createdAt']);
    expect(CASE_DATE_FIELDS).not.toContain('advancePaidDate');
  });

  it('applies the range alongside the other filters rather than replacing them', async () => {
    await listCases({ dateField: 'appointmentDateSetAt', from, to, serviceType: 'FULL_SERVICE', onHold: false });
    expect(caseMock.findMany.mock.calls[0][0].where).toMatchObject({
      appointmentDateSetAt: { gte: from, lt: to },
      onHold: false,
      client: { serviceType: 'FULL_SERVICE' },
    });
  });
});

describe('getAppointmentMetrics — calendar buckets', () => {
  beforeEach(() => {
    let n = 0;
    caseMock.count.mockImplementation(() => Promise.resolve(++n));
  });

  it('returns all nine counts in the shape the cards expect', async () => {
    const metrics = await getAppointmentMetrics();
    expect(metrics.appointmentDateAllotted).toMatchObject({ today: 1, yesterday: 2, month: 3 });
    expect(metrics.movedToFileProcessing).toMatchObject({ today: 4, yesterday: 5, month: 6 });
    expect(metrics.appointmentOnly).toMatchObject({ today: 7, yesterday: 8, month: 9 });
    expect(caseMock.count).toHaveBeenCalledTimes(9);
  });

  it('counts each metric by its own timestamp, filtered by service type and excluding paused cases', async () => {
    await getAppointmentMetrics();
    const wheres = caseMock.count.mock.calls.map(c => c[0].where);
    expect(wheres.every(w => w.onHold === false)).toBe(true);
    expect(wheres[0]).toMatchObject({ client: { serviceType: 'FULL_SERVICE' } });
    expect(wheres[0].appointmentDateSetAt).toBeDefined();
    expect(wheres[3].fileProcessingStartedAt).toBeDefined();
    expect(wheres[6]).toMatchObject({ client: { serviceType: 'APPOINTMENT_ONLY' } });
    expect(wheres[6].createdAt).toBeDefined();
  });

  it('buckets Today from midnight, Yesterday as the whole previous day, Month from the 1st', async () => {
    await getAppointmentMetrics();
    const [today, yesterday, month] = caseMock.count.mock.calls.slice(0, 3).map(c => c[0].where.appointmentDateSetAt);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    expect(today.gte.getTime()).toBe(midnight.getTime());
    expect(yesterday.lt.getTime()).toBe(midnight.getTime());
    expect(midnight.getTime() - yesterday.gte.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(month.gte.getDate()).toBe(1);
    expect(month.gte.getMonth()).toBe(midnight.getMonth());
  });

  it('bounds every bucket half-open, so the midnight case is counted once', async () => {
    const metrics = await getAppointmentMetrics();
    const ranges = caseMock.count.mock.calls.slice(0, 3).map(c => c[0].where.appointmentDateSetAt);
    expect(ranges.every(r => r.lt !== undefined && r.lte === undefined)).toBe(true);
    // Yesterday closes exactly where Today opens — the shared instant belongs to Today only.
    expect(metrics.ranges.yesterday.to).toBe(metrics.ranges.today.from);
  });

  it('returns the instants it actually counted over, serialized ISO for the drill-down', async () => {
    const metrics = await getAppointmentMetrics();
    const [today] = caseMock.count.mock.calls.map(c => c[0].where.appointmentDateSetAt);
    expect(metrics.ranges.today.from).toBe(today.gte.toISOString());
    expect(metrics.ranges.today.to).toBe(today.lt.toISOString());
    expect(new Date(metrics.ranges.month.from).getDate()).toBe(1);
  });

  it('carries the /api/cases params that reproduce each card, minus the bucket', async () => {
    const metrics = await getAppointmentMetrics();
    expect(metrics.appointmentDateAllotted.filters).toEqual({
      dateField: 'appointmentDateSetAt', serviceType: 'FULL_SERVICE', onHold: 'false', hasAppointmentDate: 'true',
    });
    expect(metrics.movedToFileProcessing.filters).toEqual({
      dateField: 'fileProcessingStartedAt', serviceType: 'FULL_SERVICE', onHold: 'false',
    });
    expect(metrics.appointmentOnly.filters).toEqual({
      dateField: 'createdAt', serviceType: 'APPOINTMENT_ONLY', onHold: 'false',
    });
    // from/to are the bucket the user clicks, not part of the card.
    for (const card of [metrics.appointmentDateAllotted, metrics.movedToFileProcessing, metrics.appointmentOnly]) {
      expect(card.filters).not.toHaveProperty('from');
      expect(card.filters).not.toHaveProperty('to');
    }
  });
});

/**
 * The reason the cards return their own params at all: a modal opened from a card must show
 * the rows that card counted. Here each card's `filters` are put back through the public
 * query schema and then through listCases, exactly as a browser would send them, and the
 * resulting Prisma `where` is compared with the one the count ran on.
 */
describe('metric drill-down — a card\'s filters reproduce the card\'s own count', () => {
  const CARDS = ['appointmentDateAllotted', 'movedToFileProcessing', 'appointmentOnly'] as const;
  const BUCKETS = ['today', 'yesterday', 'month'] as const;

  // The real wire coercion, not a copy of it: the card's params are parsed by the very
  // schema GET /api/cases parses its query string with.
  const fromQueryParams = (params: Record<string, string>, range: { from: string; to: string }) =>
    caseQuerySchema.parse({ ...params, from: range.from, to: range.to });

  it('lands on exactly the rows behind every card × bucket number', async () => {
    // Every count is distinct, so a drill-down resolving to a different predicate resolves
    // to a different number and the comparison fails loudly.
    const byWhere = new Map<string, number>();
    let n = 0;
    caseMock.count.mockImplementation(({ where }: { where: unknown }) => {
      const key = JSON.stringify(where);
      if (!byWhere.has(key)) byWhere.set(key, ++n);
      return Promise.resolve(byWhere.get(key));
    });
    caseMock.findMany.mockResolvedValue([]);

    const metrics = await getAppointmentMetrics();

    for (const card of CARDS) {
      for (const bucket of BUCKETS) {
        const range = metrics.ranges[bucket];
        const result = await listCases(fromQueryParams(metrics[card].filters, range));
        expect(result.total).toBe(metrics[card][bucket]);
      }
    }
  });
});

describe('listCases ordering', () => {
  beforeEach(() => {
    caseMock.findMany.mockResolvedValue([]);
    caseMock.count.mockResolvedValue(0);
  });

  // File Processing is a deadline board: the file team reads it soonest-appointment-first,
  // and an ordering that ignores that is the "data is messed up" complaint.
  it('leads File Processing with the soonest appointment, without being asked to', async () => {
    await listCases({ stage: 'FILE_PROCESSING' });
    expect(caseMock.findMany.mock.calls[0][0].orderBy).toEqual([
      { appointmentDate: { sort: 'asc', nulls: 'last' } },
      { client: { clientRefNum: { sort: 'desc', nulls: 'last' } } },
      { client: { clientRef: 'desc' } },
    ]);
  });

  // A deadline reads soonest-first; asking for the field alone must not hand back the
  // descending default the other columns use.
  it('defaults an appointment-date sort to ascending even when no order is given', async () => {
    await listCases({ stage: 'FILE_PROCESSING', sort: 'appointmentDate' });
    expect(caseMock.findMany.mock.calls[0][0].orderBy[0]).toEqual(
      { appointmentDate: { sort: 'asc', nulls: 'last' } },
    );
  });

  it('offers "recently routed" as the other view the file team wants', async () => {
    await listCases({ stage: 'FILE_PROCESSING', sort: 'routedAt' });
    expect(caseMock.findMany.mock.calls[0][0].orderBy).toEqual([
      { fileProcessingStartedAt: { sort: 'desc', nulls: 'last' } },
      { client: { receivedDate: 'desc' } },
      { client: { clientRefNum: { sort: 'desc', nulls: 'last' } } },
      { client: { clientRef: 'desc' } },
    ]);
  });

  // The reported bug was on the STAGE views, not the Clients page: a day's intake shares a
  // received date, so without a final tiebreak those rows came back in arbitrary order
  // (CL-1033, CL-1031, CL-1032 as seen in production). Every ordering must end on the
  // client number, whichever sort field the caller picked — descending since 1 Oct 2026,
  // so the newest client tops each same-date group.
  it.each(['routedAt', 'appointmentDate', 'receivedDate', 'createdAt'] as const)(
    'ends the %s ordering on descending client number',
    async (sort) => {
      caseMock.findMany.mockClear();
      await listCases({ sort });
      const orderBy = caseMock.findMany.mock.calls[0][0].orderBy;
      expect(orderBy.slice(-2)).toEqual([
        { client: { clientRefNum: { sort: 'desc', nulls: 'last' } } },
        { client: { clientRef: 'desc' } },
      ]);
    },
  );

  it('maps the "none" file-handler sentinel to unassigned cases', async () => {
    await listCases({ stage: 'FILE_PROCESSING', fileAssignedToId: 'none' });
    expect(caseMock.findMany.mock.calls[0][0].where.fileAssignedToId).toBeNull();
  });

  it('still routes a real uuid to that handler — "none" cannot collide with one', async () => {
    const id = '11111111-2222-4333-8444-555555555555';
    await listCases({ fileAssignedToId: id });
    expect(caseMock.findMany.mock.calls[0][0].where.fileAssignedToId).toBe(id);
  });
});

/**
 * The query schema is the runtime half of the date-range whitelist: `dateField` is the only
 * way a column name reaches buildCaseWhere, so an unknown one has to die here.
 */
describe('caseQuerySchema — the wire contract for the new filters', () => {
  it('accepts exactly the three advance states and nothing else', () => {
    for (const advanceState of ['paid', 'unpaid', 'waived']) {
      expect(caseQuerySchema.parse({ advanceState }).advanceState).toBe(advanceState);
    }
    expect(() => caseQuerySchema.parse({ advanceState: 'exempt' })).toThrow();
  });

  it('still accepts the deprecated advancePaid boolean', () => {
    expect(caseQuerySchema.parse({ advancePaid: 'true' }).advancePaid).toBe(true);
    expect(caseQuerySchema.parse({ advancePaid: 'false' }).advancePaid).toBe(false);
  });

  it('rejects a dateField that is not on the whitelist', () => {
    expect(() => caseQuerySchema.parse({
      dateField: 'advancePaidDate', from: '2026-09-25T00:00:00.000Z', to: '2026-09-26T00:00:00.000Z',
    })).toThrow();
    // ...including anything that only looks like a column, e.g. a Prisma relation path.
    expect(() => caseQuerySchema.parse({ dateField: 'client.receivedDate' })).toThrow();
  });

  it('rejects a range with no dateField — a 400, not a guessed column', () => {
    expect(() => caseQuerySchema.parse({ from: '2026-09-25T00:00:00.000Z' })).toThrow();
    expect(() => caseQuerySchema.parse({ to: '2026-09-26T00:00:00.000Z' })).toThrow();
    // dateField on its own is harmless — it only narrows anything once a bound arrives.
    expect(() => caseQuerySchema.parse({ dateField: 'createdAt' })).not.toThrow();
  });

  it('parses the bounds into Dates at the exact instants sent', () => {
    const q = caseQuerySchema.parse({
      dateField: 'createdAt', from: '2026-09-25T19:00:00.000Z', to: '2026-09-26T19:00:00.000Z',
    });
    expect(q.from?.toISOString()).toBe('2026-09-25T19:00:00.000Z');
    expect(q.to?.toISOString()).toBe('2026-09-26T19:00:00.000Z');
  });

  it('keeps admitting the "none" sentinel beside a real uuid, and nothing in between', () => {
    expect(caseQuerySchema.parse({ fileAssignedToId: 'none' }).fileAssignedToId).toBe('none');
    const id = '11111111-2222-4333-8444-555555555555';
    expect(caseQuerySchema.parse({ fileAssignedToId: id }).fileAssignedToId).toBe(id);
    expect(() => caseQuerySchema.parse({ fileAssignedToId: 'nobody' })).toThrow();
  });
});

// 1 Oct 2026 #3 — an appointment date could be entered but never removed, and the
// "Appointment Date Allotted" card kept counting a case whose date had been withdrawn.
describe('removing an appointment date', () => {
  beforeEach(() => jest.clearAllMocks());

  it('clears the date and withdraws the allotment stamp', async () => {
    mockUpdateFlow(existingCase({
      appointmentDate: new Date('2026-10-20'),
      appointmentDateSetAt: new Date('2026-10-01T09:00:00Z'),
    }));
    await updateCase('case-1', { appointmentDate: null });
    const data = caseMock.update.mock.calls[0][0].data;
    expect(data.appointmentDate).toBeNull();
    expect(data.appointmentDateSetAt).toBeNull();
  });

  it('stamps a re-entered date as a fresh allotment', async () => {
    mockUpdateFlow(existingCase({ appointmentDate: null, appointmentDateSetAt: null }));
    await updateCase('case-1', { appointmentDate: '2026-11-15', appointmentPaidBy: 'CLIENT' });
    expect(caseMock.update.mock.calls[0][0].data.appointmentDateSetAt).toBeInstanceOf(Date);
  });

  it('leaves the stamp alone on a plain reschedule', async () => {
    mockUpdateFlow(existingCase({
      appointmentDate: new Date('2026-10-20'),
      appointmentDateSetAt: new Date('2026-10-01T09:00:00Z'),
      appointmentPaidBy: 'AGENCY',
    }));
    await updateCase('case-1', { appointmentDate: '2026-11-15' });
    expect(caseMock.update.mock.calls[0][0].data).not.toHaveProperty('appointmentDateSetAt');
  });

  it('refuses to strip the date off a case already in File Processing', async () => {
    mockUpdateFlow(existingCase({ stage: 'FILE_PROCESSING', appointmentDate: new Date('2026-10-20') }));
    await expect(updateCase('case-1', { appointmentDate: null })).rejects.toThrow('APPOINTMENT_DATE_LOCKED');
    expect(caseMock.update).not.toHaveBeenCalled();
  });
});

// 1 Oct 2026 #4 — a Super Admin can send a File Processing case back to Appointments to
// re-book it, rather than opening a second case for the same trip.
describe('moving a case back to Appointments', () => {
  const clientMock = prisma.client as unknown as Record<string, jest.Mock>;
  beforeEach(() => jest.clearAllMocks());

  it('is the one backwards transition the workflow allows', () => {
    expect(() => assertTransitionAllowed('FILE_PROCESSING', 'APPOINTMENT', { ...baseCase, onHold: true } as any)).not.toThrow();
    expect(() => assertTransitionAllowed('INVOICED', 'APPOINTMENT', baseCase as any)).toThrow('STAGE_SKIP');
    expect(() => assertTransitionAllowed('COMPLETED', 'APPOINTMENT', baseCase as any)).toThrow('STAGE_TERMINAL');
  });

  it('keeps the record, and leaves a signed note in the HR Comments log', async () => {
    mockUpdateFlow(existingCase({ stage: 'FILE_PROCESSING', appointmentDate: new Date('2026-10-20') }));
    clientMock.findUnique.mockResolvedValue({ hrComments: '[Client Intake — 01/10/2026] first note' });
    await updateCase('case-1', { stage: 'APPOINTMENT', revertReason: 'Rebooking for November' }, { actorEmail: 'admin@manzil.com' });

    const data = caseMock.update.mock.calls[0][0].data;
    expect(data.stage).toBe('APPOINTMENT');
    expect(data).not.toHaveProperty('revertReason');
    const hr = clientMock.update.mock.calls[0][0].data.hrComments as string;
    expect(hr.startsWith('[Client Intake — 01/10/2026] first note\n')).toBe(true);
    expect(hr).toContain('moved back from File Processing to Appointments by admin@manzil.com — Rebooking for November');
  });

  it('writes no HR note for an ordinary forward move', async () => {
    mockUpdateFlow(existingCase({
      stage: 'APPOINTMENT', appointmentDate: new Date('2026-10-20'), appointmentPaidBy: 'CLIENT',
      client: { groupId: null, serviceType: 'FULL_SERVICE', ...completeClient },
    }));
    await updateCase('case-1', { stage: 'FILE_PROCESSING' });
    expect(clientMock.update).not.toHaveBeenCalled();
  });
});

// 1 Oct 2026 #5 — who paid for the appointment is recorded by the Appointment team with the
// date, and is read-only from File Processing on (Super Admin excepted).
describe('appointment payer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks the hand-over to File Processing until it is recorded', () => {
    expect(() => assertTransitionAllowed('APPOINTMENT', 'FILE_PROCESSING', { ...baseCase, appointmentPaidBy: null }))
      .toThrow('APPOINTMENT_PAYER_REQUIRED');
    // Appointment-only cases have no checklist downstream, so they are not held up.
    expect(() => assertTransitionAllowed('APPOINTMENT', 'COMPLETED', {
      ...baseCase, appointmentPaidBy: null, client: { ...completeClient, serviceType: 'APPOINTMENT_ONLY' },
    })).not.toThrow();
  });

  it('is asked for when a date is allotted', async () => {
    mockUpdateFlow(existingCase());
    await expect(updateCase('case-1', { appointmentDate: '2026-11-15' })).rejects.toThrow('APPOINTMENT_PAYER_REQUIRED');
  });

  it('does not nag when an older case is re-saved with its date unchanged', async () => {
    mockUpdateFlow(existingCase({ appointmentDate: new Date('2026-11-15') }));
    await expect(updateCase('case-1', { appointmentDate: '2026-11-15', fraNo: 'X1' })).resolves.toBeDefined();
  });

  it('zeroes the agency appointment cost when the client paid', async () => {
    mockUpdateFlow(existingCase());
    await updateCase('case-1', { appointmentDate: '2026-11-15', appointmentPaidBy: 'CLIENT' });
    expect(Number(caseMock.update.mock.calls[0][0].data.docAppointmentCost)).toBe(0);
  });

  it('is locked in File Processing for everyone but a Super Admin', async () => {
    mockUpdateFlow(existingCase({ stage: 'FILE_PROCESSING', appointmentPaidBy: 'CLIENT' }));
    await expect(updateCase('case-1', { appointmentPaidBy: 'AGENCY' }, { actorRoles: ['FILE_TEAM'] }))
      .rejects.toThrow('APPOINTMENT_PAYER_LOCKED');
    await expect(updateCase('case-1', { appointmentPaidBy: 'AGENCY' }, { actorRoles: ['SUPER_ADMIN'] }))
      .resolves.toBeDefined();
    // Re-sending the same value (the File Processing Save always does) is not a change.
    await expect(updateCase('case-1', { appointmentPaidBy: 'CLIENT' }, { actorRoles: ['FILE_TEAM'] }))
      .resolves.toBeDefined();
  });

  it('can be filled in once on an older case that never recorded it', async () => {
    mockUpdateFlow(existingCase({ stage: 'FILE_PROCESSING', appointmentPaidBy: null }));
    await expect(updateCase('case-1', { appointmentPaidBy: 'AGENCY' }, { actorRoles: ['FILE_TEAM'] })).resolves.toBeDefined();
  });
});

// 1 Oct 2026 #7 — the monthly report counts each status by WHEN it happened.
describe('monthly-report timestamps', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stamps a cancellation, a pause and an appointment-status change once each', async () => {
    mockUpdateFlow(existingCase({ appointmentStatus: 'REGISTERED' }));
    await updateCase('case-1', { stage: 'CANCELLED', onHold: true, appointmentStatus: 'MISSED' });
    const data = caseMock.update.mock.calls[0][0].data;
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(data.onHoldAt).toBeInstanceOf(Date);
    expect(data.appointmentStatusChangedAt).toBeInstanceOf(Date);
  });

  it('does not restamp when the same values are re-saved', async () => {
    mockUpdateFlow(existingCase({ onHold: true, appointmentStatus: 'DROPPED' }));
    await updateCase('case-1', { onHold: true, appointmentStatus: 'DROPPED' });
    const data = caseMock.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('onHoldAt');
    expect(data).not.toHaveProperty('appointmentStatusChangedAt');
  });
});

// 1 Oct 2026 #9 — a waiver is one of three kinds: Waived, Family or Friend.
describe('advance waiver type', () => {
  beforeEach(() => jest.clearAllMocks());

  it('picking a type waives the advance', async () => {
    mockUpdateFlow(existingCase());
    await updateCase('case-1', { advanceWaiverType: 'FAMILY' });
    const data = caseMock.update.mock.calls[0][0].data;
    expect(data.advanceWaived).toBe(true);
    expect(data.advanceWaiverType).toBe('FAMILY');
  });

  it('a bare waiver from an older caller reads as a plain WAIVED', async () => {
    mockUpdateFlow(existingCase());
    await updateCase('case-1', { advanceWaived: true });
    expect(caseMock.update.mock.calls[0][0].data.advanceWaiverType).toBe('WAIVED');
  });

  it('lifting the waiver clears its type and reason', async () => {
    mockUpdateFlow(existingCase({ advanceWaived: true }));
    await updateCase('case-1', { advanceWaiverType: null });
    const data = caseMock.update.mock.calls[0][0].data;
    expect(data.advanceWaived).toBe(false);
    expect(data.advanceWaiverType).toBeNull();
    expect(data.advanceWaiverReason).toBeNull();
  });

  it('travels across a family with the waiver flag', async () => {
    mockUpdateFlow(existingCase({ client: { groupId: 'g1', serviceType: 'FULL_SERVICE' } }));
    await updateCase('case-1', { advanceWaiverType: 'FRIEND' });
    expect(caseMock.updateMany.mock.calls[0][0].data).toMatchObject({ advanceWaived: true, advanceWaiverType: 'FRIEND' });
  });

  it('a new case can open already waived, or explicitly unpaid despite an amount', async () => {
    (prisma.client.findUnique as jest.Mock).mockResolvedValue({ groupId: null });
    caseMock.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'n', ...data }));
    await createCase('client-1', { destination: 'France', advanceWaiverType: 'FRIEND' });
    expect(caseMock.create.mock.calls[0][0].data).toMatchObject({ advanceWaived: true, advanceWaiverType: 'FRIEND', advancePaid: false });
    await createCase('client-1', { destination: 'France', advance: 100, advancePaid: false });
    expect(caseMock.create.mock.calls[1][0].data.advancePaid).toBe(false);
    expect(caseMock.create.mock.calls[1][0].data.advanceWaived).toBeFalsy();
  });
});
