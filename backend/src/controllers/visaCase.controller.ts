import { Request, Response } from 'express';
import { z } from 'zod';
import * as visaCaseService from '../services/visaCase.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { updateCaseSchema } from '../validators/client.validators';
import { streamAdvanceReceiptPdf, streamInvoicePdf } from '../utils/pdf';

// Exported so the service tests can drive the real coercion the wire uses, rather than a
// hand-rolled copy of it — a metric card's filters have to survive this exact round trip.
export const caseQuerySchema = z.object({
  page:   z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit:  z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  stage:  z.string().optional(),
  search: z.string().optional(),
  appointmentStatus: z.enum(['WAITING', 'ASSIGNED', 'REGISTERED', 'COMPLETED', 'HOLD', 'DROPPED', 'BACK_UP', 'MISSED']).optional(),
  destination: z.string().optional(),
  city:        z.string().optional(),
  // Advance settlement is three states, not a boolean: a waived advance (prior refusal /
  // free service) is settled without money, so it is neither Paid nor Unpaid and needs to
  // be askable in its own right. See ADVANCE_STATE_WHERE in visaCase.service.
  advanceState: z.enum(['paid', 'unpaid', 'waived']).optional(),
  // Deprecated: the pre-waiver boolean, kept so the documented API surface and any
  // third-party integration built against it keep working. The service folds it onto the
  // same predicates as advanceState (true → paid, false → unpaid), and advanceState wins
  // if both arrive.
  advancePaid: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
  onHold:      z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
  serviceType: z.enum(['APPOINTMENT_ONLY', 'FULL_SERVICE']).optional(),
  // A uuid picks one file handler; the 'none' sentinel is the "Unassigned" tab, which a
  // uuid-only schema had no way to express even though a just-routed case has no handler yet.
  fileAssignedToId: z.union([z.literal('none'), z.string().uuid()]).optional(),
  // "Appointment allotted" conversion card — cases that already have an appointment date booked.
  hasAppointmentDate: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
  // Listing order. Each page has a sensible default (see visaCaseService.listCases); these
  // let the File Processing view swap between newest-routed-first and the by-deadline
  // "earliest appointment due first" ordering without either one being lost.
  sort:  z.enum(['routedAt', 'appointmentDate', 'receivedDate', 'createdAt']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  // Metric-card drill-down: the half-open window [from, to) a card counted over, sent back
  // verbatim so the modal lands on exactly those rows. `dateField` is an enum rather than a
  // free string — the service would otherwise be handed an arbitrary Prisma column name.
  from: z.string().datetime({ offset: true }).optional().transform(v => v ? new Date(v) : undefined),
  to:   z.string().datetime({ offset: true }).optional().transform(v => v ? new Date(v) : undefined),
  dateField: z.enum(visaCaseService.CASE_DATE_FIELDS).optional(),
}).refine(q => !(q.from || q.to) || q.dateField !== undefined, {
  // A range with no column to range over would silently count the wrong event, so it is a
  // client error rather than a guess.
  path: ['dateField'],
  message: 'dateField is required when from or to is supplied',
});

export const listCases = async (req: Request, res: Response): Promise<void> => {
  let query: z.infer<typeof caseQuerySchema>;
  try {
    query = caseQuerySchema.parse(req.query);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      // 400 rather than the 500 an unhandled ZodError would fall through to: an unknown
      // dateField or a range missing one is the caller's mistake, not the server's.
      sendError(res, 'Invalid case filters', 400, error.flatten().fieldErrors);
      return;
    }
    throw error;
  }
  const result = await visaCaseService.listCases(query);
  sendSuccess(res, 'Cases retrieved', result.cases, 200, {
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  });
};

// The three appointment funnel cards (Appointment Date Allotted / Moved to File Processing
// / Appointment Only), each split into Today / Yesterday / Month calendar buckets.
//
// Each card also carries the /api/cases params that reproduce it and the half-open ranges
// the server counted over, so clicking a number can open exactly those rows — the browser
// must not recompute "today" for itself, since its timezone need not be the agency's.
export const getAppointmentMetrics = async (_req: Request, res: Response): Promise<void> => {
  const metrics = await visaCaseService.getAppointmentMetrics();
  sendSuccess(res, 'Appointment metrics retrieved', metrics);
};

export const getCase = async (req: Request, res: Response): Promise<void> => {
  const visaCase = await visaCaseService.getCaseById(req.params.id);
  if (!visaCase) { sendError(res, 'Case not found', 404); return; }
  sendSuccess(res, 'Case retrieved', visaCase);
};

