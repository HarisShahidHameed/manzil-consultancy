import { prisma } from '../config/database';

export const getDashboardStats = async () => {
  const [
    totalClients,
    intakeCases,
    appointmentCases,
    fileProcessingCases,
    invoicedCases,
    completedCases,
    totalInvoices,
    pendingAmount,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.visaCase.count({ where: { stage: 'INTAKE' } }),
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
    intakeCases,
    appointmentCases,
    fileProcessingCases,
    invoicedCases,
    completedCases,
    totalInvoices,
    pendingAmount: pendingAmount._sum.outstanding?.toNumber() ?? 0,
    recentClients,
  };
};
