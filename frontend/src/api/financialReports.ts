import api from './axios';
import type { ApiResponse, FinancialReportsData, FinancialReportsFilters, MonthlyReportData, MonthlyReportFilters } from '../types';

export const getFinancialReports = (filters: FinancialReportsFilters) =>
  api.get<ApiResponse<FinancialReportsData>>('/financial-reports', { params: filters }).then(r => r.data);

// Monthly business & operations report (1 Oct 2026 #7): whole calendar months, inclusive.
export const getMonthlyReport = (filters: MonthlyReportFilters) =>
  api.get<ApiResponse<MonthlyReportData>>('/financial-reports/monthly', { params: filters }).then(r => r.data);
