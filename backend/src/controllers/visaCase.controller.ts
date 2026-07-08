import { Request, Response } from 'express';
import { z } from 'zod';
import * as visaCaseService from '../services/visaCase.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { updateCaseSchema } from '../validators/client.validators';
import { streamAdvanceReceiptPdf } from '../utils/pdf';

const caseQuerySchema = z.object({
  page:   z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit:  z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  stage:  z.string().optional(),
  search: z.string().optional(),
  appointmentStatus: z.enum(['WAITING', 'ASSIGNED', 'REGISTERED', 'COMPLETED', 'HOLD', 'DROPPED', 'BACK_UP']).optional(),
});

export const listCases = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, stage, search, appointmentStatus } = caseQuerySchema.parse(req.query);
  const result = await visaCaseService.listCases(page, limit, stage, search, appointmentStatus);
  sendSuccess(res, 'Cases retrieved', result.cases, 200, {
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  });
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
  CLIENT_INFO_INCOMPLETE: { status: 422, message: 'Complete the required client information before this case can move to File Processing.' },
  APPOINTMENT_NOT_BOOKED: { status: 422, message: 'Set the appointment date before moving this case to File Processing.' },
  DUES_PENDING:       { status: 422, message: 'All invoices must be marked Paid before the case can be completed.' },
};

export const updateCase = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = updateCaseSchema.parse(req.body);

    // Stage transitions are gated by team-scoped permissions (separation of duties).
    if (data.stage) {
      const current = await visaCaseService.getCaseStage(req.params.id);
      if (!current) { sendError(res, 'Case not found', 404); return; }
      if (current !== data.stage) {
        const required = visaCaseService.requiredPermsForTransition(current, data.stage);
        const userPerms = req.user?.permissions ?? [];
        const allowed = required.some(p => userPerms.includes(p));
        if (!allowed) {
          sendError(res, `You do not have permission to move this case from ${current} to ${data.stage}.`, 403);
          return;
        }
      }
    }

    const visaCase = await visaCaseService.updateCase(req.params.id, data);
    await createAuditLog({
      userId: req.user?.sub,
      action: data.stage ? 'CASE_STAGE_CHANGED' : 'CASE_UPDATED',
      resource: 'cases',
      resourceId: req.params.id,
      details: { stage: data.stage },
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

export const downloadAdvanceReceipt = async (req: Request, res: Response): Promise<void> => {
  const visaCase = await visaCaseService.getCaseById(req.params.id);
  if (!visaCase) { sendError(res, 'Case not found', 404); return; }
  streamAdvanceReceiptPdf(res, visaCase);
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
