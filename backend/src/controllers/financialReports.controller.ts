import { Request, Response } from 'express';
import * as financialReportsService from '../services/financialReports.service';
import { sendSuccess, sendError } from '../utils/response';
import { financialReportsQuerySchema } from '../validators/financialReports.validators';

export const getFinancialReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = financialReportsQuerySchema.parse(req.query);
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
