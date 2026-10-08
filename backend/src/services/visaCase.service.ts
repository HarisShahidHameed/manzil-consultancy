import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { getMissingRequiredFields, CaseRequiredField } from '../utils/caseRequiredInfo';
import { computeAgencyDocLineItems, InvoiceLineItem } from '../utils/invoiceItems';
import { appendHrComment } from '../utils/hrComments';

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
  stage: true, priority: true, receivedDate: true,
  advance: true, charges: true, discount: true,
  advancePaid: true, advancePaidDate: true, advanceWaived: true, advanceWaiverReason: true, advanceWaiverType: true,
  onHold: true, onHoldReason: true,
  appointmentStatus: true,
  appointmentDate: true, appointmentPaidBy: true, bookedById: true, appointmentAssignedToId: true, fileAssignedToId: true,
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


// The note a duplicate case is auto-cancelled with. Exported so the monthly report can tell a
// system clean-up apart from a client actually cancelling.
export const AUTO_CANCEL_DUPLICATE_REASON = 'Auto-cancelled: duplicate case for this client';

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

/**
 * The one backwards move the workflow allows: a case already handed over to File Processing
 * goes back to Appointments when the client's plans change (e.g. an October appointment is
 * cancelled and has to be rebooked for November). Re-working the date on the original record
 * beats opening a second case for the same trip. It is a correction, not a step of the
 * normal flow, so it is gated on the SUPER_ADMIN role rather than on a team permission —
 * see the controller — and none of the forward gates apply to it.
 */
export const isRevertToAppointment = (from: string, to: string): boolean =>
  from === 'FILE_PROCESSING' && to === 'APPOINTMENT';
export const REVERT_ROLE = 'SUPER_ADMIN';

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
    // Optional so callers built before 1 Oct 2026 (and their tests) type-check unchanged; an
    // absent key reads as "not recorded" and blocks the hand-over like a null does.
    appointmentPaidBy?: string | null;
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

  // The Super Admin correction back to Appointments (role-checked by the controller). Allowed
  // while paused too: pausing is often exactly what a changed booking looks like.
  if (isRevertToAppointment(current, next)) return;

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
    // Who paid for the appointment travels with the hand-over, so File Processing never has
    // to go back and ask. Only the File Processing hand-over needs it; an appointment-only
    // case completing here has no checklist downstream to feed.
    if (next === 'FILE_PROCESSING' && !caseRecord.appointmentPaidBy) throw new Error('APPOINTMENT_PAYER_REQUIRED');
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

export type CaseSortField = 'routedAt' | 'appointmentDate' | 'receivedDate' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

/**
 * The columns a listing is allowed to sort by. A whitelist rather than a pass-through, so
 * a query param can never name an arbitrary Prisma field.
 *
 * `routedAt` orders by when a case was handed over into File Processing. Cases routed
 * before that timestamp existed have no value for it, so they fall in behind on
 * `nulls: 'last'` and keep their received-date order from the tiebreaker.
 */
// Every ordering ends on the client number, DESCENDING — newest client on top. Two cases
// that tie on the primary key (the norm, since a day's intake shares a received date) would
// otherwise come back in whatever order Postgres happened to produce. It used to be
// ascending, which filed each newly added client at the BOTTOM of its day's group; the
// 1 Oct 2026 change round asked for the reverse, so the board now reads in one consistent
// downward flow: latest date first, and within a date the highest number first.
// clientRefNum is the database-generated numeric form of clientRef (see schema): ordering by
// clientRef itself is alphabetical and would file CL-1000 below CL-953.
// clientRef itself breaks the remaining tie. Members of a legacy shared-number group all
// carry the same number (CL-116-G1-01, CL-116-G1-02, ...), so clientRefNum alone leaves
// them in arbitrary order; their zero-padded position makes the text sort correct there.
const BY_CLIENT_NUMBER: Prisma.VisaCaseOrderByWithRelationInput[] = [
  { client: { clientRefNum: { sort: 'desc', nulls: 'last' } } },
  { client: { clientRef: 'desc' } },
];

