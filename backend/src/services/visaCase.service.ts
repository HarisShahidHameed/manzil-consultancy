import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { getMissingRequiredFields, CaseRequiredField } from '../utils/caseRequiredInfo';

// A case is created with either a single decided `destination` or a shortlist of
// `destinationOptions` when it isn't decided yet. A single-entry shortlist has no real
// ambiguity, so it's collapsed straight to `destination` — `destinationOptions` only stays
// populated (for the File Processing "finalize" step) when there's genuinely more than one.
const resolveDestination = (data: { destination?: string; destinationOptions?: string[] }) => {
  const options = data.destinationOptions?.map(d => d.trim()).filter(Boolean) ?? [];
  if (options.length <= 1) {
    return { destination: data.destination ?? options[0], destinationOptions: [] as string[] };
  }
  return { destination: data.destination, destinationOptions: options };
};

// Same shortlist-then-finalize collapse as resolveDestination, for the appointment city.
const resolveCity = (data: { city?: string; cityOptions?: string[] }) => {
  const options = data.cityOptions?.map(c => c.trim()).filter(Boolean) ?? [];
  if (options.length <= 1) {
    return { city: data.city ?? options[0], cityOptions: [] as string[] };
  }
  return { city: data.city, cityOptions: options };
};

const CASE_SELECT = {
  id: true, clientId: true, destination: true, destinationOptions: true, city: true, cityOptions: true, visaType: true, ukVisaExpiry: true, eVisaType: true,
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
  docAppointmentClientPaid: true, docTicketClientPaid: true, docInsuranceClientPaid: true, docHotelClientPaid: true,
  paymentReceived: true,
  createdAt: true, updatedAt: true,
  client: {
    select: {
      id: true, clientRef: true, firstName: true, lastName: true, gender: true,
      phone: true, email: true, whatsapp: true, nationality: true, passportNumber: true,
      dob: true, passportIssue: true, passportExpiry: true, birthCity: true,
      addressStreet: true, addressCity: true, addressShire: true, addressPostalCode: true, addressCountry: true,
      maritalStatus: true, previousSchengenVisa: true,
      visaAndTravelHistory: true, registeredEmail: true, folderUrl: true,
    },
  },
  bookedBy:           { select: { id: true, firstName: true, lastName: true } },
  appointmentAssigned:{ select: { id: true, firstName: true, lastName: true } },
  fileAssigned:       { select: { id: true, firstName: true, lastName: true } },
  invoices: {
    select: { id: true, invoiceRef: true, totalAmount: true, outstanding: true, status: true },
  },
} satisfies Prisma.VisaCaseSelect;

export type CaseStageName = 'APPOINTMENT' | 'FILE_PROCESSING' | 'INVOICED' | 'COMPLETED' | 'CANCELLED';

export const STAGE_ORDER: CaseStageName[] = ['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED'];

// Permission required to perform a given stage transition (team-scoped separation of duties).
// There is no Intake stage: a case enters the appointment queue as soon as the client's
// information is filled in, and the appointment team hands it over to file processing.
export const TRANSITION_PERMISSIONS: Record<string, string[]> = {
  'APPOINTMENT>FILE_PROCESSING':['appointments:write'],
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
 * a booked-appointment + required-fields gate before File Processing, and a
 * dues-cleared gate before Completed. Throws typed errors. Advance payment is
 * not a hard gate — it's auto-derived from the advance amount (see
 * updateCase/createCase) and surfaced as a non-blocking "pending" warning in
 * the UI when unpaid.
 */
