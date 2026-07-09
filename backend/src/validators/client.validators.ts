import { z } from 'zod';

export const createClientSchema = z.object({
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  firstName:    z.string().min(1).max(100).trim(),
  lastName:     z.string().min(1).max(100).trim(),
  gender:       z.enum(['MALE', 'FEMALE', 'OTHER']),
  dob:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  phone:        z.string().min(7).max(30).trim(),
  email:        z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  whatsapp:     z.string().max(30).optional(),
  residentialAddress: z.string().max(500).optional(),
  passportNumber: z.string().min(3).max(30).trim(),
  passportIssue:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  passportExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
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
  destination:  z.string().min(1).max(100).trim(),
  city:         z.string().max(100).optional(),
  visaType:     z.string().max(100).optional(),
  ukVisaExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).transform(v => v || undefined),
  priority:     z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  advance:      z.number().nonnegative().optional(),
  charges:      z.number().nonnegative().optional(),
  discount:     z.number().nonnegative().optional(),
});

// Bulk import accepts incomplete records — anything not on file yet is left blank
// and the case stays flagged incomplete in the Appointment queue until the required
// fields are filled in (see utils/caseRequiredInfo.ts for what file processing needs).
const optionalText = (max: number) =>
  z.string().max(max).optional().or(z.literal('')).transform(v => (v ? v.trim() : undefined));
const optionalDate = () =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').optional().or(z.literal('')).transform(v => v || undefined);

export const importClientSchema = createClientSchema.extend({
  // Carried over as-is from the source file's "#" column when present, instead of
  // auto-generating a new CL-NNN ref. See generateClientRef for the collision guard.
  clientRef: optionalText(30),
  phone: z.string().max(30).optional().transform(v => (v && v.trim().length >= 7 ? v.trim() : 'N/A')),
  lastName:       optionalText(100),
  gender:         z.enum(['MALE', 'FEMALE', 'OTHER']).optional().or(z.literal('')).transform(v => v || undefined),
  dob:            optionalDate(),
  passportNumber: optionalText(30),
  passportIssue:  optionalDate(),
  passportExpiry: optionalDate(),
  nationality:    optionalText(100),
  destination:    optionalText(100),
});

export const updateClientSchema = z.object({
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  firstName:    z.string().min(1).max(100).trim().optional(),
  lastName:     z.string().min(1).max(100).trim().optional(),
  gender:       z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dob:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone:        z.string().min(7).max(30).trim().optional(),
  email:        z.string().email().optional().or(z.literal('')).transform(v => v || undefined),
  whatsapp:     z.string().max(30).optional(),
  residentialAddress: z.string().max(500).optional(),
  passportNumber: z.string().min(3).max(30).trim().optional(),
  passportIssue:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passportExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  destination:  z.string().min(1).max(100).trim(),
  city:         z.string().max(100).optional(),
  visaType:     z.string().max(100).optional(),
  ukVisaExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).transform(v => v || undefined),
  priority:     z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  advance:      z.number().nonnegative().optional(),
  charges:      z.number().nonnegative().optional(),
  discount:     z.number().nonnegative().optional(),
});

export const updateCaseSchema = z.object({
  destination:  z.string().min(1).max(100).optional(),
  city:         z.string().max(100).optional(),
  visaType:     z.string().max(100).optional(),
  ukVisaExpiry: z.string().optional(),
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
  appointmentDate:         z.string().optional(),
  bookedById:              z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  appointmentAssignedToId: z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  fileAssignedToId:        z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  fraNo:           z.string().max(100).optional(),
  tlsAccount:      z.string().max(100).optional(),
  appointmentNotes: z.string().optional(),
  // Stage 3
  travelDate:    z.string().optional(),
  hotelDate:     z.string().optional(),
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
  dueDate:  z.string().optional(),
  charges:  z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  advance:  z.number().nonnegative().default(0),
  notes:    z.string().optional(),
});

export const updateInvoiceSchema = z.object({
  dueDate:    z.string().optional(),
  charges:    z.number().nonnegative().optional(),
  discount:   z.number().nonnegative().optional(),
  advance:    z.number().nonnegative().optional(),
  paidAmount: z.number().nonnegative().optional(),
  status:     z.enum(['DRAFT', 'SENT', 'PARTIAL', 'PAID']).optional(),
  notes:      z.string().optional(),
});