const CASE_ORDER_BY: Record<CaseSortField, (order: SortOrder) => Prisma.VisaCaseOrderByWithRelationInput[]> = {
  // receivedDate is the CASE's own entry date since 1 Oct 2026 (#10), not the client's: a
  // returning client's new case files under the day it was opened, not under the date their
  // profile was first received.
  routedAt:        (order) => [{ fileProcessingStartedAt: { sort: order, nulls: 'last' } }, { receivedDate: 'desc' }, ...BY_CLIENT_NUMBER],
  appointmentDate: (order) => [{ appointmentDate: { sort: order, nulls: 'last' } }, ...BY_CLIENT_NUMBER],
  receivedDate:    (order) => [{ receivedDate: order }, ...BY_CLIENT_NUMBER],
  createdAt:       (order) => [{ createdAt: order }, ...BY_CLIENT_NUMBER],
};

/**
 * Advance settlement as a three-state, not a boolean. "Waived" (prior refusal / free
 * service) is a state of its own: the advance is settled without money ever arriving, so
 * such a case is neither Paid nor Unpaid and there has to be a way to actually ask for it.
 *
 * The three predicates are mutually exclusive and jointly exhaustive over every row:
 * `waived` is exactly `advanceWaived: true`, and `paid`/`unpaid` both pin
 * `advanceWaived: false` and then partition that remainder on `advancePaid`. So every case
 * answers exactly one of the three, whatever combination updateCase left behind — including
 * the paid-then-waived case that carries both flags, which reads as `waived` because the
 * waiver is the later and more specific fact about it.
 */
export type AdvanceState = 'paid' | 'unpaid' | 'waived';

const ADVANCE_STATE_WHERE: Record<AdvanceState, Prisma.VisaCaseWhereInput> = {
  paid:   { advancePaid: true,  advanceWaived: false },
  unpaid: { advancePaid: false, advanceWaived: false },
  waived: { advanceWaived: true },
};

/**
 * The timestamp columns a listing is allowed to range-filter on. A whitelist rather than a
 * pass-through, for the same reason CASE_ORDER_BY is one: the field name arrives from the
 * query string, and an unchecked one would be interpolated straight into the Prisma
 * `where` as an arbitrary column.
 *
 * These are the three the metric cards count by, so a card's drill-down always has a field
 * to name — see METRIC_CARDS.
 */
export const CASE_DATE_FIELDS = ['appointmentDateSetAt', 'fileProcessingStartedAt', 'createdAt'] as const;
export type CaseDateField = typeof CASE_DATE_FIELDS[number];

/**
 * Every way a case listing can be narrowed. One object rather than a positional tail, so a
 * metric card can declare its own subset as a plain literal and feed that literal to the
 * same buildCaseWhere that /api/cases feeds its parsed query string to.
 */
export interface CaseListFilters {
  stage?: string;
  search?: string;
  appointmentStatus?: string;
  destination?: string;
  city?: string;
  advanceState?: AdvanceState;
  /**
   * @deprecated Superseded by `advanceState`. Kept working because the documented API
   * surface and any third-party integration built against it still send it. It maps onto
   * the same ADVANCE_STATE_WHERE predicates (true → paid, false → unpaid) so the old and
   * new spellings can never drift apart, and `advanceState` wins when both arrive.
   */
  advancePaid?: boolean;
  onHold?: boolean;
  serviceType?: string;
  fileAssignedToId?: string;
  hasAppointmentDate?: boolean;
  /**
   * Required whenever `from`/`to` are given — a range is meaningless without the column it
   * ranges over, and quietly guessing one would count the wrong event.
   */
  dateField?: CaseDateField;
  from?: Date;
  to?: Date;
}

export interface CaseListOptions extends CaseListFilters {
  page?: number;
  limit?: number;
  sort?: CaseSortField;
  order?: SortOrder;
}

/** Thrown when `from`/`to` arrive without a `dateField`; the controller turns it into a 400. */
export const DATE_RANGE_WITHOUT_FIELD = 'DATE_RANGE_WITHOUT_FIELD';

