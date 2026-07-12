import { z } from 'zod';

// Restricts the year to 1900-2099 (rather than any 4 digits) so a mistyped date like
// "20002222-02-02" — a real bug where a date-picker's year segment accepted an
// unbounded number of digits — fails validation instead of quietly truncating.
const DATE_REGEX = /^(19|20)\d{2}-\d{2}-\d{2}$/;
const DATE_FORMAT_MSG = 'Use YYYY-MM-DD format (year between 1900-2099)';

// A case's destination is either a single decided country (`destination`) or, when the
// client hasn't chosen yet, a shortlist of candidates (`destinationOptions`) — File
// Processing finalizes down to one. Exactly one of the two must be given.
const destinationFields = {
  destination:        z.string().min(1).max(100).trim().optional(),
  // 50 rather than the option list's current size — "Any" shortlists every current
  // destination option at once, and that list can grow.
  destinationOptions: z.array(z.string().min(1).max(100).trim()).max(50).optional(),
};
const requireDestination = <T extends { destination?: string; destinationOptions?: string[] }>(data: T) =>
  !!data.destination || (data.destinationOptions?.length ?? 0) > 0;

// City is optional either way, so no requireCity refine is needed — cityOptions just
// rides alongside city the same way destinationOptions rides alongside destination.
const cityFields = {
  city:        z.string().max(100).trim().optional(),
  cityOptions: z.array(z.string().min(1).max(100).trim()).max(50).optional(),
};

const createClientObjectSchema = z.object({
  receivedDate: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG),
  firstName:    z.string().min(1).max(100).trim(),
  lastName:     z.string().min(1).max(100).trim(),
  gender:       z.enum(['MALE', 'FEMALE', 'OTHER']),
  dob:          z.string().regex(DATE_REGEX, DATE_FORMAT_MSG),
  phone:        z.string().min(7).max(30).trim(),
  email:        z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  whatsapp:     z.string().max(30).optional(),
  addressStreet:     z.string().max(200).optional(),
  addressCity:       z.string().max(100).optional(),
  addressShire:      z.string().max(100).optional(),
  addressPostalCode: z.string().max(20).optional(),
  addressCountry:    z.string().max(100).optional(),
  passportNumber: z.string().min(3).max(30).trim(),
  passportIssue:  z.string().regex(DATE_REGEX, DATE_FORMAT_MSG),
  passportExpiry: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG),
  birthCity:      z.string().max(100).optional(),
  nationality:    z.string().min(1).max(100).trim(),
  maritalStatus:  z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  previousSchengenVisa: z.string().max(500).optional(),
  registeredEmail: z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  eVisa:    z.boolean().default(false),
  visaAndTravelHistory: z.string().optional(),
  source:     z.string().max(100).optional(),
  referredBy: z.string().max(100).optional(),
  hrComments: z.string().optional(),
  folderUrl:  z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
  assignedToId: z.string().uuid().optional(),
  groupId:    z.string().uuid().optional(),
  // First visa case
  ...destinationFields,
  ...cityFields,
  visaType:     z.string().max(100).optional(),
  ukVisaExpiry: z.string().regex(DATE_REGEX).optional().or(z.literal('')).transform(v => v || undefined),
  priority:     z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  advance:      z.number().nonnegative().optional(),
  charges:      z.number().nonnegative().optional(),
  discount:     z.number().nonnegative().optional(),
});
export const createClientSchema = createClientObjectSchema.refine(requireDestination, {
  message: 'Destination (or destination options) is required', path: ['destination'],
});

// Bulk import accepts incomplete records — anything not on file yet is left blank
// and the case stays flagged incomplete in the Appointment queue until the required
// fields are filled in (see utils/caseRequiredInfo.ts for what file processing needs).
const optionalText = (max: number) =>
  z.string().max(max).optional().or(z.literal('')).transform(v => (v ? v.trim() : undefined));
