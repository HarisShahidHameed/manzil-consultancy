import { describe, it, expect, vi } from 'vitest';

vi.mock('./axios', () => ({
  default: { get: vi.fn() },
}));

import api from './axios';
import { getAnalytics, getDashboardStats } from './dashboard';

describe('dashboard api client', () => {
  it('getDashboardStats calls /dashboard/stats and unwraps the response data', async () => {
    const payload = { data: { message: 'ok' } };
    (api.get as any).mockResolvedValue(payload);

    const result = await getDashboardStats();

    expect(api.get).toHaveBeenCalledWith('/dashboard/stats');
    expect(result).toBe(payload.data);
  });

  it('getAnalytics calls /dashboard/analytics with the filters as query params', async () => {
    const payload = { data: { message: 'ok' } };
    (api.get as any).mockResolvedValue(payload);

    const filters = { dateFrom: '2025-01-01', destination: 'UK' };
    const result = await getAnalytics(filters);

    expect(api.get).toHaveBeenCalledWith('/dashboard/analytics', { params: filters });
    expect(result).toBe(payload.data);
  });

  it('getAnalytics passes an empty filters object through unchanged', async () => {
    const payload = { data: {} };
    (api.get as any).mockResolvedValue(payload);

    await getAnalytics({});

    expect(api.get).toHaveBeenCalledWith('/dashboard/analytics', { params: {} });
  });
});
