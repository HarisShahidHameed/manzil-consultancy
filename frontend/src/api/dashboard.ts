import api from './axios';
import type { ApiResponse, AnalyticsData, AnalyticsFilters, DashboardStats } from '../types';

export const getDashboardStats = () =>
  api.get<ApiResponse<DashboardStats>>('/dashboard/stats').then(r => r.data);

export const getAnalytics = (filters: AnalyticsFilters) =>
  api.get<ApiResponse<AnalyticsData>>('/dashboard/analytics', { params: filters }).then(r => r.data);