const optionalDate = () =>
  z.string().regex(DATE_REGEX, DATE_FORMAT_MSG).optional().or(z.literal('')).transform(v => v || undefined);

export const importClientSchema = createClientObjectSchema.extend({
  // Carried over as-is from the source file's "#" column when present, instead of
  // auto-generating a new CL-NNN ref. See generateClientRef for the collision guard.
  clientRef: optionalText(30),
  phone: z.string().max(30).optional().transform(v => (v && v.trim().length >= 7 ? v.trim() : 'N/A')),
  // Neither name is individually required on import — a row just needs at least
  // one of them (see the refine below), unlike manual creation where both are mandatory.
  firstName:      optionalText(100),
  lastName:       optionalText(100),
  gender:         z.enum(['MALE', 'FEMALE', 'OTHER']).optional().or(z.literal('')).transform(v => v || undefined),
  dob:            optionalDate(),
  passportNumber: optionalText(30),
  passportIssue:  optionalDate(),
  passportExpiry: optionalDate(),
  nationality:    optionalText(100),
  destination:    optionalText(100),
}).refine(data => !!(data.firstName || data.lastName), {
  message: 'First Name or Last Name is required',
  path: ['firstName'],
});

export const updateClientSchema = z.object({
  receivedDate: z.string().regex(DATE_REGEX).optional(),
  firstName:    z.string().min(1).max(100).trim().optional(),
  lastName:     z.string().min(1).max(100).trim().optional(),
  gender:       z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dob:          z.string().regex(DATE_REGEX).optional(),
  phone:        z.string().min(7).max(30).trim().optional(),
  email:        z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  whatsapp:     z.string().max(30).optional(),
  addressStreet:     z.string().max(200).optional(),
  addressCity:       z.string().max(100).optional(),
  addressShire:      z.string().max(100).optional(),
  addressPostalCode: z.string().max(20).optional(),
  addressCountry:    z.string().max(100).optional(),
  passportNumber: z.string().min(3).max(30).trim().optional(),
  passportIssue:  z.string().regex(DATE_REGEX).optional(),
  passportExpiry: z.string().regex(DATE_REGEX).optional(),
  birthCity:      z.string().max(100).optional(),
  nationality:    z.string().min(1).max(100).trim().optional(),
  maritalStatus:  z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  previousSchengenVisa: z.string().max(500).optional(),
  registeredEmail: z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  eVisa:    z.boolean().optional(),
  visaAndTravelHistory: z.string().optional(),
  source:     z.string().max(100).optional(),
  referredBy: z.string().max(100).optional(),
  hrComments: z.string().optional(),
  folderUrl:  z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
  assignedToId: z.string().uuid().optional(),
  groupId:    z.string().uuid().nullable().optional(),
});

export const clientQuerySchema = z.object({
  page:        z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit:       z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  search:      z.string().optional(),
  stage:       z.enum(['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED', 'CANCELLED']).optional(),
  destination: z.string().optional(),
});

export const createGroupSchema = z.object({
  name:     z.string().min(1).max(150).trim(),
  relation: z.string().max(100).optional(),
  notes:    z.string().max(1000).optional(),
});

export const updateGroupSchema = z.object({
  name:     z.string().min(1).max(150).trim().optional(),
  relation: z.string().max(100).optional(),
  notes:    z.string().max(1000).optional(),
});

export const groupMembersSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1),
});

export const createCaseSchema = z.object({
  ...destinationFields,
  ...cityFields,
  visaType:     z.string().max(100).optional(),
  ukVisaExpiry: z.string().regex(DATE_REGEX).optional().or(z.literal('')).transform(v => v || undefined),
  priority:     z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  advance:      z.number().nonnegative().optional(),
  charges:      z.number().nonnegative().optional(),
  discount:     z.number().nonnegative().optional(),
}).refine(requireDestination, { message: 'Destination (or destination options) is required', path: ['destination'] });

