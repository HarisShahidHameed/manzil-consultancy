import api from './axios';
import type { ApiResponse, FinancialReportsData, FinancialReportsFilters } from '../types';

export const getFinancialReports = (filters: FinancialReportsFilters) =>
  api.get<ApiResponse<FinancialReportsData>>('/financial-reports', { params: filters }).then(r => r.data);
