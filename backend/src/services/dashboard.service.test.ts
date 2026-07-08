jest.mock('../config/database', () => ({
  prisma: {
    visaCase: { groupBy: jest.fn() },
    invoice: { groupBy: jest.fn() },
    client: { groupBy: jest.fn() },
    user: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

import { prisma } from '../config/database';
import { getAnalytics } from './dashboard.service';
import type { AnalyticsQuery } from '../validators/dashboard.validators';

const decimal = (value: number) => ({ toNumber: () => value }) as unknown as { toNumber: () => number };

type VisaCaseGroupByArgs = { by: string[]; where?: Record<string, unknown> };

const defaultCaseGroupByImpl = (args: VisaCaseGroupByArgs) => {
  const field = args.by[0];
  switch (field) {
    case 'stage':
      return Promise.resolve([
        { stage: 'APPOINTMENT', _count: { _all: 3 } },
        { stage: 'COMPLETED', _count: { _all: 2 } },
      ]);
    case 'priority':
      return Promise.resolve([{ priority: 'MEDIUM', _count: { _all: 5 } }]);
    case 'destination':
      return Promise.resolve([{ destination: 'UK', _count: { _all: 4 } }]);
    case 'appointmentStatus':
      return Promise.resolve([
        { appointmentStatus: 'WAITING', _count: { _all: 1 } },
        { appointmentStatus: null, _count: { _all: 1 } },
      ]);
    case 'appointmentAssignedToId':
      return Promise.resolve([{ appointmentAssignedToId: 'user-1', _count: { _all: 2 } }]);
    case 'docAppointment':
      return Promise.resolve([{ docAppointment: 'PENDING', _count: { _all: 5 } }]);
    case 'docTicket':
      return Promise.resolve([{ docTicket: 'DONE', _count: { _all: 5 } }]);
    case 'docInsurance':
      return Promise.resolve([{ docInsurance: 'PENDING', _count: { _all: 5 } }]);
    case 'docHotel':
      return Promise.resolve([{ docHotel: 'PENDING', _count: { _all: 5 } }]);
    case 'docEVisa':
      return Promise.resolve([{ docEVisa: 'PENDING', _count: { _all: 5 } }]);
    case 'docSop':
      return Promise.resolve([{ docSop: 'PENDING', _count: { _all: 5 } }]);
    case 'docVisaForm':
      return Promise.resolve([{ docVisaForm: 'PENDING', _count: { _all: 5 } }]);
    default:
      return Promise.resolve([]);
  }
};

const setupDefaultMocks = () => {
  (prisma.visaCase.groupBy as jest.Mock).mockImplementation(defaultCaseGroupByImpl);
  (prisma.invoice.groupBy as jest.Mock).mockResolvedValue([
    {
      status: 'PAID',
      _count: { _all: 2 },
      _sum: { totalAmount: decimal(1000), paidAmount: decimal(1000), outstanding: decimal(0) },
    },
  ]);
  (prisma.client.groupBy as jest.Mock).mockImplementation((args: VisaCaseGroupByArgs) => {
    const field = args.by[0];
    if (field === 'nationality') return Promise.resolve([{ nationality: 'Pakistani', _count: { _all: 6 } }]);
    if (field === 'gender') return Promise.resolve([{ gender: 'MALE', _count: { _all: 4 } }]);
    if (field === 'source') return Promise.resolve([{ source: 'Referral', _count: { _all: 3 } }]);
    return Promise.resolve([]);
  });
  (prisma.user.findMany as jest.Mock).mockResolvedValue([
    { id: 'user-1', firstName: 'John', lastName: 'Doe' },
  ]);
  // Called in source order: caseTrend (visa_cases), revenueTrend (invoices), newClientsTrend (clients)
  (prisma.$queryRaw as jest.Mock)
    .mockResolvedValueOnce([{ month: new Date('2025-06-01T00:00:00Z'), count: BigInt(3) }])
    .mockResolvedValueOnce([{ month: new Date('2025-06-01T00:00:00Z'), charges: 1000, paid: 1000, outstanding: 0 }])
    .mockResolvedValueOnce([{ month: new Date('2025-06-01T00:00:00Z'), count: BigInt(2) }]);
};

describe('getAnalytics', () => {
  beforeEach(() => {
    setupDefaultMocks();
  });

  it('returns the full aggregated analytics shape', async () => {
    const result = await getAnalytics({});

    expect(result.pipeline.casesByStage).toEqual([
      { stage: 'APPOINTMENT', count: 3 },
      { stage: 'COMPLETED', count: 2 },
    ]);
    expect(result.pipeline.casesByPriority).toEqual([{ priority: 'MEDIUM', count: 5 }]);
    expect(result.pipeline.casesByDestination).toEqual([{ destination: 'UK', count: 4 }]);
    expect(result.pipeline.caseTrend).toEqual([{ month: '2025-06', count: 3 }]);

    expect(result.financials.invoicesByStatus).toEqual([
      { status: 'PAID', count: 2, totalAmount: 1000, paidAmount: 1000, outstanding: 0 },
    ]);
    expect(result.financials.revenueTrend).toEqual([
      { month: '2025-06', charges: 1000, paid: 1000, outstanding: 0 },
    ]);

    expect(result.demographics.clientsByNationality).toEqual([{ nationality: 'Pakistani', count: 6 }]);
    expect(result.demographics.clientsByGender).toEqual([{ gender: 'MALE', count: 4 }]);
    expect(result.demographics.clientsBySource).toEqual([{ source: 'Referral', count: 3 }]);
    expect(result.demographics.newClientsTrend).toEqual([{ month: '2025-06', count: 2 }]);
  });

  it('defaults a NONE bucket for null appointmentStatus groups', async () => {
    const result = await getAnalytics({});
    expect(result.pipeline.appointmentFunnel).toEqual([
      { status: 'WAITING', count: 1 },
      { status: 'NONE', count: 1 },
    ]);
  });

  it('resolves workload assignee names from the user lookup', async () => {
    const result = await getAnalytics({});
    expect(result.pipeline.workload).toEqual([{ userId: 'user-1', name: 'John Doe', count: 2 }]);
  });

  it('falls back to "Unknown" when the assigned user cannot be found', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
    const result = await getAnalytics({});
    expect(result.pipeline.workload).toEqual([{ userId: 'user-1', name: 'Unknown', count: 2 }]);
  });

  it('maps document completion status buckets per document field', async () => {
    const result = await getAnalytics({});
    expect(result.pipeline.documentCompletion).toEqual(
      expect.arrayContaining([
        { field: 'docAppointment', statuses: [{ status: 'PENDING', count: 5 }] },
        { field: 'docTicket', statuses: [{ status: 'DONE', count: 5 }] },
      ])
    );
    expect(result.pipeline.documentCompletion).toHaveLength(7);
  });

  it('defaults numeric sums to 0 when Prisma returns null aggregates', async () => {
    (prisma.invoice.groupBy as jest.Mock).mockResolvedValue([
      { status: 'DRAFT', _count: { _all: 1 }, _sum: { totalAmount: null, paidAmount: null, outstanding: null } },
    ]);
    const result = await getAnalytics({});
    expect(result.financials.invoicesByStatus).toEqual([
      { status: 'DRAFT', count: 1, totalAmount: 0, paidAmount: 0, outstanding: 0 },
    ]);
  });

  it('defaults a missing client source to "Unknown"', async () => {
    (prisma.client.groupBy as jest.Mock).mockImplementation((args: VisaCaseGroupByArgs) => {
      if (args.by[0] === 'source') return Promise.resolve([{ source: null, _count: { _all: 2 } }]);
      return Promise.resolve([]);
    });
    const result = await getAnalytics({});
    expect(result.demographics.clientsBySource).toEqual([{ source: 'Unknown', count: 2 }]);
  });

  it('defaults the date range to the trailing 12 months when no dates are given', async () => {
    const filters: AnalyticsQuery = {};
    await getAnalytics(filters);

    const stageCall = (prisma.visaCase.groupBy as jest.Mock).mock.calls.find(
      ([args]) => args.by[0] === 'stage'
    );
    const where = stageCall[0].where;
    const months =
      (where.createdAt.lte.getFullYear() - where.createdAt.gte.getFullYear()) * 12 +
      (where.createdAt.lte.getMonth() - where.createdAt.gte.getMonth());
    expect(months).toBe(11);
  });

  it('respects an explicit dateFrom/dateTo range', async () => {
    await getAnalytics({ dateFrom: '2024-01-01', dateTo: '2024-03-31' });

    const stageCall = (prisma.visaCase.groupBy as jest.Mock).mock.calls.find(
      ([args]) => args.by[0] === 'stage'
    );
    const where = stageCall[0].where;
    expect(where.createdAt.gte).toEqual(new Date('2024-01-01'));
    expect(where.createdAt.lte).toEqual(new Date('2024-03-31'));
  });

  it('applies the destination filter to the case where clause', async () => {
    await getAnalytics({ destination: 'UK' });
    const stageCall = (prisma.visaCase.groupBy as jest.Mock).mock.calls.find(
      ([args]) => args.by[0] === 'stage'
    );
    expect(stageCall[0].where.destination).toBe('UK');
  });

  it('applies the destination filter to the invoice where clause via the related case', async () => {
    await getAnalytics({ destination: 'UK' });
    const invoiceCall = (prisma.invoice.groupBy as jest.Mock).mock.calls[0];
    expect(invoiceCall[0].where.case.destination).toBe('UK');
  });

  it('applies the destination filter to the client where clause via visaCases.some', async () => {
    await getAnalytics({ destination: 'UK' });
    const clientCall = (prisma.client.groupBy as jest.Mock).mock.calls.find(
      ([args]) => args.by[0] === 'nationality'
    );
    expect(clientCall[0].where.visaCases.some.destination).toBe('UK');
  });

  it('applies assignedToId as an OR across booked/appointment/file assignment fields', async () => {
    await getAnalytics({ assignedToId: 'user-42' });
    const stageCall = (prisma.visaCase.groupBy as jest.Mock).mock.calls.find(
      ([args]) => args.by[0] === 'stage'
    );
    expect(stageCall[0].where.OR).toEqual([
      { bookedById: 'user-42' },
      { appointmentAssignedToId: 'user-42' },
      { fileAssignedToId: 'user-42' },
    ]);
  });

  it('does not filter by destination/assignedToId when not provided', async () => {
    await getAnalytics({});
    const stageCall = (prisma.visaCase.groupBy as jest.Mock).mock.calls.find(
      ([args]) => args.by[0] === 'stage'
    );
    expect(stageCall[0].where.destination).toBeUndefined();
    expect(stageCall[0].where.OR).toBeUndefined();
  });
});
