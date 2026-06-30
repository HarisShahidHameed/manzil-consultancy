import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';

const CASE_SELECT = {
  id: true, clientId: true, destination: true, city: true, visaType: true, ukVisaExpiry: true,
  stage: true, priority: true,
  advance: true, charges: true, discount: true,
  advancePaid: true, advancePaidDate: true, onHold: true, onHoldReason: true,
  appointmentStatus: true,
  appointmentDate: true, bookedById: true, appointmentAssignedToId: true, fileAssignedToId: true,
  fraNo: true, tlsAccount: true, appointmentNotes: true,
  travelDate: true, hotelDate: true, salamComments: true, hrComments: true,
  docAppointment: true, docTicket: true, docInsurance: true, docHotel: true,
  docEVisa: true, docSop: true, docVisaForm: true,
  docAppointmentCost: true, docTicketCost: true, docInsuranceCost: true, docHotelCost: true,
  docEVisaCost: true, docSopCost: true, docVisaFormCost: true,
  paymentReceived: true,
  createdAt: true, updatedAt: true,
  client: {
    select: {
      id: true, clientRef: true, firstName: true, lastName: true,
      phone: true, email: true, nationality: true, passportNumber: true,
      residentialAddress: true, maritalStatus: true, previousSchengenVisa: true,
      visaAndTravelHistory: true, registeredEmail: true,
    },
  },
  bookedBy:           { select: { id: true, firstName: true, lastName: true } },
  appointmentAssigned:{ select: { id: true, firstName: true, lastName: true } },
  fileAssigned:       { select: { id: true, firstName: true, lastName: true } },
  invoices: {
    select: { id: true, invoiceRef: true, totalAmount: true, outstanding: true, status: true },
  },
} satisfies Prisma.VisaCaseSelect;

export type CaseStageName = 'INTAKE' | 'APPOINTMENT' | 'FILE_PROCESSING' | 'INVOICED' | 'COMPLETED' | 'CANCELLED';

export const STAGE_ORDER: CaseStageName[] = ['INTAKE', 'APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED'];

// Permission required to perform a given stage transition (team-scoped separation of duties)
export const TRANSITION_PERMISSIONS: Record<string, string[]> = {
  'INTAKE>APPOINTMENT':         ['appointments:write'],
  'APPOINTMENT>FILE_PROCESSING':['files:write'],
  'FILE_PROCESSING>INVOICED':   ['files:write', 'invoices:write'],
  'INVOICED>COMPLETED':         ['invoices:write'],
  '*>CANCELLED':                ['clients:write'],
};

export const requiredPermsForTransition = (from: string, to: string): string[] => {
  if (to === 'CANCELLED') return TRANSITION_PERMISSIONS['*>CANCELLED'];
  return TRANSITION_PERMISSIONS[`${from}>${to}`] ?? ['clients:write'];
};

/**
 * Enforces the business workflow: paused cases can't advance, no stage-skipping,
 * advance-payment gate before leaving Intake, and dues-cleared gate before Completed.
 * Throws typed errors.
 */
export const assertTransitionAllowed = (
  current: CaseStageName,
  next: CaseStageName,
  caseRecord: { advancePaid: boolean; onHold: boolean; invoices: { status: string }[] }
): void => {
  if (current === next) return;
  if (current === 'COMPLETED') throw new Error('STAGE_TERMINAL');
  if (current === 'CANCELLED') throw new Error('STAGE_TERMINAL');

  // Cancellation is allowed from any active stage
  if (next === 'CANCELLED') return;

  // A paused (on-hold) case cannot move forward until it is resumed
  if (caseRecord.onHold) throw new Error('ON_HOLD');

  const ci = STAGE_ORDER.indexOf(current);
  const ni = STAGE_ORDER.indexOf(next);
  if (ci === -1 || ni === -1) throw new Error('STAGE_INVALID');
  if (ni !== ci + 1) throw new Error('STAGE_SKIP');

  // Gate 1: advance payment must be marked paid before leaving Intake
  if (current === 'INTAKE' && next === 'APPOINTMENT') {
    if (!caseRecord.advancePaid) throw new Error('ADVANCE_REQUIRED');
  }

  // Gate 2: all invoices must be marked Paid before completing (payment handled manually)
  if (current === 'INVOICED' && next === 'COMPLETED') {
    const hasUnpaid = caseRecord.invoices.some(i => i.status !== 'PAID');
    if (hasUnpaid) throw new Error('DUES_PENDING');
  }
};