const WORKFLOW_ERRORS: Record<string, { status: number; message: string }> = {
  STAGE_TERMINAL:     { status: 409, message: 'This case is already completed or cancelled and cannot change stage.' },
  STAGE_SKIP:         { status: 409, message: 'Stages must be completed in order — you cannot skip a stage.' },
  STAGE_INVALID:      { status: 422, message: 'Invalid stage transition.' },
  ON_HOLD:            { status: 409, message: 'This case is paused. Resume it before moving to the next stage.' },
  CLIENT_INFO_INCOMPLETE: { status: 422, message: 'Complete the required client information before this case can move past the Appointment stage.' },
  APPOINTMENT_DATE_LOCKED: { status: 409, message: 'The appointment date can only be removed while the case is in the Appointment stage. Move it back to Appointments first.' },
  APPOINTMENT_PAYER_REQUIRED: { status: 422, message: 'Select who paid for the appointment (Client or Agency) when setting the appointment date.' },
  APPOINTMENT_PAYER_LOCKED: { status: 403, message: 'Who paid for the appointment was recorded by the Appointment team. Only a Super Admin can change it now.' },
  APPOINTMENT_NOT_BOOKED: { status: 422, message: 'Set the appointment date before moving this case past the Appointment stage.' },
  DUES_PENDING:       { status: 422, message: 'All invoices must be marked Paid before the case can be completed.' },
  DESTINATION_NOT_FINALIZED: { status: 422, message: 'Finalize a single destination from the shortlist before moving this case to Invoiced.' },
  DESTINATION_NOT_SHORTLISTED: { status: 422, message: 'The finalized destination must be one of the shortlisted options.' },
  CITY_NOT_FINALIZED: { status: 422, message: 'Finalize a single city from the shortlist before moving this case to Invoiced.' },
  CITY_NOT_SHORTLISTED: { status: 422, message: 'The finalized city must be one of the shortlisted options.' },
};

export const updateCase = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = updateCaseSchema.parse(req.body);

    // Stage transitions are gated by team-scoped permissions (separation of duties).
    if (data.stage) {
      const current = await visaCaseService.getCaseStage(req.params.id);
      if (!current) { sendError(res, 'Case not found', 404); return; }
      if (visaCaseService.isRevertToAppointment(current, data.stage)) {
        // A role, not a permission: this undoes a hand-over, so it is reserved for Super
        // Admins whatever team permissions anyone else holds.
        if (!req.user?.roles?.includes(visaCaseService.REVERT_ROLE)) {
          sendError(res, 'Only a Super Admin can move a case back from File Processing to Appointments.', 403);
          return;
        }
      } else if (current !== data.stage) {
        const required = visaCaseService.requiredPermsForTransition(current, data.stage);
        const userPerms = req.user?.permissions ?? [];
        const allowed = required.some(p => userPerms.includes(p));
        if (!allowed) {
          sendError(res, `You do not have permission to move this case from ${current} to ${data.stage}.`, 403);
          return;
        }
      }
    }

    const visaCase = await visaCaseService.updateCase(req.params.id, data, { actorEmail: req.user?.email, actorRoles: req.user?.roles });
    await createAuditLog({
      userId: req.user?.sub,
      action: data.stage ? 'CASE_STAGE_CHANGED' : 'CASE_UPDATED',
      resource: 'cases',
      resourceId: req.params.id,
      details: { stage: data.stage, ...(data.revertReason ? { revertReason: data.revertReason } : {}) },
      req,
    });
    sendSuccess(res, 'Case updated', visaCase);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    const wf = WORKFLOW_ERRORS[error?.message];
    if (wf) {
      const errors = error.missingFields ? { missingFields: error.missingFields } : undefined;
      sendError(res, wf.message, wf.status, errors);
      return;
    }
    if (error?.code === 'P2025') { sendError(res, 'Case not found', 404); return; }
    sendError(res, 'Failed to update case', 500);
  }
};

// Combines "Advance to Invoiced" with auto-invoice generation and immediate completion —
// see visaCaseService.advanceToInvoicedWithInvoice for the workflow rationale.
export const advanceToInvoiced = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await visaCaseService.advanceToInvoicedWithInvoice(req.params.id, {
      createdById: req.user?.sub,
    });
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CASE_STAGE_CHANGED',
      resource: 'cases',
      resourceId: req.params.id,
      details: { stage: 'COMPLETED', invoiceId: result.invoice.id, invoiceRef: result.invoice.invoiceRef },
      req,
    });
    await createAuditLog({
      userId: req.user?.sub,
      action: 'INVOICE_CREATED',
      resource: 'invoices',
      resourceId: result.invoice.id,
      details: { caseId: req.params.id, auto: true },
      req,
    });
    sendSuccess(res, 'Invoice created and case completed', result);
  } catch (error: any) {
    const wf = WORKFLOW_ERRORS[error?.message];
    if (wf) { sendError(res, wf.message, wf.status); return; }
    if (error?.code === 'P2025') { sendError(res, 'Case not found', 404); return; }
    sendError(res, 'Failed to advance case', 500);
  }
};

export const downloadAdvanceReceipt = async (req: Request, res: Response): Promise<void> => {
  const visaCase = await visaCaseService.getCaseById(req.params.id);
  if (!visaCase) { sendError(res, 'Case not found', 404); return; }
  streamAdvanceReceiptPdf(res, visaCase);
};

export const downloadReceiptPreview = async (req: Request, res: Response): Promise<void> => {
  const preview = await visaCaseService.buildInvoicePreview(req.params.id);
  if (!preview) { sendError(res, 'Case not found', 404); return; }
  streamInvoicePdf(res, preview);
};

export const deleteCase = async (req: Request, res: Response): Promise<void> => {
  try {
    await visaCaseService.deleteCase(req.params.id);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CASE_DELETED',
      resource: 'cases',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'Case deleted');
  } catch {
    sendError(res, 'Case not found', 404);
  }
};
