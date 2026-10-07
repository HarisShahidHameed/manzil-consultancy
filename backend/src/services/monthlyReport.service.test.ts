jest.mock('../config/database', () => ({
  prisma: { visaCase: { findMany: jest.fn(), count: jest.fn() } },
}));

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { getMonthlyReport, monthRange } from './monthlyReport.service';

const caseMock = prisma.visaCase as unknown as Record<string, jest.Mock>;
const D = (v: number | null) => (v == null ? null : new Prisma.Decimal(v));
const noDocs = {
  docAppointmentCost: null, docAppointmentClientPaid: null, docTicketCost: null, docTicketClientPaid: null,
  docInsuranceCost: null, docInsuranceClientPaid: null, docHotelCost: null, docHotelClientPaid: null,
  docSelfEmploymentCost: null, docSelfEmploymentClientPaid: null,
};
const staff = (id: string, firstName: string) => ({ id, firstName, lastName: 'X' });

describe('monthRange', () => {
  it('covers whole calendar months, both ends inclusive, as a half-open window', () => {
    const { from, to } = monthRange('2026-09', '2026-10');
    expect(from).toEqual(new Date(2026, 8, 1));
    expect(to).toEqual(new Date(2026, 10, 1));
  });

  it('defaults to the current month', () => {
    const { from, to } = monthRange(undefined, undefined, new Date(2026, 9, 7, 15));
    expect(from).toEqual(new Date(2026, 9, 1));
    expect(to).toEqual(new Date(2026, 10, 1));
  });
});

describe('getMonthlyReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    caseMock.count.mockResolvedValue(0);
  });

  it('counts revenue from service charges only, with pass-through costs kept beside it', async () => {
    caseMock.findMany.mockResolvedValue([
      {
        ...noDocs, destination: 'France', charges: D(300), discount: D(50),
        docTicketCost: D(420), docHotelCost: D(180), docAppointmentCost: D(35),
        client: { serviceType: 'FULL_SERVICE' },
        fileAssigned: staff('u1', 'Sara'), appointmentAssigned: staff('u2', 'Ali'), bookedBy: null,
      },
      {
        ...noDocs, destination: 'France', charges: D(100), discount: null,
        client: { serviceType: 'APPOINTMENT_ONLY' },
        fileAssigned: null, appointmentAssigned: staff('u2', 'Ali'), bookedBy: null,
      },
    ]);

    const r = await getMonthlyReport({ fromMonth: '2026-09' });

    expect(r.revenue).toEqual({
      serviceCharges: 400, discounts: 50, netServiceRevenue: 350,
      passThroughCosts: 635, grossBilled: 985,
    });
    expect(r.completed.total).toBe(2);
    expect(r.statusCounts.completedFiles).toBe(1); // the appointment-only one is not a "file"
    expect(r.completed.byDestination).toEqual([{ destination: 'France', count: 2 }]);
    // Full service → file handler; appointment-only → appointment handler.
    expect(r.completed.byStaff).toEqual([
      { userId: 'u1', name: 'Sara X', count: 1 },
      { userId: 'u2', name: 'Ali X', count: 1 },
    ]);
  });

  it('keeps system duplicate clean-ups out of the cancelled count', async () => {
    caseMock.findMany.mockResolvedValue([]);
    await getMonthlyReport({ fromMonth: '2026-09' });
    const cancelledWhere = caseMock.count.mock.calls
      .map(c => c[0].where.AND[1])
      .find(w => w.stage === 'CANCELLED');
    expect(cancelledWhere.NOT).toEqual({ onHoldReason: 'Auto-cancelled: duplicate case for this client' });
  });

  it('scopes every figure to one member of staff when asked', async () => {
    caseMock.findMany.mockResolvedValue([]);
    await getMonthlyReport({ fromMonth: '2026-09', assignedToId: 'u9' });
    const scope = caseMock.findMany.mock.calls[0][0].where.AND[0];
    expect(scope.OR).toEqual([{ bookedById: 'u9' }, { appointmentAssignedToId: 'u9' }, { fileAssignedToId: 'u9' }]);
  });
});
