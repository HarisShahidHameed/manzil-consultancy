import { Request, Response } from 'express';
import * as financialReportsService from '../services/financialReports.service';
import { sendSuccess, sendError } from '../utils/response';
import { financialReportsQuerySchema, monthlyReportQuerySchema } from '../validators/financialReports.validators';
import * as monthlyReportService from '../services/monthlyReport.service';

// Only these accounts see the firm-wide report. Everyone else is scoped to cases they were
// booked on / appointment-handled / file-handled — enforced server-side so a client can't
// widen scope by simply omitting or altering the assignedToId query param.
const FULL_ACCESS_EMAILS = new Set(['admin@manzilconsultancy.com', 'admin@manzil.com']);

export const getFinancialReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = financialReportsQuerySchema.parse(req.query);
    const hasFullAccess = !!req.user?.email && FULL_ACCESS_EMAILS.has(req.user.email.toLowerCase());
    if (!hasFullAccess) {
      if (!req.user?.sub) {
        sendError(res, 'Unauthorized', 401);
        return;
      }
      filters.assignedToId = req.user.sub;
    }
    const report = await financialReportsService.getFinancialReports(filters);
    sendSuccess(res, 'Financial reports retrieved', report);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to retrieve financial reports', 500);
  }
};

// Monthly business & operations report (1 Oct 2026 #7). Same access rule as the financial
// report above: the two full-access accounts see the whole firm (and may narrow it to one
// member of staff); everyone else is pinned server-side to the cases they handled.
export const getMonthlyReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = monthlyReportQuerySchema.parse(req.query);
    const hasFullAccess = !!req.user?.email && FULL_ACCESS_EMAILS.has(req.user.email.toLowerCase());
    if (!hasFullAccess) {
      if (!req.user?.sub) { sendError(res, 'Unauthorized', 401); return; }
      query.assignedToId = req.user.sub;
    }
    const report = await monthlyReportService.getMonthlyReport(query);
    sendSuccess(res, 'Monthly report retrieved', report);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to retrieve monthly report', 500);
  }
};
