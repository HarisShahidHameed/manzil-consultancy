import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { sendSuccess, sendError } from '../utils/response';

export const getStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await dashboardService.getDashboardStats();
    sendSuccess(res, 'Dashboard stats retrieved', stats);
  } catch {
    sendError(res, 'Failed to retrieve stats', 500);
  }
};
