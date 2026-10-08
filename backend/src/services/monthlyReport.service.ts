import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { computeAgencyDocLineItems } from '../utils/invoiceItems';
import { AUTO_CANCEL_DUPLICATE_REASON } from './visaCase.service';

/**
 * Monthly business & operations report (1 Oct 2026 #7).
 *
 * Deliberately a separate report from getFinancialReports rather than a rewrite of it: that
 * one is invoice-based (cash billed / collected / outstanding) and stays exactly as it was.
 * This one answers the owner's monthly questions — how many clients did we complete, where
 * to, who handled them, how many cancelled / missed / dropped / paused, and what the agency
 * actually EARNED once pass-through costs are taken out.
 *
 * Every count keys off the timestamp of the event it describes (completedAt, cancelledAt,
 * ...), never off a case's current state, so a case completed in September stays counted in
 * September however it has moved since. Months are calendar months in server local time, the
 * same convention as the appointment metric cards.
 */

export interface MonthlyReportQuery {
  /** First month included, 'YYYY-MM'. Defaults to the current month. */
  fromMonth?: string;
  /** Last month included, 'YYYY-MM'. Defaults to fromMonth. */
  toMonth?: string;
  /** Restricts every figure to cases this user booked / handled (non-full-access callers). */
  assignedToId?: string;
}

const parseMonth = (m: string): { y: number; mo: number } => {
  const [y, mo] = m.split('-').map(Number);
  return { y, mo: mo - 1 };
};

/** Half-open [from, to) covering every day of fromMonth through toMonth inclusive. */
export const monthRange = (fromMonth?: string, toMonth?: string, now = new Date()) => {
  const start = fromMonth ? parseMonth(fromMonth) : { y: now.getFullYear(), mo: now.getMonth() };
  const end = toMonth ? parseMonth(toMonth) : start;
  const from = new Date(start.y, start.mo, 1);
  const to = new Date(end.y, end.mo + 1, 1);
  if (to <= from) throw new Error('MONTH_RANGE_INVALID');
  return { from, to };
};

const n = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

export const getMonthlyReport = async (q: MonthlyReportQuery) => {
  const { from, to } = monthRange(q.fromMonth, q.toMonth);
  const inRange = { gte: from, lt: to };
  const scope: Prisma.VisaCaseWhereInput = q.assignedToId
    ? { OR: [{ bookedById: q.assignedToId }, { appointmentAssignedToId: q.assignedToId }, { fileAssignedToId: q.assignedToId }] }
    : {};
  const where = (w: Prisma.VisaCaseWhereInput): Prisma.VisaCaseWhereInput => ({ AND: [scope, w] });

  const [completed, cancelled, missed, dropped, paused, appointmentOnly] = await Promise.all([
    prisma.visaCase.findMany({
      where: where({ stage: 'COMPLETED', completedAt: inRange }),
      select: {
        destination: true, charges: true, discount: true,
        docAppointmentCost: true, docAppointmentClientPaid: true,
        docTicketCost: true, docTicketClientPaid: true,
        docInsuranceCost: true, docInsuranceClientPaid: true,
        docHotelCost: true, docHotelClientPaid: true,
        docSelfEmploymentCost: true, docSelfEmploymentClientPaid: true,
        client: { select: { serviceType: true } },
        fileAssigned:        { select: { id: true, firstName: true, lastName: true } },
        appointmentAssigned: { select: { id: true, firstName: true, lastName: true } },
        bookedBy:            { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    // A client cancelling — not the system tidying away a duplicate case when its twin moved on.
    prisma.visaCase.count({
      where: where({
        stage: 'CANCELLED', cancelledAt: inRange,
        NOT: { onHoldReason: AUTO_CANCEL_DUPLICATE_REASON },
      }),
    }),
    prisma.visaCase.count({ where: where({ appointmentStatus: 'MISSED', appointmentStatusChangedAt: inRange }) }),
    prisma.visaCase.count({ where: where({ appointmentStatus: 'DROPPED', appointmentStatusChangedAt: inRange }) }),
    prisma.visaCase.count({ where: where({ onHoldAt: inRange }) }),
    // Appointment-only work is counted when the case was opened, the same rule as the
    // "Appointment Only" metric card — booking the appointment is the whole job.
    prisma.visaCase.count({ where: where({ client: { serviceType: 'APPOINTMENT_ONLY' }, createdAt: inRange }) }),
  ]);

  // Completed clients, broken down by destination and by the member of staff who handled them:
  // the file handler for a full-service case, the appointment handler (or booker) otherwise.
  const byDestination = new Map<string, number>();
  const byStaff = new Map<string, { userId: string | null; name: string; count: number }>();
  let completedFiles = 0;
  let serviceCharges = 0, discounts = 0, passThroughCosts = 0;

  for (const c of completed) {
    const fullService = c.client?.serviceType !== 'APPOINTMENT_ONLY';
    if (fullService) completedFiles += 1;

    const dest = c.destination ?? 'Not finalised';
    byDestination.set(dest, (byDestination.get(dest) ?? 0) + 1);

    const handler = fullService ? c.fileAssigned ?? c.appointmentAssigned : c.appointmentAssigned ?? c.bookedBy;
    const key = handler?.id ?? 'unassigned';
    const row = byStaff.get(key) ?? { userId: handler?.id ?? null, name: handler ? `${handler.firstName} ${handler.lastName}` : 'Unassigned', count: 0 };
    row.count += 1;
    byStaff.set(key, row);

    // True revenue: the agency's own service charge, less discount. Flights, hotels,
    // insurance, accountant letters and appointment fees paid on the client's behalf are
    // pass-through — billed back at cost — so they are reported beside revenue, never in it.
    serviceCharges += n(c.charges);
    discounts += n(c.discount);
    passThroughCosts += computeAgencyDocLineItems(c).costTotal.toNumber();
  }

  const netServiceRevenue = serviceCharges - discounts;

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    completed: {
      total: completed.length,
      byDestination: [...byDestination.entries()].map(([destination, count]) => ({ destination, count }))
        .sort((a, b) => b.count - a.count),
      byStaff: [...byStaff.values()].sort((a, b) => b.count - a.count),
    },
    statusCounts: {
      completedFiles,
      appointmentOnly,
      cancelled,
      missedAppointment: missed,
      dropped,
      paused,
    },
    revenue: {
      serviceCharges: round2(serviceCharges),
      discounts: round2(discounts),
      netServiceRevenue: round2(netServiceRevenue),
      passThroughCosts: round2(passThroughCosts),
      grossBilled: round2(netServiceRevenue + passThroughCosts),
    },
  };
};
