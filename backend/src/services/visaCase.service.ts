import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { getMissingRequiredFields, CaseRequiredField } from '../utils/caseRequiredInfo';
import { computeAgencyDocLineItems, InvoiceLineItem } from '../utils/invoiceItems';

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
  advancePaid: true, advancePaidDate: true, advanceWaived: true, advanceWaiverReason: true,
  onHold: true, onHoldReason: true,
  appointmentStatus: true,
  appointmentDate: true, bookedById: true, appointmentAssignedToId: true, fileAssignedToId: true,
  fraNo: true, tlsAccount: true, appointmentNotes: true, whatsappGroupCreated: true,
  travelDate: true, hotelDate: true, salamComments: true,
  docAppointment: true, docTicket: true, docInsurance: true, docHotel: true,
  docEVisa: true, docSop: true, docVisaForm: true, docSelfEmployment: true,
  docAppointmentCost: true, docTicketCost: true, docInsuranceCost: true, docHotelCost: true,
  docEVisaCost: true, docSopCost: true, docVisaFormCost: true, docSelfEmploymentCost: true,
  docAppointmentClientPaid: true, docTicketClientPaid: true, docInsuranceClientPaid: true, docHotelClientPaid: true,
  docSelfEmploymentClientPaid: true,
  paymentReceived: true,
  createdAt: true, updatedAt: true,
  client: {
    select: {
      id: true, clientRef: true, receivedDate: true, firstName: true, lastName: true, gender: true,
      phone: true, email: true, whatsapp: true, nationality: true, passportNumber: true,
      dob: true, passportIssue: true, passportExpiry: true, birthCity: true,
      addressStreet: true, addressCity: true, addressShire: true, addressPostalCode: true, addressCountry: true,
      maritalStatus: true, previousSchengenVisa: true,
      visaAndTravelHistory: true, registeredEmail: true, folderUrl: true,
      serviceType: true, hrComments: true,
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

/**
 * "Has this case's advance been dealt with?" — the only question anything judging a case
 * unpaid should ask. `advancePaid` means the money actually arrived; `advanceWaived` means
 * staff explicitly signed off that none is due (prior refusal, or a free service we chose
 * to give). Both settle the case, so a waived case never reads as "unpaid".
 */
export const isAdvanceSettled = (c: { advancePaid: boolean; advanceWaived: boolean }): boolean =>
  c.advancePaid || c.advanceWaived;


export const STAGE_ORDER: CaseStageName[] = ['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED'];

// APPOINTMENT_ONLY clients just want the appointment booked — their cases skip File
// Processing/Invoiced entirely and go straight from Appointment to Completed.
const APPOINTMENT_ONLY_STAGE_ORDER: CaseStageName[] = ['APPOINTMENT', 'COMPLETED'];

export const getStageOrder = (clientServiceType?: string): CaseStageName[] =>
  clientServiceType === 'APPOINTMENT_ONLY' ? APPOINTMENT_ONLY_STAGE_ORDER : STAGE_ORDER;

// Stages a case is still actively being worked in. Family-group propagation stops here on
// purpose: a COMPLETED or CANCELLED case is a closed book and must never be retro-flipped
// by something that happens to a sibling afterwards.
const ACTIVE_STAGES: CaseStageName[] = ['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED'];

/**
 * The family-booking rule, in one place.
 *
 * A family applies as a unit: one member pays the advance for everybody (or we waive it
 * for the family), and we only ever create ONE WhatsApp group for the whole family however
 * many members it has. So recording either of those on one member's case has to apply to
 * every other member of the same ClientGroup — otherwise the rest of the family sits there
 * flagged as unpaid / missing-group forever, for money that was already taken and a group
 * that already exists.
 *
 * Only the flags travel. The advance/charges/discount amounts stay on the paying member's
 * case, because the money was only handed over once and belongs to that case's books.
 *
 * Un-marking propagates identically, so staff can correct a mistake from any member rather
 * than having to remember which one they ticked first.
 *
 * `groupId` is null for a lone client — the common path — and then this costs nothing at
 * all beyond the single cheap lookup the caller already did to read it.
 */
const propagateGroupFlags = async (
  tx: Prisma.TransactionClient,
  sourceCaseId: string,
  groupId: string | null,
  flags: Prisma.VisaCaseUpdateManyMutationInput,
): Promise<void> => {
  if (!groupId || Object.keys(flags).length === 0) return;
  await tx.visaCase.updateMany({
    where: {
      id: { not: sourceCaseId },
      client: { groupId },
      stage: { in: ACTIVE_STAGES as any },
    },
    data: flags,
  });
};

// What the family has already settled between them, read off their active cases in one
// query: the advance (paid by whichever member handed the money over, or waived for all of
// them) and the one shared WhatsApp group. The flags are unioned — any single member
// carrying one means the family as a whole has it.
const readGroupSettlement = async (
  tx: Prisma.TransactionClient,
  groupId: string,
): Promise<{
  advancePaid: boolean; advancePaidDate: Date | null;
  advanceWaived: boolean; advanceWaiverReason: string | null;
  whatsappGroupCreated: boolean;
}> => {
  const siblings = await tx.visaCase.findMany({
    where: { client: { groupId }, stage: { in: ACTIVE_STAGES as any } },
    select: {
      advancePaid: true, advancePaidDate: true,
      advanceWaived: true, advanceWaiverReason: true,
      whatsappGroupCreated: true,
    },
  });
  const payer  = siblings.find(c => c.advancePaid);
  const waived = siblings.find(c => c.advanceWaived);
  return {
    advancePaid:          !!payer,
    advancePaidDate:      payer?.advancePaidDate ?? null,
    advanceWaived:        !!waived,
    advanceWaiverReason:  waived?.advanceWaiverReason ?? null,
    whatsappGroupCreated: siblings.some(c => c.whatsappGroupCreated),
  };
};

// Permission required to perform a given stage transition (team-scoped separation of duties).
// There is no Intake stage: a case enters the appointment queue as soon as the client's
// information is filled in, and the appointment team hands it over to file processing.
export const TRANSITION_PERMISSIONS: Record<string, string[]> = {
  'APPOINTMENT>FILE_PROCESSING':['appointments:write'],
  'APPOINTMENT>COMPLETED':      ['appointments:write'],
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
 * the UI when unpaid. Nothing here blocks on it, so a waived case (refusal /
 * free service, see isAdvanceSettled) moves through the workflow untouched.
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
      serviceType?: string;
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

  const stageOrder = getStageOrder(caseRecord.client.serviceType);
  const ci = stageOrder.indexOf(current);
  const ni = stageOrder.indexOf(next);
  if (ci === -1 || ni === -1) throw new Error('STAGE_INVALID');
  if (ni !== ci + 1) throw new Error('STAGE_SKIP');

  // Gate 1: before a case leaves the Appointment stage — whether it's handed over to
  // file processing, or (for an APPOINTMENT_ONLY client) completed directly — the
  // client's required info must be complete and the appointment booked.
  if (current === 'APPOINTMENT' && (next === 'FILE_PROCESSING' || next === 'COMPLETED')) {
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
  destination?: string, city?: string, advancePaid?: boolean, onHold?: boolean, serviceType?: string,
  fileAssignedToId?: string, hasAppointmentDate?: boolean,
) => {
  const skip = (page - 1) * limit;
  // Each filter is ANDed together (Prisma's default for sibling where keys) so status,
  // destination, city, advance-paid, on-hold, service-type and free-text search can all
  // narrow the result set at once.
  const where: Prisma.VisaCaseWhereInput = {};
  // "stage" also accepts a comma-separated list (e.g. the appointment→file-processing
  // conversion card wants FILE_PROCESSING,INVOICED,COMPLETED in one query) alongside the
  // normal single-stage filter every other listing uses.
  if (stage) where.stage = stage.includes(',') ? { in: stage.split(',') as any } : (stage as any);
  if (appointmentStatus) where.appointmentStatus = appointmentStatus as any;
  if (destination) where.destination = { contains: destination, mode: 'insensitive' };
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (advancePaid !== undefined) where.advancePaid = advancePaid;
  if (onHold !== undefined) where.onHold = onHold;
  if (serviceType) where.client = { serviceType: serviceType as any };
  if (fileAssignedToId) where.fileAssignedToId = fileAssignedToId;
  if (hasAppointmentDate !== undefined) where.appointmentDate = hasAppointmentDate ? { not: null } : null;
  if (search) {
    where.OR = [
      { destination:    { contains: search, mode: 'insensitive' } },
      { client: { firstName: { contains: search, mode: 'insensitive' } } },
      { client: { lastName:  { contains: search, mode: 'insensitive' } } },
      { client: { clientRef: { contains: search, mode: 'insensitive' } } },
    ];
  }
  // File Processing works appointments in the order they're due, soonest first —
  // every other listing (Appointments, Paused, Completed, ...) stays newest-received-first.
  const orderBy: Prisma.VisaCaseFindManyArgs['orderBy'] = stage === 'FILE_PROCESSING'
    ? { appointmentDate: { sort: 'asc', nulls: 'last' } }
    : { client: { receivedDate: 'desc' } };
  const [cases, total] = await Promise.all([
    prisma.visaCase.findMany({ where, skip, take: limit, select: CASE_SELECT, orderBy }),
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
  const paidNow = (data.advance ?? 0) > 0;
  const { destination, destinationOptions } = resolveDestination(data);
  const { city, cityOptions } = resolveCity(data);
  // New cases skip Intake entirely: they enter the appointment queue as Waiting.
  return prisma.$transaction(async (tx) => {
    // One cheap indexed lookup to find out whether this client belongs to a family group.
    // For a lone client groupId is null and nothing below runs — the common path pays for
    // this single read and no more.
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { groupId: true } });
    const groupId = client?.groupId ?? null;
    // A case opened for someone whose family already settled the advance (or already has
    // the shared WhatsApp group) starts out settled — see propagateGroupFlags.
    const family = groupId ? await readGroupSettlement(tx, groupId) : null;
    const advancePaid = paidNow || (family?.advancePaid ?? false);

    const created = await tx.visaCase.create({
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
        advancePaidDate: paidNow ? new Date() : (family?.advancePaidDate ?? undefined),
        advanceWaived:       family?.advanceWaived ?? false,
        advanceWaiverReason: family?.advanceWaived ? family.advanceWaiverReason : undefined,
        whatsappGroupCreated: family?.whatsappGroupCreated ?? false,
      },
      select: CASE_SELECT,
    });

    // The other direction: this member handing over the advance settles it for the family.
    if (paidNow && family && !family.advancePaid) {
      await propagateGroupFlags(tx, created.id, groupId, {
        advancePaid: true,
        advancePaidDate: created.advancePaidDate,
      });
    }
    return created;
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
            passportIssue: true, passportExpiry: true, serviceType: true,
          },
        },
      },
    });
    if (!existing) {
      const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e;
    }
    // Finalizing the destination/city from an existing shortlist must land on one of the
    // shortlisted candidates — but only when this call is doing exactly that (sending just
    // `destination`, like the File Processing "finalize" dropdown does). When the caller is
    // also sending a new `destinationOptions` in the same request (e.g. the client edit form
    // replacing the whole shortlist), it's declaring a fresh shortlist+destination pair
    // together, not finalizing from the old one — so the old list shouldn't gate it.
    if (data.destination !== undefined && data.destinationOptions === undefined
        && existing.destinationOptions.length > 0
        && !existing.destinationOptions.includes(data.destination)) {
      throw new Error('DESTINATION_NOT_SHORTLISTED');
    }
    if (data.city !== undefined && data.cityOptions === undefined
        && existing.cityOptions.length > 0
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
  // The waiver as it will stand after this write — either what the caller is setting now,
  // or what the case already carried.
  const waived = has('advanceWaived') ? d.advanceWaived === true : (before?.advanceWaived ?? false);
  // Whenever the advance amount itself is set (and paid status isn't explicitly
  // being set in the same call), derive advancePaid from it — a filled advance
  // is paid, so the manual toggle doesn't need to be revisited later. A waived case
  // (refusal / free service) is settled without money, so a zero advance must never
  // drag it back to "unpaid" here — only a real payment can move the flag.
  if (has('advance') && !has('advancePaid')) {
    const advanceNum = data.advance !== undefined && data.advance !== null && data.advance !== '' ? Number(data.advance) : 0;
    if (advanceNum > 0 || !waived) d.advancePaid = advanceNum > 0;
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

// Combines the FILE_PROCESSING → INVOICED → COMPLETED transition into one step: an invoice
// is auto-generated from the case's own charges/discount/advance figures, and the case is
// completed immediately — there is no separate manual "Invoiced" stage to sit in.
export const advanceToInvoicedWithInvoice = async (
  id: string,
  opts: { dueDate?: string; notes?: string; createdById?: string } = {}
) => {
  const existing = await prisma.visaCase.findUnique({
    where: { id },
    select: {
      stage: true, onHold: true,
      destination: true, destinationOptions: true, city: true, cityOptions: true,
      charges: true, discount: true, advance: true, paymentReceived: true,
      docAppointmentCost: true, docAppointmentClientPaid: true,
      docTicketCost: true, docTicketClientPaid: true,
      docInsuranceCost: true, docInsuranceClientPaid: true,
      docHotelCost: true, docHotelClientPaid: true,
      docSelfEmploymentCost: true, docSelfEmploymentClientPaid: true,
    },
  });
  if (!existing) {
    const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e;
  }
  if (existing.stage !== 'FILE_PROCESSING') throw new Error('STAGE_INVALID');
  if (existing.onHold) throw new Error('ON_HOLD');
  if ((existing.destinationOptions?.length ?? 0) > 0 && !existing.destination) {
    throw new Error('DESTINATION_NOT_FINALIZED');
  }
  if ((existing.cityOptions?.length ?? 0) > 0 && !existing.city) {
    throw new Error('CITY_NOT_FINALIZED');
  }

  const charges  = existing.charges  ?? new Prisma.Decimal(0);
  const discount = existing.discount ?? new Prisma.Decimal(0);
  // Each agency-fronted doc cost becomes its own invoice line item, and whatever the
  // client has already paid back toward it counts as an advance on the invoice. Any
  // part-payment already taken from the client during File Processing (paymentReceived)
  // counts toward the advance too, so it isn't lost from the outstanding figure once
  // the case is invoiced.
  const { items: docItems, clientContribution, costTotal } = computeAgencyDocLineItems(existing);
  const advance = (existing.advance ?? new Prisma.Decimal(0))
    .plus(clientContribution)
    .plus(existing.paymentReceived ?? new Prisma.Decimal(0));
  const total = charges.plus(costTotal).minus(discount);
  const outstanding = total.minus(advance);
  const lineItems: InvoiceLineItem[] = [{ label: 'Service Charges', amount: charges.toNumber() }, ...docItems];

  const [invoice, updatedCase] = await prisma.$transaction(async (tx) => {
    const last = await tx.invoice.findFirst({ orderBy: { invoiceRef: 'desc' }, select: { invoiceRef: true } });
    const num = last ? parseInt(last.invoiceRef.replace('INV-', ''), 10) + 1 : 1000;
    const invoiceRef = `INV-${num}`;

    const inv = await tx.invoice.create({
      data: {
        invoiceRef, caseId: id,
        dueDate: opts.dueDate ? new Date(opts.dueDate) : undefined,
        charges, discount, advance,
        totalAmount: total,
        paidAmount: new Prisma.Decimal(0),
        outstanding,
        lineItems: lineItems as unknown as Prisma.InputJsonValue,
        notes: opts.notes,
        createdById: opts.createdById,
      },
      select: { id: true, invoiceRef: true, totalAmount: true, outstanding: true, status: true, issueDate: true },
    });

    const updated = await tx.visaCase.update({ where: { id }, data: { stage: 'COMPLETED' }, select: CASE_SELECT });
    return [inv, updated] as const;
  });

  return { invoice, case: updatedCase };
};

// Lets a user preview the receipt at any point during File Processing — same figures
// and line items advanceToInvoicedWithInvoice would produce — without creating a real
// Invoice row or touching the case's stage. Purely read-only, generate-on-demand.
export const buildInvoicePreview = async (id: string) => {
  const c = await prisma.visaCase.findUnique({
    where: { id },
    select: {
      id: true, destination: true, visaType: true,
      charges: true, discount: true, advance: true, paymentReceived: true,
      docAppointmentCost: true, docAppointmentClientPaid: true,
      docTicketCost: true, docTicketClientPaid: true,
      docInsuranceCost: true, docInsuranceClientPaid: true,
      docHotelCost: true, docHotelClientPaid: true,
      docSelfEmploymentCost: true, docSelfEmploymentClientPaid: true,
      client: {
        select: {
          id: true, clientRef: true, firstName: true, lastName: true, phone: true,
          addressStreet: true, addressCity: true, addressShire: true, addressPostalCode: true, addressCountry: true,
        },
      },
    },
  });
  if (!c) return null;

  const charges  = c.charges  ?? new Prisma.Decimal(0);
  const discount = c.discount ?? new Prisma.Decimal(0);
  const { items: docItems, clientContribution, costTotal } = computeAgencyDocLineItems(c);
  const advance = (c.advance ?? new Prisma.Decimal(0))
    .plus(clientContribution)
    .plus(c.paymentReceived ?? new Prisma.Decimal(0));
  const total = charges.plus(costTotal).minus(discount);
  const outstanding = total.minus(advance);
  const lineItems: InvoiceLineItem[] = [{ label: 'Service Charges', amount: charges.toNumber() }, ...docItems];

  return {
    invoiceRef: `PREVIEW-${c.client?.clientRef ?? c.id}`,
    issueDate: new Date(),
    dueDate: null,
    charges, discount, advance,
    totalAmount: total,
    paidAmount: new Prisma.Decimal(0),
    outstanding,
    status: 'DRAFT' as const,
    lineItems,
    notes: 'Preview only — not a final invoice. Figures may change until the case is moved to Invoiced.',
    case: { id: c.id, destination: c.destination, visaType: c.visaType, client: c.client },
  };
};

// Returns current stage so the controller can resolve the required permission for a transition.
export const getCaseStage = async (id: string): Promise<CaseStageName | null> => {
  const c = await prisma.visaCase.findUnique({ where: { id }, select: { stage: true } });
  return (c?.stage as CaseStageName) ?? null;
};

export const deleteCase = async (id: string) => {
  return prisma.visaCase.delete({ where: { id } });
};
