import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AnalyticsQuery } from '../validators/dashboard.validators';

export const getDashboardStats = async () => {
  const [
    totalClients,
    appointmentCases,
    fileProcessingCases,
    invoicedCases,
    completedCases,
    totalInvoices,
    pendingAmount,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.visaCase.count({ where: { stage: 'APPOINTMENT' } }),
    prisma.visaCase.count({ where: { stage: 'FILE_PROCESSING' } }),
    prisma.visaCase.count({ where: { stage: 'INVOICED' } }),
    prisma.visaCase.count({ where: { stage: 'COMPLETED' } }),
    prisma.invoice.count(),
    prisma.invoice.aggregate({
      _sum: { outstanding: true },
      where: { status: { not: 'PAID' } },
    }),
  ]);

  const recentClients = await prisma.client.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, clientRef: true, firstName: true, lastName: true, createdAt: true,
      visaCases: {
        select: { destination: true, stage: true },
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  return {
    totalClients,
    appointmentCases,
    fileProcessingCases,
    invoicedCases,
    completedCases,
    totalInvoices,
    pendingAmount: pendingAmount._sum.outstanding?.toNumber() ?? 0,
    recentClients,
  };
};

const DOC_FIELDS = [
  'docAppointment', 'docTicket', 'docInsurance', 'docHotel', 'docEVisa', 'docSop', 'docVisaForm',
] as const;

const resolveDateRange = (f: AnalyticsQuery) => {
  const to = f.dateTo ? new Date(f.dateTo) : new Date();
  const from = f.dateFrom ? new Date(f.dateFrom) : new Date(new Date().setMonth(to.getMonth() - 11, 1));
  return { from, to };
};

const caseAssignmentOr = (assignedToId: string): Prisma.VisaCaseWhereInput['OR'] => [
  { bookedById: assignedToId },
  { appointmentAssignedToId: assignedToId },
  { fileAssignedToId: assignedToId },
];

const buildCaseWhere = (f: AnalyticsQuery): Prisma.VisaCaseWhereInput => {
  const { from, to } = resolveDateRange(f);
  return {
    createdAt: { gte: from, lte: to },
    ...(f.destination ? { destination: f.destination } : {}),
    ...(f.assignedToId ? { OR: caseAssignmentOr(f.assignedToId) } : {}),
  };
};

const buildInvoiceWhere = (f: AnalyticsQuery): Prisma.InvoiceWhereInput => {
  const { from, to } = resolveDateRange(f);
  const caseFilter = f.destination || f.assignedToId
    ? {
        case: {
          ...(f.destination ? { destination: f.destination } : {}),
          ...(f.assignedToId ? { OR: caseAssignmentOr(f.assignedToId) } : {}),
        },
      }
    : {};
  return { issueDate: { gte: from, lte: to }, ...caseFilter };
};

const buildClientWhere = (f: AnalyticsQuery): Prisma.ClientWhereInput => {
  const { from, to } = resolveDateRange(f);
  const caseFilter = f.destination || f.assignedToId
    ? {
        visaCases: {
          some: {
            ...(f.destination ? { destination: f.destination } : {}),
            ...(f.assignedToId ? { OR: caseAssignmentOr(f.assignedToId) } : {}),
          },
        },
      }
    : {};
  return { createdAt: { gte: from, lte: to }, ...caseFilter };
};

