import api from './axios';
import type { ApiResponse, VisaCase } from '../types';

export const getCases = (params?: Record<string, string>) =>
  api.get<ApiResponse<VisaCase[]>>('/cases', { params }).then(r => r.data);

export const getCaseFilterOptions = () =>
  api.get<ApiResponse<{ destinations: string[]; cities: string[] }>>('/cases/filter-options').then(r => r.data);

export const getCase = (id: string) =>
  api.get<ApiResponse<VisaCase>>(`/cases/${id}`).then(r => r.data);

export const updateCase = (id: string, data: unknown) =>
  api.put<ApiResponse<VisaCase>>(`/cases/${id}`, data).then(r => r.data);

export const deleteCase = (id: string) =>
  api.delete<ApiResponse<void>>(`/cases/${id}`).then(r => r.data);