export const assertTransitionAllowed = (
  current: CaseStageName,
  next: CaseStageName,
  caseRecord: {
    advancePaid: boolean; onHold: boolean; invoices: { status: string }[];
    destination: string | null; destinationOptions?: string[];
    city?: string | null; cityOptions?: string[];
    appointmentDate: Date | null;
    client: {
      passportNumber: string | null; nationality: string | null; dob: Date | null;
      passportIssue: Date | null; passportExpiry: Date | null;
    };
  }
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

  // Gate 1: before the appointment team hands a case over to file processing,
  // the client's required info must be complete and the appointment booked.
  if (current === 'APPOINTMENT' && next === 'FILE_PROCESSING') {
    const missingFields = getMissingRequiredFields(caseRecord.client, { destination: caseRecord.destination, destinationOptions: caseRecord.destinationOptions });
    if (missingFields.length > 0) {
      const e = new Error('CLIENT_INFO_INCOMPLETE') as Error & { missingFields: CaseRequiredField[] };
      e.missingFields = missingFields;
      throw e;
    }
    if (!caseRecord.appointmentDate) throw new Error('APPOINTMENT_NOT_BOOKED');
  }

  // Gate 2: a shortlisted-but-undecided destination or city must be finalized to a
  // single value before file processing can move on to invoicing.
  if (current === 'FILE_PROCESSING' && next === 'INVOICED') {
    if ((caseRecord.destinationOptions?.length ?? 0) > 0 && !caseRecord.destination) {
      throw new Error('DESTINATION_NOT_FINALIZED');
    }
    if ((caseRecord.cityOptions?.length ?? 0) > 0 && !caseRecord.city) {
      throw new Error('CITY_NOT_FINALIZED');
    }
  }

  // Gate 3: all invoices must be marked Paid before completing (payment handled manually)
  if (current === 'INVOICED' && next === 'COMPLETED') {
    const hasUnpaid = caseRecord.invoices.some(i => i.status !== 'PAID');
    if (hasUnpaid) throw new Error('DUES_PENDING');
  }
};

// Flags Appointment-stage cases with what's left to fill in before they can move to file processing.
const decorateCase = <T extends { stage: string; destination: string | null; destinationOptions?: string[]; client: Parameters<typeof getMissingRequiredFields>[0] }>(
  c: T
): T & { missingRequiredFields?: CaseRequiredField[] } =>
  c.stage === 'APPOINTMENT'
    ? { ...c, missingRequiredFields: getMissingRequiredFields(c.client, { destination: c.destination, destinationOptions: c.destinationOptions }) }
    : c;