/**
 * Compiles listing filters into a Prisma `where`. Pulled out of listCases so that it is the
 * single place a case-listing predicate is built — getAppointmentMetrics counts through
 * this very function, which is what stops a metric card from reporting a number its
 * drill-down cannot reproduce.
 *
 * Each filter is ANDed together (Prisma's default for sibling where keys) so status,
 * destination, city, advance state, on-hold, service-type, date range and free-text search
 * can all narrow the result set at once.
 */
export const buildCaseWhere = (f: CaseListFilters): Prisma.VisaCaseWhereInput => {
  const where: Prisma.VisaCaseWhereInput = {};
  // "stage" also accepts a comma-separated list (e.g. the appointment→file-processing
  // conversion card wants FILE_PROCESSING,INVOICED,COMPLETED in one query) alongside the
  // normal single-stage filter every other listing uses.
  if (f.stage) where.stage = f.stage.includes(',') ? { in: f.stage.split(',') as any } : (f.stage as any);
  if (f.appointmentStatus) where.appointmentStatus = f.appointmentStatus as any;
  if (f.destination) where.destination = { contains: f.destination, mode: 'insensitive' };
  if (f.city) where.city = { contains: f.city, mode: 'insensitive' };
  // `advanceState` is the three-state filter the UI drives; `advancePaid` is the legacy
  // boolean, folded onto the exact same predicates rather than re-implemented beside them.
  const advanceState: AdvanceState | undefined = f.advanceState
    ?? (f.advancePaid === undefined ? undefined : f.advancePaid ? 'paid' : 'unpaid');
  if (advanceState) Object.assign(where, ADVANCE_STATE_WHERE[advanceState]);
  if (f.onHold !== undefined) where.onHold = f.onHold;
  if (f.serviceType) where.client = { serviceType: f.serviceType as any };
  // 'none' is the "Unassigned" tab: a case that has just been routed into File Processing
  // has nobody on it yet, and without this sentinel there is no way to ask for those rows
  // — they would sit under no user tab at all. It cannot collide with a real handler id
  // because every id is a uuid, and the query schema admits only a uuid or this literal.
  if (f.fileAssignedToId) where.fileAssignedToId = f.fileAssignedToId === 'none' ? null : f.fileAssignedToId;
  if (f.hasAppointmentDate !== undefined) where.appointmentDate = f.hasAppointmentDate ? { not: null } : null;
  // Half-open [from, to): the upper bound is excluded, so two adjacent buckets
  // (yesterday/today, one month and the next) share a boundary instant without the case
  // sitting exactly on it being counted in both. `dateField` is whitelisted above, so a
  // caller-supplied string never reaches the where as a column name.
  if (f.from || f.to) {
    if (!f.dateField) throw new Error(DATE_RANGE_WITHOUT_FIELD);
    (where as Record<string, unknown>)[f.dateField] = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.to   ? { lt:  f.to   } : {}),
    };
  }
  if (f.search) {
    where.OR = [
      { destination:    { contains: f.search, mode: 'insensitive' } },
      { client: { firstName: { contains: f.search, mode: 'insensitive' } } },
      { client: { lastName:  { contains: f.search, mode: 'insensitive' } } },
      { client: { clientRef: { contains: f.search, mode: 'insensitive' } } },
    ];
  }
  return where;
};

