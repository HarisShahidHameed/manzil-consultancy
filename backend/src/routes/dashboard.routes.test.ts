jest.mock('../services/dashboard.service');

import express from 'express';
import request from 'supertest';
import dashboardRoutes from './dashboard.routes';
import * as dashboardService from '../services/dashboard.service';
import { signAccessToken } from '../services/token.service';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRoutes);
  return app;
};

const tokenWithPermissions = (permissions: string[]) =>
  signAccessToken({ sub: 'user-1', email: 'user@manzil.com', roles: ['TEST_ROLE'], permissions });

describe('GET /api/dashboard/analytics', () => {
  const app = buildApp();

  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/dashboard/analytics');
    expect(res.status).toBe(401);
    expect(dashboardService.getAnalytics).not.toHaveBeenCalled();
  });

  it('rejects a malformed/invalid token', async () => {
    const res = await request(app)
      .get('/api/dashboard/analytics')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects an authenticated user without reports:read', async () => {
    const token = tokenWithPermissions(['dashboard:read']);
    const res = await request(app)
      .get('/api/dashboard/analytics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(dashboardService.getAnalytics).not.toHaveBeenCalled();
  });

  it('returns 200 with analytics for a user with reports:read', async () => {
    const fakeAnalytics = { pipeline: {}, financials: {}, demographics: {} };
    (dashboardService.getAnalytics as jest.Mock).mockResolvedValue(fakeAnalytics);
    const token = tokenWithPermissions(['reports:read']);

    const res = await request(app)
      .get('/api/dashboard/analytics')
      .query({ destination: 'UK', dateFrom: '2025-01-01', dateTo: '2025-06-30' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ success: true, message: 'Analytics retrieved', data: fakeAnalytics })
    );
    expect(dashboardService.getAnalytics).toHaveBeenCalledWith({
      destination: 'UK',
      dateFrom: '2025-01-01',
      dateTo: '2025-06-30',
    });
  });

  it('returns 422 for an invalid filter value', async () => {
    const token = tokenWithPermissions(['reports:read']);
    const res = await request(app)
      .get('/api/dashboard/analytics')
      .query({ dateFrom: '01-01-2025' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(dashboardService.getAnalytics).not.toHaveBeenCalled();
  });
});