export const listCases = async (
  page = 1, limit = 20, stage?: string, search?: string, appointmentStatus?: string,
  destination?: string, city?: string, advancePaid?: boolean,
) => {
  const skip = (page - 1) * limit;
  // Each filter is ANDed together (Prisma's default for sibling where keys) so status,
  // destination, city, advance-paid and free-text search can all narrow the result set at once.
  const where: Prisma.VisaCaseWhereInput = {};
  if (stage) where.stage = stage as any;
  if (appointmentStatus) where.appointmentStatus = appointmentStatus as any;
  if (destination) where.destination = { contains: destination, mode: 'insensitive' };
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (advancePaid !== undefined) where.advancePaid = advancePaid;
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
  return { cases: cases.map(decorateCase), total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getCaseById = async (id: string) => {
  const c = await prisma.visaCase.findUnique({ where: { id }, select: CASE_SELECT });
  return c ? decorateCase(c) : null;
};

export const createCase = async (
  clientId: string,
  data: {
    destination?: string; destinationOptions?: string[];
    city?: string; cityOptions?: string[]; visaType?: string; ukVisaExpiry?: string; eVisaType?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    advance?: number; charges?: number; discount?: number;
  }
) => {
  const advancePaid = (data.advance ?? 0) > 0;
  const { destination, destinationOptions } = resolveDestination(data);
  const { city, cityOptions } = resolveCity(data);
  // New cases skip Intake entirely: they enter the appointment queue as Waiting.
  return prisma.visaCase.create({
    data: {
      clientId,
      appointmentStatus: 'WAITING',
      destination, destinationOptions,
      city, cityOptions,
      visaType:    data.visaType,
      ukVisaExpiry: data.ukVisaExpiry ? new Date(data.ukVisaExpiry) : undefined,
      eVisaType:   data.eVisaType,
      priority: data.priority ?? 'MEDIUM',
      advance:  data.advance  !== undefined ? new Prisma.Decimal(data.advance)  : undefined,
      charges:  data.charges  !== undefined ? new Prisma.Decimal(data.charges)  : undefined,
      discount: data.discount !== undefined ? new Prisma.Decimal(data.discount) : undefined,
      advancePaid,
      advancePaidDate: advancePaid ? new Date() : undefined,
    },
    select: CASE_SELECT,
  });
};

export const updateCase = async (id: string, data: Record<string, any>) => {
  // If a stage change or destination/city finalization is requested, enforce workflow rules first.
  if (data.stage || data.destination !== undefined || data.city !== undefined) {
    const existing = await prisma.visaCase.findUnique({
      where: { id },
      select: {
        stage: true, advancePaid: true, onHold: true,
        destination: true, destinationOptions: true, city: true, cityOptions: true,
        appointmentDate: true,
        invoices: { select: { status: true } },
        client: {
          select: {
            passportNumber: true, nationality: true, dob: true,
            passportIssue: true, passportExpiry: true,
          },
        },
      },
    });
    if (!existing) {
      const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e;
    }
    // Finalizing the destination/city must land on one of the shortlisted candidates.
    if (data.destination !== undefined && existing.destinationOptions.length > 0
        && !existing.destinationOptions.includes(data.destination)) {
      throw new Error('DESTINATION_NOT_SHORTLISTED');
    }
    if (data.city !== undefined && existing.cityOptions.length > 0
        && !existing.cityOptions.includes(data.city)) {
      throw new Error('CITY_NOT_SHORTLISTED');
    }
    if (data.stage) {
      assertTransitionAllowed(existing.stage as CaseStageName, data.stage as CaseStageName, existing);
    }
  }

  const d: any = { ...data };
  const dateFields = ['ukVisaExpiry', 'appointmentDate', 'travelDate', 'hotelDate', 'advancePaidDate'];
  for (const f of dateFields) {
    if (d[f] && d[f] !== '') d[f] = new Date(d[f]);
    else if (d[f] === '') d[f] = null;
  }
  // Whenever the advance amount itself is set (and paid status isn't explicitly
  // being set in the same call), derive advancePaid from it — a filled advance
  // is paid, so the manual toggle doesn't need to be revisited later.
  if (Object.prototype.hasOwnProperty.call(data, 'advance') && !Object.prototype.hasOwnProperty.call(data, 'advancePaid')) {
    const advanceNum = data.advance !== undefined && data.advance !== null && data.advance !== '' ? Number(data.advance) : 0;
    d.advancePaid = advanceNum > 0;
  }
  // Auto-stamp the advance payment date when it is first marked paid
  if (d.advancePaid === true && !d.advancePaidDate) d.advancePaidDate = new Date();
  if (d.advancePaid === false) d.advancePaidDate = null;
  const decimalFields = [
    'advance', 'charges', 'discount', 'paymentReceived',
    'docAppointmentCost', 'docTicketCost', 'docInsuranceCost', 'docHotelCost',
    'docEVisaCost', 'docSopCost', 'docVisaFormCost',
    'docAppointmentClientPaid', 'docTicketClientPaid', 'docInsuranceClientPaid', 'docHotelClientPaid',
  ];
  for (const f of decimalFields) {
    if (d[f] !== undefined && d[f] !== null && d[f] !== '') d[f] = new Prisma.Decimal(d[f]);
    else if (d[f] === '' || d[f] === null) d[f] = null;
  }
  const updated = await prisma.visaCase.update({ where: { id }, data: d, select: CASE_SELECT });

  // A client is only meant to be actively working one case at a time. Once a case
  // reaches File Processing, any other still-open case (Appointment stage) for the
  // same client is a duplicate application and gets auto-cancelled.
  if (d.stage === 'FILE_PROCESSING') {
    await prisma.visaCase.updateMany({
      where: { clientId: updated.clientId, id: { not: id }, stage: 'APPOINTMENT' },
      data: { stage: 'CANCELLED', onHoldReason: 'Auto-cancelled: duplicate case for this client' },
    });
  }

  return updated;
};

// Returns current stage so the controller can resolve the required permission for a transition.
export const getCaseStage = async (id: string): Promise<CaseStageName | null> => {
  const c = await prisma.visaCase.findUnique({ where: { id }, select: { stage: true } });
  return (c?.stage as CaseStageName) ?? null;
};

export const deleteCase = async (id: string) => {
  return prisma.visaCase.delete({ where: { id } });
};