export const listCases = async (opts: CaseListOptions = {}) => {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const skip = (page - 1) * limit;
  const where = buildCaseWhere(opts);
  // File Processing defaults to newest-routed-first, because the cases staff most need to
  // see are the ones they just handed over — ordering by soonest appointment instead put
  // the day's intake (furthest-future dates) at the very end of the result set, so it fell
  // onto page 2+ and looked to the file team like their new clients had disappeared.
  // That "earliest appointment due first" view is still genuinely useful when working the
  // queue by deadline, so it stays reachable as ?sort=appointmentDate&order=asc rather
  // than being thrown away. Every other listing stays newest-received-first.
  // File Processing works to appointment deadlines, so it leads with the soonest — that is
  // the order the file team reads the board in. (It briefly defaulted to newest-routed to
  // keep a day's intake on page 1; that solved the wrong half of the problem and scrambled
  // the deadline order the page exists to show. The intake is kept visible by the 50-row
  // page, the Unassigned tab and the page clamp instead, and "Recently routed" is now an
  // option in the UI rather than a URL-only escape hatch.)
  const defaultSort: CaseSortField = opts.stage === 'FILE_PROCESSING' ? 'appointmentDate' : 'receivedDate';
  const sort = opts.sort ?? defaultSort;
  // A deadline reads soonest-first; every other column reads newest-first.
  const defaultOrder: SortOrder = sort === 'appointmentDate' ? 'asc' : 'desc';
  const orderBy = CASE_ORDER_BY[sort](opts.order ?? defaultOrder);
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

/**
 * Today as a date-only value: midnight UTC of the server's calendar day, the same convention
 * a 'YYYY-MM-DD' received date parses to — so a case opened today sorts and displays with
 * the day's other intake rather than a few hours either side of it.
 */
export const todayAsDate = (now = new Date()): Date =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

export const createCase = async (
  clientId: string,
  data: {
    destination?: string; destinationOptions?: string[];
    city?: string; cityOptions?: string[]; visaType?: string; ukVisaExpiry?: string; eVisaType?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    advance?: number; charges?: number; discount?: number;
    // Explicit advance status chosen on the form (1 Oct 2026 #9). Absent = derive paid from
    // the amount, as before.
    advancePaid?: boolean;
    advanceWaiverType?: 'WAIVED' | 'FAMILY' | 'FRIEND';
    // The new case's entry date, 'YYYY-MM-DD' (1 Oct 2026 #10). Defaults to today — never
    // to the client's original received date — even though the client number is reused.
    receivedDate?: string;
  }
) => {
  const paidNow = data.advancePaid ?? (data.advance ?? 0) > 0;
  const { destination, destinationOptions } = resolveDestination(data);
  const { city, cityOptions } = resolveCity(data);
  // New cases skip Intake entirely: they enter the appointment queue as Waiting.
  return prisma.$transaction(async (tx) => {
    // One cheap indexed lookup to find out whether this client belongs to a family group.
    // For a lone client groupId is null and nothing below runs — the common path pays for
    // this single read and no more.
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { groupId: true } });
    const groupId = client?.groupId ?? null;
    // Only the WhatsApp group is inherited from the family. That one IS a standing property
    // of the family unit — a single group per family regardless of member count — so a new
    // case for a member belongs to the group that already exists.
    //
    // The advance and the waiver are deliberately NOT inherited. They are facts about one
    // booking, not about the family forever. Inheriting them meant a member who came back a
    // year later for a visa of their own opened a case already marked paid, for a trip
    // nobody had paid for — money that then appeared on no chase list anywhere. A group
    // member is an individual client with their own cases; only the members' cases that
    // exist when the money actually changes hands are settled by it, which is what
    // propagateGroupFlags below does.
    const family = groupId ? await readGroupSettlement(tx, groupId) : null;

    const created = await tx.visaCase.create({
      data: {
        clientId,
        receivedDate: data.receivedDate ? new Date(data.receivedDate) : todayAsDate(),
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
        advancePaid: paidNow,
        advancePaidDate: paidNow ? new Date() : undefined,
        // Only when the form chose a waiver — never inherited from the family (see above).
        ...(data.advanceWaiverType ? { advanceWaived: true, advanceWaiverType: data.advanceWaiverType } : {}),
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

// Everything updateCase needs to know about a case *before* it writes it: the workflow
// gates, the stamp-once conversion timestamps, and the settlement/WhatsApp flags that are
// shared across a family group (with the client's groupId, null for a lone client).
const BEFORE_UPDATE_SELECT = {
  stage: true, onHold: true,
  advancePaid: true, advancePaidDate: true, advanceWaived: true, whatsappGroupCreated: true,
  destination: true, destinationOptions: true, city: true, cityOptions: true,
  appointmentDate: true, appointmentDateSetAt: true, fileProcessingStartedAt: true,
  appointmentPaidBy: true, appointmentStatus: true,
  invoices: { select: { status: true } },
  client: {
    select: {
      groupId: true,
      passportNumber: true, nationality: true, dob: true,
      passportIssue: true, passportExpiry: true, serviceType: true,
    },
  },
} satisfies Prisma.VisaCaseSelect;

export const updateCase = async (
  id: string,
  rawData: Record<string, any>,
  // Who is making the change — only used to sign the HR Comments entry a move back to
  // Appointments leaves behind. Optional so every existing caller keeps working unchanged.
  opts: { actorEmail?: string; actorRoles?: string[] } = {},
) => {
  // `revertReason` is a note that travels with a move back to Appointments, not a column.
  const { revertReason, ...data } = rawData;
  const has = (f: string) => Object.prototype.hasOwnProperty.call(data, f);
  // Read the pre-update case once and share it: the workflow rules, the conversion-card
  // timestamps and the family-group propagation all ask about the same row, and an update
  // that touches none of those (a note, a doc status) skips the read entirely.
  const needsContext = has('stage') || has('destination') || has('city')
    || ['advance', 'advancePaid', 'advanceWaived', 'advanceWaiverType', 'whatsappGroupCreated', 'appointmentDate', 'appointmentPaidBy',
        'onHold', 'appointmentStatus'].some(has);
  const before = needsContext
    ? await prisma.visaCase.findUnique({ where: { id }, select: BEFORE_UPDATE_SELECT })
    : null;
  if (needsContext && !before) {
    const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e;
  }

  // If a stage change or destination/city finalization is requested, enforce workflow rules first.
  if (before && (data.stage || data.destination !== undefined || data.city !== undefined)) {
    // Finalizing the destination/city from an existing shortlist must land on one of the
    // shortlisted candidates — but only when this call is doing exactly that (sending just
    // `destination`, like the File Processing "finalize" dropdown does). When the caller is
    // also sending a new `destinationOptions` in the same request (e.g. the client edit form
    // replacing the whole shortlist), it's declaring a fresh shortlist+destination pair
    // together, not finalizing from the old one — so the old list shouldn't gate it.
    if (data.destination !== undefined && data.destinationOptions === undefined
        && before.destinationOptions.length > 0
        && !before.destinationOptions.includes(data.destination)) {
      throw new Error('DESTINATION_NOT_SHORTLISTED');
    }
    if (data.city !== undefined && data.cityOptions === undefined
        && before.cityOptions.length > 0
        && !before.cityOptions.includes(data.city)) {
      throw new Error('CITY_NOT_SHORTLISTED');
    }
    if (data.stage) {
      assertTransitionAllowed(before.stage as CaseStageName, data.stage as CaseStageName, before);
    }
  }

  // Removing an appointment date is only meaningful while the case is still being booked.
  // Past the Appointment stage the date is what the case was handed over on (the hand-over
  // gate requires it), so clearing it there would leave a File Processing case with no
  // appointment at all. Staff reschedule those by moving the case back to Appointments.
  const clearingAppointmentDate = has('appointmentDate') && data.appointmentDate === null
    && !!before?.appointmentDate;
  if (clearingAppointmentDate && before && !['APPOINTMENT', 'CANCELLED'].includes(before.stage)) {
    throw new Error('APPOINTMENT_DATE_LOCKED');
  }

  // Appointment payer (1 Oct 2026 #5). The Appointment team records it with the date; from
  // File Processing on it is read-only, and only a Super Admin may correct it there. A case
  // that never had one recorded (pre-dating the field) may still have it filled in once.
  if (before && has('appointmentPaidBy') && data.appointmentPaidBy !== before.appointmentPaidBy
      && before.stage !== 'APPOINTMENT' && before.appointmentPaidBy != null
      && !opts.actorRoles?.includes('SUPER_ADMIN')) {
    throw new Error('APPOINTMENT_PAYER_LOCKED');
  }
  // Allotting a date (new, or moved) is the moment the payer is asked for. Re-saving an
  // unchanged date on an older case does not nag; the hand-over gate catches those instead.
  if (before && data.appointmentDate) {
    const newDate = new Date(data.appointmentDate).getTime();
    const dateChanged = !before.appointmentDate || before.appointmentDate.getTime() !== newDate;
    const payer = has('appointmentPaidBy') ? data.appointmentPaidBy : before.appointmentPaidBy;
    if (dateChanged && !payer) throw new Error('APPOINTMENT_PAYER_REQUIRED');
  }

  const d: any = { ...data };
  // Client-paid means the agency fronted nothing, so there is no agency cost to recover —
  // the same rule the checklist's Paid By radio has always applied to the cost box.
  if (d.appointmentPaidBy === 'CLIENT' && !has('docAppointmentCost')) d.docAppointmentCost = 0;
  const dateFields = ['ukVisaExpiry', 'appointmentDate', 'travelDate', 'hotelDate', 'advancePaidDate'];
  for (const f of dateFields) {
    if (d[f] && d[f] !== '') d[f] = new Date(d[f]);
    else if (d[f] === '') d[f] = null;
  }
  // Waiver sub-type (1 Oct 2026 #9). Picking Waived / Family / Friend IS waiving, so a type
  // on its own switches the waiver on; turning the waiver off takes the type with it; and a
  // bare advanceWaived: true from an older caller gets the plain WAIVED type.
  if (d.advanceWaiverType && !has('advanceWaived')) d.advanceWaived = true;
  if (d.advanceWaiverType === null && !has('advanceWaived')) d.advanceWaived = false;
  if (d.advanceWaived === false) d.advanceWaiverType = null;
  if (d.advanceWaived === true && !d.advanceWaiverType) d.advanceWaiverType = 'WAIVED';
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
  // Lifting the waiver takes its reason with it — a stale "Prior refusal" left on a case
  // that owes an advance again would keep reading as an exemption.
  if (d.advanceWaived === false) d.advanceWaiverReason = null;
  // Conversion-card timestamps: stamped the first time each event happens and never again.
  // A reschedule isn't a second allotment, and a case bouncing back into File Processing
  // isn't a second conversion — see the fields' comments in schema.prisma.
  if (before && d.appointmentDate && !before.appointmentDateSetAt) d.appointmentDateSetAt = new Date();
  // Removing the date reverses the allotment it triggered: the "Appointment Date Allotted"
  // card stops counting the case, and a date entered again later is a fresh allotment
  // stamped on the day it actually happens rather than on the original, withdrawn one.
  if (clearingAppointmentDate) d.appointmentDateSetAt = null;
  // Monthly-report timestamps (1 Oct 2026 #7): when each counted status last happened. Only a
  // genuine change stamps, so re-saving a form with the same values moves nothing.
  if (before) {
    const now = new Date();
    if (d.stage && d.stage !== before.stage) {
      if (d.stage === 'COMPLETED') d.completedAt = now;
      if (d.stage === 'CANCELLED') d.cancelledAt = now;
    }
    if (d.onHold === true && !before.onHold) d.onHoldAt = now;
    if (has('appointmentStatus') && d.appointmentStatus !== before.appointmentStatus) d.appointmentStatusChangedAt = now;
  }
  if (before && d.stage === 'FILE_PROCESSING' && !before.fileProcessingStartedAt) d.fileProcessingStartedAt = new Date();
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

  // Which of the family-shared flags this particular call actually changed. Only genuine
  // changes travel, so re-saving a form that happens to carry the same values doesn't reach
  // across the group — and for a client with no group nothing is built here at all.
  const groupId = before?.client.groupId ?? null;
  const groupFlags: Prisma.VisaCaseUpdateManyMutationInput = {};
  if (before && groupId) {
    if (d.advancePaid !== undefined && d.advancePaid !== before.advancePaid) {
      // The flag and its date only — the advance/charges/discount amounts stay on the
      // paying member's case, since the money was only handed over once.
      groupFlags.advancePaid = d.advancePaid;
      groupFlags.advancePaidDate = d.advancePaid ? (d.advancePaidDate ?? new Date()) : null;
    }
    if (d.advanceWaived !== undefined && d.advanceWaived !== before.advanceWaived) {
      groupFlags.advanceWaived = d.advanceWaived;
      groupFlags.advanceWaiverType = d.advanceWaiverType ?? null;
      if (d.advanceWaived === false) groupFlags.advanceWaiverReason = null;
      else if (d.advanceWaiverReason !== undefined) groupFlags.advanceWaiverReason = d.advanceWaiverReason;
    }
    if (d.whatsappGroupCreated !== undefined && d.whatsappGroupCreated !== before.whatsappGroupCreated) {
      groupFlags.whatsappGroupCreated = d.whatsappGroupCreated;
    }
  }

  // The case itself, the family propagation and the duplicate auto-cancel go together, so a
  // half-applied propagation (one member settled, the rest still unpaid) can't be left behind.
  return prisma.$transaction(async (tx) => {
    const updated = await tx.visaCase.update({ where: { id }, data: d, select: CASE_SELECT });

    await propagateGroupFlags(tx, id, groupId, groupFlags);

    // A move back to Appointments is a correction to the workflow, so it leaves a dated line
    // in the client's HR Comments log saying why — the file team would otherwise just see the
    // case vanish from their board.
    if (before && d.stage && isRevertToAppointment(before.stage, d.stage)) {
      const c = await tx.client.findUnique({ where: { id: updated.clientId }, select: { hrComments: true } });
      const note = `Case moved back from File Processing to Appointments${opts.actorEmail ? ` by ${opts.actorEmail}` : ''}`
        + `${typeof revertReason === 'string' && revertReason.trim() ? ` — ${revertReason.trim()}` : ''}.`;
      const hrComments = appendHrComment(c?.hrComments, 'Appointment', note);
      await tx.client.update({ where: { id: updated.clientId }, data: { hrComments } });
      if (updated.client) updated.client.hrComments = hrComments;
    }

    // A client is only meant to be actively working one case at a time. Once a case
    // reaches File Processing, any other still-open case (Appointment stage) for the
    // same client is a duplicate application and gets auto-cancelled.
    if (d.stage === 'FILE_PROCESSING') {
      await tx.visaCase.updateMany({
        where: { clientId: updated.clientId, id: { not: id }, stage: 'APPOINTMENT' },
        data: { stage: 'CANCELLED', onHoldReason: AUTO_CANCEL_DUPLICATE_REASON, cancelledAt: new Date() },
      });
    }

    return updated;
  });
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

    const updated = await tx.visaCase.update({ where: { id }, data: { stage: 'COMPLETED', completedAt: new Date() }, select: CASE_SELECT });
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

// One metric card's three columns.
export interface MetricBreakdown { today: number; yesterday: number; month: number }

/**
 * A card's three counts plus the exact /api/cases query params that reproduce its subset,
 * so clicking a number can open the rows behind it. `filters` carries `dateField` but
 * deliberately not `from`/`to` — the caller merges in whichever bucket was clicked, taken
 * from `ranges` below.
 */
export interface MetricCard extends MetricBreakdown { filters: Record<string, string> }

/** A half-open [from, to) window, serialized as ISO instants. */
export interface MetricRange { from: string; to: string }

export interface AppointmentMetrics {
  ranges: { today: MetricRange; yesterday: MetricRange; month: MetricRange };
  appointmentDateAllotted: MetricCard;
  movedToFileProcessing: MetricCard;
  appointmentOnly: MetricCard;
}

/**
 * Calendar buckets in *server* local time, not rolling windows: Today is this calendar day,
 * Yesterday the whole previous one, Month from the 1st. Staff read these cards as "what did
 * we do today", so a count has to reset at midnight rather than drift with a trailing 24
 * hours.
 *
 * Each bucket is half-open [from, to): the upper bound belongs to the next bucket, so the
 * case stamped exactly at midnight lands in Today and not in both Today and Yesterday.
 * Today and Month run to the start of tomorrow / of next month rather than to `now`, which
 * counts the same rows (these three columns are all stamped by the server as events happen,
 * so none of them is in the future) while keeping every bucket a clean day-aligned window
 * that a drill-down can re-send verbatim.
 */
const calendarBuckets = (now = new Date()) => {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    today:     { from: startOfToday,     to: startOfTomorrow },
    yesterday: { from: startOfYesterday, to: startOfToday },
    month:     { from: startOfMonth,     to: startOfNextMonth },
  };
};

type BucketName = keyof ReturnType<typeof calendarBuckets>;
const BUCKETS: BucketName[] = ['today', 'yesterday', 'month'];

/**
 * The three appointment funnel cards, each declared ONCE as a listing-filter literal.
 *
 * That single literal is used two ways: serialized to query params for the `filters` the
 * API returns, and compiled by buildCaseWhere — the very function GET /api/cases runs — for
 * the counts. There is no hand-written filter string sitting beside a hand-written `where`
 * that could quietly disagree, which is the whole reason the params are returned at all: a
 * drill-down has to land on exactly the rows the number came from.
 *
 * Each metric counts by the timestamp of the event it is about, not by the case's current
 * state — a case that was allotted an appointment yesterday and moved on today still counts
 * in yesterday's allotment column.
 *
 * Paused (on-hold) cases are excluded from all three, matching every listing — paused cases
 * are pulled out of the pipeline pages and live on their own Paused page, and the listings'
 * empty state now says so, so the cards have to count the same population.
 *
 * Appointment-only clients never reach File Processing, so they are counted on their own
 * card by when the case was opened — booking the appointment is the whole job.
 */
const METRIC_CARDS = {
  // `hasAppointmentDate` is part of the predicate, not decoration. updateCase now clears
  // appointmentDateSetAt when the date is removed, but rows whose date was blanked before
  // that existed (or directly in the database) still carry a stamp with no date behind it,
  // and must not be counted as allotted while showing no date in the drill-down.
  appointmentDateAllotted: {
    dateField: 'appointmentDateSetAt', serviceType: 'FULL_SERVICE', onHold: false, hasAppointmentDate: true,
  },
  movedToFileProcessing: {
    dateField: 'fileProcessingStartedAt', serviceType: 'FULL_SERVICE', onHold: false,
  },
  appointmentOnly: {
    dateField: 'createdAt', serviceType: 'APPOINTMENT_ONLY', onHold: false,
  },
} satisfies Record<keyof Omit<AppointmentMetrics, 'ranges'>, CaseListFilters & { dateField: CaseDateField }>;

type MetricCardName = keyof typeof METRIC_CARDS;

/**
 * A card's filter literal flattened to the query string /api/cases accepts. `from`/`to` are
 * dropped because a card has no single range — the caller picks the bucket.
 */
export const metricCardFilters = (name: MetricCardName): Record<string, string> =>
  Object.fromEntries(
    Object.entries(METRIC_CARDS[name])
      .filter(([k, v]) => v !== undefined && k !== 'from' && k !== 'to')
      .map(([k, v]) => [k, String(v)]),
  );

export const getAppointmentMetrics = async (): Promise<AppointmentMetrics> => {
  const bucket = calendarBuckets();
  const names = Object.keys(METRIC_CARDS) as MetricCardName[];

  // Nine cheap indexed counts in one round of parallel queries rather than nine awaits.
  const counts = await Promise.all(
    names.flatMap(name =>
      BUCKETS.map(b =>
        prisma.visaCase.count({ where: buildCaseWhere({ ...METRIC_CARDS[name], ...bucket[b] }) }),
      ),
    ),
  );

  const iso = (r: { from: Date; to: Date }): MetricRange => ({ from: r.from.toISOString(), to: r.to.toISOString() });
  const cards = Object.fromEntries(
    names.map((name, i) => [name, {
      today:     counts[i * 3],
      yesterday: counts[i * 3 + 1],
      month:     counts[i * 3 + 2],
      filters:   metricCardFilters(name),
    }]),
  ) as Record<MetricCardName, MetricCard>;

  return {
    // Returned rather than recomputed in the browser: the agency's day is the server's day,
    // and a viewer in another timezone recomputing "today" locally would drill down into a
    // different window than the one that produced the number next to it.
    ranges: { today: iso(bucket.today), yesterday: iso(bucket.yesterday), month: iso(bucket.month) },
    ...cards,
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