const buildCaseTrendSql = (f: AnalyticsQuery) => {
  const { from, to } = resolveDateRange(f);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"createdAt" >= ${from}`,
    Prisma.sql`"createdAt" <= ${to}`,
  ];
  if (f.destination) conditions.push(Prisma.sql`"destination" = ${f.destination}`);
  if (f.assignedToId) {
    conditions.push(Prisma.sql`("bookedById" = ${f.assignedToId} OR "appointmentAssignedToId" = ${f.assignedToId} OR "fileAssignedToId" = ${f.assignedToId})`);
  }
  return Prisma.join(conditions, ' AND ');
};

const toCount = (rows: Array<{ month: Date; count: bigint }>) =>
  rows.map(r => ({ month: r.month.toISOString().slice(0, 7), count: Number(r.count) }));

const namesById = async (ids: string[]) => {
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  return new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));
};

export const getAnalytics = async (filters: AnalyticsQuery) => {
  const caseWhere = buildCaseWhere(filters);
  const invoiceWhere = buildInvoiceWhere(filters);
  const clientWhere = buildClientWhere(filters);

  const [
    casesByStage,
    casesByPriority,
    casesByDestinationRaw,
    appointmentFunnel,
    workloadRaw,
    docCompletionRaw,
    caseTrendRaw,
    invoicesByStatus,
    revenueTrendRaw,
    clientsByNationalityRaw,
    clientsByGender,
    clientsBySourceRaw,
    newClientsTrendRaw,
  ] = await Promise.all([
    prisma.visaCase.groupBy({ by: ['stage'], where: caseWhere, _count: { _all: true } }),
    prisma.visaCase.groupBy({ by: ['priority'], where: caseWhere, _count: { _all: true } }),
    prisma.visaCase.groupBy({
      by: ['destination'], where: caseWhere, _count: { _all: true },
      orderBy: { _count: { destination: 'desc' } }, take: 10,
    }),
    prisma.visaCase.groupBy({ by: ['appointmentStatus'], where: caseWhere, _count: { _all: true } }),
    prisma.visaCase.groupBy({
      by: ['appointmentAssignedToId'], where: { ...caseWhere, appointmentAssignedToId: { not: null } },
      _count: { _all: true }, orderBy: { _count: { appointmentAssignedToId: 'desc' } }, take: 10,
    }),
    Promise.all(
      DOC_FIELDS.map(field =>
        prisma.visaCase.groupBy({ by: [field], where: caseWhere, _count: { _all: true } })
          .then(rows => ({ field, rows }))
      )
    ),
    prisma.$queryRaw<Array<{ month: Date; count: bigint }>>(Prisma.sql`
      SELECT date_trunc('month', "createdAt") as month, COUNT(*)::bigint as count
      FROM visa_cases WHERE ${buildCaseTrendSql(filters)}
      GROUP BY month ORDER BY month ASC
    `),
    prisma.invoice.groupBy({
      by: ['status'], where: invoiceWhere,
      _count: { _all: true }, _sum: { totalAmount: true, paidAmount: true, outstanding: true },
    }),
    prisma.$queryRaw<Array<{ month: Date; charges: number; paid: number; outstanding: number }>>(Prisma.sql`
      SELECT date_trunc('month', "issueDate") as month,
        COALESCE(SUM("totalAmount"), 0)::float as charges,
        COALESCE(SUM("paidAmount"), 0)::float as paid,
        COALESCE(SUM("outstanding"), 0)::float as outstanding
      FROM invoices WHERE "issueDate" >= ${resolveDateRange(filters).from} AND "issueDate" <= ${resolveDateRange(filters).to}
      GROUP BY month ORDER BY month ASC
    `),
    prisma.client.groupBy({
      by: ['nationality'], where: clientWhere, _count: { _all: true },
      orderBy: { _count: { nationality: 'desc' } }, take: 10,
    }),
    prisma.client.groupBy({ by: ['gender'], where: clientWhere, _count: { _all: true } }),
    prisma.client.groupBy({
      by: ['source'], where: clientWhere, _count: { _all: true },
      orderBy: { _count: { source: 'desc' } }, take: 10,
    }),
    prisma.$queryRaw<Array<{ month: Date; count: bigint }>>(Prisma.sql`
      SELECT date_trunc('month', "createdAt") as month, COUNT(*)::bigint as count
      FROM clients WHERE "createdAt" >= ${resolveDateRange(filters).from} AND "createdAt" <= ${resolveDateRange(filters).to}
      GROUP BY month ORDER BY month ASC
    `),
  ]);

  const workloadIds = workloadRaw.map(w => w.appointmentAssignedToId).filter((id): id is string => !!id);
  const nameMap = await namesById(workloadIds);

  return {
    pipeline: {
      casesByStage: casesByStage.map(r => ({ stage: r.stage, count: r._count._all })),
      casesByPriority: casesByPriority.map(r => ({ priority: r.priority, count: r._count._all })),
      casesByDestination: casesByDestinationRaw.map(r => ({ destination: r.destination, count: r._count._all })),
      appointmentFunnel: appointmentFunnel.map(r => ({ status: r.appointmentStatus ?? 'NONE', count: r._count._all })),
      workload: workloadRaw.map(r => ({
        userId: r.appointmentAssignedToId as string,
        name: nameMap.get(r.appointmentAssignedToId as string) ?? 'Unknown',
        count: r._count._all,
      })),
      documentCompletion: docCompletionRaw.map(({ field, rows }) => ({
        field,
        statuses: rows.map(r => ({ status: (r as Record<string, unknown>)[field], count: r._count._all })),
      })),
      caseTrend: toCount(caseTrendRaw),
    },
    financials: {
      invoicesByStatus: invoicesByStatus.map(r => ({
        status: r.status,
        count: r._count._all,
        totalAmount: r._sum.totalAmount?.toNumber() ?? 0,
        paidAmount: r._sum.paidAmount?.toNumber() ?? 0,
        outstanding: r._sum.outstanding?.toNumber() ?? 0,
      })),
      revenueTrend: revenueTrendRaw.map(r => ({
        month: r.month.toISOString().slice(0, 7),
        charges: r.charges, paid: r.paid, outstanding: r.outstanding,
      })),
    },
    demographics: {
      clientsByNationality: clientsByNationalityRaw.map(r => ({ nationality: r.nationality, count: r._count._all })),
      clientsByGender: clientsByGender.map(r => ({ gender: r.gender, count: r._count._all })),
      clientsBySource: clientsBySourceRaw.map(r => ({ source: r.source ?? 'Unknown', count: r._count._all })),
      newClientsTrend: toCount(newClientsTrendRaw),
    },
  };
};
