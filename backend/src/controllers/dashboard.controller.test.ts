jest.mock('../services/dashboard.service');

import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { getAnalytics } from './dashboard.controller';

const mockRes = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('dashboard.controller getAnalytics', () => {
  it('returns 200 with the analytics payload for a valid query', async () => {
    const fakeAnalytics = { pipeline: {}, financials: {}, demographics: {} };
    (dashboardService.getAnalytics as jest.Mock).mockResolvedValue(fakeAnalytics);

    const req = { query: { destination: 'UK' } } as unknown as Request;
    const res = mockRes();

    await getAnalytics(req, res);

    expect(dashboardService.getAnalytics).toHaveBeenCalledWith({ destination: 'UK' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Analytics retrieved', data: fakeAnalytics })
    );
  });

  it('returns 422 with field errors when the query fails validation', async () => {
    const req = { query: { dateFrom: 'not-a-date' } } as unknown as Request;
    const res = mockRes();

    await getAnalytics(req, res);

    expect(dashboardService.getAnalytics).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Validation failed',
        errors: expect.objectContaining({ dateFrom: expect.any(Array) }),
      })
    );
  });

  it('returns 422 for a malformed assignedToId', async () => {
    const req = { query: { assignedToId: 'not-a-uuid' } } as unknown as Request;
    const res = mockRes();

    await getAnalytics(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    (dashboardService.getAnalytics as jest.Mock).mockRejectedValue(new Error('db exploded'));

    const req = { query: {} } as unknown as Request;
    const res = mockRes();

    await getAnalytics(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Failed to retrieve analytics' })
    );
  });
});
