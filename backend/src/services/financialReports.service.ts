import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { FinancialReportsQuery } from '../validators/financialReports.validators';

const resolveDateRange = (f: FinancialReportsQuery) => {
  const to = f.dateTo ? new Date(f.dateTo) : new Date();
  const from = f.dateFrom ? new Date(f.dateFrom) : new Date(new Date().setMonth(to.getMonth() - 11, 1));
  return { from, to };
};

const n = (d: Prisma.Decimal) => d.toNumber();

const buildInvoiceWhere = (f: FinancialReportsQuery): Prisma.InvoiceWhereInput => {
  const { from, to } = resolveDateRange(f);
  const where: Prisma.InvoiceWhereInput = { issueDate: { gte: from, lte: to } };

  if (f.status)      where.status = f.status;
  if (f.createdById) where.createdById = f.createdById;
  if (f.outstandingOnly) where.outstanding = { gt: 0 };
  if (f.minAmount !== undefined || f.maxAmount !== undefined) {
    where.totalAmount = {
      ...(f.minAmount !== undefined ? { gte: f.minAmount } : {}),
      ...(f.maxAmount !== undefined ? { lte: f.maxAmount } : {}),
    };
  }
  if (f.search) {
    where.OR = [
      { invoiceRef: { contains: f.search, mode: 'insensitive' } },
      { case: { client: { firstName: { contains: f.search, mode: 'insensitive' } } } },
      { case: { client: { lastName:  { contains: f.search, mode: 'insensitive' } } } },
      { case: { client: { clientRef: { contains: f.search, mode: 'insensitive' } } } },
    ];
  }

  const caseFilter: Prisma.VisaCaseWhereInput = {};
  if (f.destination) caseFilter.destination = f.destination;
  if (f.city)         caseFilter.city = f.city;
  if (f.stage)        caseFilter.stage = f.stage;
  if (f.priority)     caseFilter.priority = f.priority;
  if (f.serviceType)  caseFilter.client = { serviceType: f.serviceType };
  // "Cases this user was appointed to or closed" — any of the three assignment roles a
  // case passes through (booking, appointment handling, file processing).
  if (f.assignedToId) {
    caseFilter.OR = [
      { bookedById: f.assignedToId },
      { appointmentAssignedToId: f.assignedToId },
      { fileAssignedToId: f.assignedToId },
    ];
  }
  if (Object.keys(caseFilter).length > 0) where.case = caseFilter;

  return where;
};

