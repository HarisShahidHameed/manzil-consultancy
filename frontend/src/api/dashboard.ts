import api from './axios';
import type { ApiResponse, DashboardStats } from '../types';

export const getDashboardStats = () =>
  api.get<ApiResponse<DashboardStats>>('/dashboard/stats').then(r => r.data);