// Assignee fields: a uuid to assign, or '' / null from the "— Unassigned —" option to
// explicitly clear it. Plain .optional() alone can't express "clear" — an absent key
// just leaves the field untouched, so unassigning needs to send null through.
const clearableAssignee = () =>
  z.string().uuid().nullable().optional().or(z.literal('').transform(() => null));

export const updateCaseSchema = z.object({
  destination:        z.string().min(1).max(100).optional(),
  destinationOptions: z.array(z.string().min(1).max(100).trim()).max(50).optional(),
  city:               z.string().max(100).optional(),
  cityOptions:        z.array(z.string().min(1).max(100).trim()).max(50).optional(),
  visaType:     z.string().max(100).optional(),
  ukVisaExpiry: optionalDate(),
  stage:        z.enum(['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED', 'CANCELLED']).optional(),
  priority:     z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  advance:      z.number().nonnegative().optional(),
  charges:      z.number().nonnegative().optional(),
  discount:     z.number().nonnegative().optional(),
  // Onboarding — advance payment status & hold
  advancePaid:     z.boolean().optional(),
  advancePaidDate: z.string().optional(),
  onHold:          z.boolean().optional(),
  onHoldReason:    z.string().max(500).optional(),
  // Stage 2
  appointmentStatus:       z.enum(['WAITING', 'REGISTERED', 'ASSIGNED', 'COMPLETED', 'HOLD', 'DROPPED', 'BACK_UP']).nullable().optional(),
  appointmentDate:         optionalDate(),
  bookedById:              clearableAssignee(),
  appointmentAssignedToId: clearableAssignee(),
  fileAssignedToId:        clearableAssignee(),
  fraNo:           z.string().max(100).optional(),
  tlsAccount:      z.string().max(100).optional(),
  appointmentNotes: z.string().optional(),
  // Stage 3
  travelDate:    optionalDate(),
  hotelDate:     optionalDate(),
  salamComments: z.string().optional(),
  hrComments:    z.string().optional(),
  docAppointment: z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED']).optional(),
  docTicket:      z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED']).optional(),
  docInsurance:   z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED']).optional(),
  docHotel:       z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED']).optional(),
  docEVisa:       z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED']).optional(),
  docSop:         z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED']).optional(),
  docVisaForm:    z.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED']).optional(),
  docAppointmentCost: z.number().nonnegative().nullable().optional(),
  docTicketCost:      z.number().nonnegative().nullable().optional(),
  docInsuranceCost:   z.number().nonnegative().nullable().optional(),
  docHotelCost:       z.number().nonnegative().nullable().optional(),
  docEVisaCost:       z.number().nonnegative().nullable().optional(),
  docSopCost:         z.number().nonnegative().nullable().optional(),
  docVisaFormCost:    z.number().nonnegative().nullable().optional(),
  docAppointmentClientPaid: z.number().nonnegative().nullable().optional(),
  docTicketClientPaid:      z.number().nonnegative().nullable().optional(),
  docInsuranceClientPaid:   z.number().nonnegative().nullable().optional(),
  docHotelClientPaid:       z.number().nonnegative().nullable().optional(),
  paymentReceived: z.number().nonnegative().optional(),
});

export const createInvoiceSchema = z.object({
  caseId:   z.string().uuid(),
  dueDate:  optionalDate(),
  charges:  z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  advance:  z.number().nonnegative().default(0),
  notes:    z.string().optional(),
});

export const updateInvoiceSchema = z.object({
  dueDate:    optionalDate(),
  charges:    z.number().nonnegative().optional(),
  discount:   z.number().nonnegative().optional(),
  advance:    z.number().nonnegative().optional(),
  paidAmount: z.number().nonnegative().optional(),
  status:     z.enum(['DRAFT', 'SENT', 'PARTIAL', 'PAID']).optional(),
  notes:      z.string().optional(),
});