// Everything is aggregated in JS off a single query rather than N raw-SQL group-bys —
// destination/serviceType live on related tables (VisaCase/Client) so Prisma's groupBy
// can't reach them directly, and the invoice volumes here don't warrant the complexity
// of hand-rolled joined SQL per report angle.
export const getFinancialReports = async (filters: FinancialReportsQuery) => {
  const invoices = await prisma.invoice.findMany({
    where: buildInvoiceWhere(filters),
    select: {
      id: true, invoiceRef: true, issueDate: true, dueDate: true,
      charges: true, discount: true, advance: true, totalAmount: true, paidAmount: true, outstanding: true, status: true,
      createdById: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      case: {
        select: {
          destination: true,
          client: { select: { id: true, clientRef: true, firstName: true, lastName: true, serviceType: true } },
        },
      },
    },
    orderBy: { issueDate: 'desc' },
  });

  // 1. Summary totals + collection rate
  const summary = invoices.reduce(
    (acc, inv) => {
      acc.invoiceCount += 1;
      acc.charges += n(inv.charges);
      acc.discount += n(inv.discount);
      acc.advance += n(inv.advance);
      acc.totalAmount += n(inv.totalAmount);
      acc.paidAmount += n(inv.paidAmount);
      acc.outstanding += n(inv.outstanding);
      return acc;
    },
    { invoiceCount: 0, charges: 0, discount: 0, advance: 0, totalAmount: 0, paidAmount: 0, outstanding: 0 }
  );
  const collected = summary.advance + summary.paidAmount;
  const collectionRate = summary.totalAmount > 0 ? (collected / summary.totalAmount) * 100 : 0;

  // 2. Revenue trend — monthly invoiced / discounted / advanced / collected / outstanding
  const trendMap = new Map<string, {
    month: string; charges: number; discount: number; advance: number; paid: number; outstanding: number; count: number;
  }>();
  for (const inv of invoices) {
    const month = inv.issueDate.toISOString().slice(0, 7);
    const row = trendMap.get(month) ?? { month, charges: 0, discount: 0, advance: 0, paid: 0, outstanding: 0, count: 0 };
    row.charges += n(inv.totalAmount);
    row.discount += n(inv.discount);
    row.advance += n(inv.advance);
    row.paid += n(inv.paidAmount);
    row.outstanding += n(inv.outstanding);
    row.count += 1;
    trendMap.set(month, row);
  }
  const revenueTrend = [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // 3. Invoices by status
  const statusMap = new Map<string, { status: string; count: number; totalAmount: number; paidAmount: number; outstanding: number }>();
  for (const inv of invoices) {
    const row = statusMap.get(inv.status) ?? { status: inv.status, count: 0, totalAmount: 0, paidAmount: 0, outstanding: 0 };
    row.count += 1;
    row.totalAmount += n(inv.totalAmount);
    row.paidAmount += n(inv.paidAmount);
    row.outstanding += n(inv.outstanding);
    statusMap.set(inv.status, row);
  }
  const invoicesByStatus = [...statusMap.values()];

  // 4. Revenue by destination
  const destMap = new Map<string, { destination: string; count: number; totalAmount: number; paidAmount: number; outstanding: number }>();
  for (const inv of invoices) {
    const dest = inv.case?.destination ?? 'Unknown';
    const row = destMap.get(dest) ?? { destination: dest, count: 0, totalAmount: 0, paidAmount: 0, outstanding: 0 };
    row.count += 1;
    row.totalAmount += n(inv.totalAmount);
    row.paidAmount += n(inv.paidAmount);
    row.outstanding += n(inv.outstanding);
    destMap.set(dest, row);
  }
  const revenueByDestination = [...destMap.values()].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10);

  // 5. Revenue by service type (Full Service vs Appointment Only)
  const svcMap = new Map<string, { serviceType: string; count: number; totalAmount: number; paidAmount: number; outstanding: number }>();
  for (const inv of invoices) {
    const svc = inv.case?.client?.serviceType ?? 'Unknown';
    const row = svcMap.get(svc) ?? { serviceType: svc, count: 0, totalAmount: 0, paidAmount: 0, outstanding: 0 };
    row.count += 1;
    row.totalAmount += n(inv.totalAmount);
    row.paidAmount += n(inv.paidAmount);
    row.outstanding += n(inv.outstanding);
    svcMap.set(svc, row);
  }
  const revenueByServiceType = [...svcMap.values()];

  // 6. Revenue by staff (who created/issued the invoice)
  const staffMap = new Map<string, { userId: string; name: string; count: number; totalAmount: number; paidAmount: number }>();
  for (const inv of invoices) {
    const id = inv.createdById ?? 'unassigned';
    const name = inv.createdBy ? `${inv.createdBy.firstName} ${inv.createdBy.lastName}` : 'Unassigned';
    const row = staffMap.get(id) ?? { userId: id, name, count: 0, totalAmount: 0, paidAmount: 0 };
    row.count += 1;
    row.totalAmount += n(inv.totalAmount);
    row.paidAmount += n(inv.paidAmount);
    staffMap.set(id, row);
  }
  const revenueByStaff = [...staffMap.values()].sort((a, b) => b.totalAmount - a.totalAmount);

  // 7. Top clients by revenue
  const clientMap = new Map<string, { clientId: string; clientRef: string; name: string; count: number; totalAmount: number; outstanding: number }>();
  for (const inv of invoices) {
    const c = inv.case?.client;
    if (!c) continue;
    const row = clientMap.get(c.id) ?? { clientId: c.id, clientRef: c.clientRef, name: `${c.firstName} ${c.lastName ?? ''}`.trim(), count: 0, totalAmount: 0, outstanding: 0 };
    row.count += 1;
    row.totalAmount += n(inv.totalAmount);
    row.outstanding += n(inv.outstanding);
    clientMap.set(c.id, row);
  }
  const topClients = [...clientMap.values()].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 10);

  // 8. Aging of outstanding balances + 9. overdue invoice list
  const now = Date.now();
  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const overdueInvoices: Array<{
    id: string; invoiceRef: string; clientRef: string; clientName: string;
    dueDate: string | null; outstanding: number; daysOverdue: number;
  }> = [];
  for (const inv of invoices) {
    const outstanding = n(inv.outstanding);
    if (outstanding <= 0 || inv.status === 'PAID') continue;
    const reference = inv.dueDate ?? inv.issueDate;
    const days = Math.floor((now - reference.getTime()) / 86_400_000);
    if (days <= 0)       aging.current += outstanding;
    else if (days <= 30) aging.d1_30 += outstanding;
    else if (days <= 60) aging.d31_60 += outstanding;
    else if (days <= 90) aging.d61_90 += outstanding;
    else                 aging.d90plus += outstanding;

    if (days > 0) {
      overdueInvoices.push({
        id: inv.id,
        invoiceRef: inv.invoiceRef,
        clientRef: inv.case?.client?.clientRef ?? '—',
        clientName: inv.case?.client ? `${inv.case.client.firstName} ${inv.case.client.lastName ?? ''}`.trim() : '—',
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        outstanding,
        daysOverdue: days,
      });
    }
  }
  overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    summary: { ...summary, collectionRate },
    revenueTrend,
    invoicesByStatus,
    revenueByDestination,
    revenueByServiceType,
    revenueByStaff,
    topClients,
    agingBuckets: [
      { bucket: 'Current',    amount: aging.current },
      { bucket: '1-30 days',  amount: aging.d1_30 },
      { bucket: '31-60 days', amount: aging.d31_60 },
      { bucket: '61-90 days', amount: aging.d61_90 },
      { bucket: '90+ days',   amount: aging.d90plus },
    ],
    overdueInvoices: overdueInvoices.slice(0, 20),
  };
};
