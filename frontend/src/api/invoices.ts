import api from './axios';
import type { ApiResponse, Invoice } from '../types';

export const getInvoices = (params?: Record<string, string>) =>
  api.get<ApiResponse<Invoice[]>>('/invoices', { params }).then(r => r.data);

export const getInvoice = (id: string) =>
  api.get<ApiResponse<Invoice>>(`/invoices/${id}`).then(r => r.data);

export const createInvoice = (data: unknown) =>
  api.post<ApiResponse<Invoice>>('/invoices', data).then(r => r.data);

export const updateInvoice = (id: string, data: unknown) =>
  api.put<ApiResponse<Invoice>>(`/invoices/${id}`, data).then(r => r.data);

export const deleteInvoice = (id: string) =>
  api.delete<ApiResponse<void>>(`/invoices/${id}`).then(r => r.data);
