import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { sendSuccess, sendError } from '../utils/response';
import { analyticsQuerySchema } from '../validators/dashboard.validators';

export const getStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await dashboardService.getDashboardStats();
    sendSuccess(res, 'Dashboard stats retrieved', stats);
  } catch {
    sendError(res, 'Failed to retrieve stats', 500);
  }
};

export const getAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = analyticsQuerySchema.parse(req.query);
    const analytics = await dashboardService.getAnalytics(filters);
    sendSuccess(res, 'Analytics retrieved', analytics);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to retrieve analytics', 500);
  }
};