export const listCases = async (page = 1, limit = 20, stage?: string, search?: string) => {
  const skip = (page - 1) * limit;
  const where: Prisma.VisaCaseWhereInput = {};
  if (stage) where.stage = stage as any;
  if (search) {
    where.OR = [
      { destination:    { contains: search, mode: 'insensitive' } },
      { client: { firstName: { contains: search, mode: 'insensitive' } } },
      { client: { lastName:  { contains: search, mode: 'insensitive' } } },
      { client: { clientRef: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const [cases, total] = await Promise.all([
    prisma.visaCase.findMany({ where, skip, take: limit, select: CASE_SELECT, orderBy: { updatedAt: 'desc' } }),
    prisma.visaCase.count({ where }),
  ]);
  return { cases, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getCaseById = async (id: string) => {
  return prisma.visaCase.findUnique({ where: { id }, select: CASE_SELECT });
};

export const createCase = async (
  clientId: string,
  data: {
    destination: string; city?: string; visaType?: string; ukVisaExpiry?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    advance?: number; charges?: number; discount?: number;
  }
) => {
  return prisma.visaCase.create({
    data: {
      clientId,
      destination: data.destination,
      city:        data.city,
      visaType:    data.visaType,
      ukVisaExpiry: data.ukVisaExpiry ? new Date(data.ukVisaExpiry) : undefined,
      priority: data.priority ?? 'MEDIUM',
      advance:  data.advance  !== undefined ? new Prisma.Decimal(data.advance)  : undefined,
      charges:  data.charges  !== undefined ? new Prisma.Decimal(data.charges)  : undefined,
      discount: data.discount !== undefined ? new Prisma.Decimal(data.discount) : undefined,
    },
    select: CASE_SELECT,
  });
};

export const updateCase = async (id: string, data: Record<string, any>) => {
  // If a stage change is requested, enforce the workflow rules first.
  if (data.stage) {
    const existing = await prisma.visaCase.findUnique({
      where: { id },
      select: {
        stage: true, advancePaid: true, onHold: true,
        invoices: { select: { status: true } },
      },
    });
    if (!existing) {
      const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e;
    }
    assertTransitionAllowed(existing.stage as CaseStageName, data.stage as CaseStageName, existing);
  }

  const d: any = { ...data };
  const dateFields = ['ukVisaExpiry', 'appointmentDate', 'travelDate', 'hotelDate', 'advancePaidDate'];
  for (const f of dateFields) {
    if (d[f] && d[f] !== '') d[f] = new Date(d[f]);
    else if (d[f] === '') d[f] = null;
  }
  // Auto-stamp the advance payment date when it is first marked paid
  if (d.advancePaid === true && !d.advancePaidDate) d.advancePaidDate = new Date();
  if (d.advancePaid === false) d.advancePaidDate = null;
  const decimalFields = [
    'advance', 'charges', 'discount', 'paymentReceived',
    'docAppointmentCost', 'docTicketCost', 'docInsuranceCost', 'docHotelCost',
    'docEVisaCost', 'docSopCost', 'docVisaFormCost',
  ];
  for (const f of decimalFields) {
    if (d[f] !== undefined && d[f] !== null && d[f] !== '') d[f] = new Prisma.Decimal(d[f]);
    else if (d[f] === '' || d[f] === null) d[f] = null;
  }
  return prisma.visaCase.update({ where: { id }, data: d, select: CASE_SELECT });
};

// Returns current stage so the controller can resolve the required permission for a transition.
export const getCaseStage = async (id: string): Promise<CaseStageName | null> => {
  const c = await prisma.visaCase.findUnique({ where: { id }, select: { stage: true } });
  return (c?.stage as CaseStageName) ?? null;
};

export const deleteCase = async (id: string) => {
  return prisma.visaCase.delete({ where: { id } });
};
