import api from './axios';
import type { ApiResponse, VisaCase, Invoice } from '../types';

export type AdvanceToInvoicedResult = {
  invoice: Pick<Invoice, 'id' | 'invoiceRef' | 'totalAmount' | 'outstanding' | 'status' | 'issueDate'>;
  case: VisaCase;
};

export const getCases = (params?: Record<string, string>) =>
  api.get<ApiResponse<VisaCase[]>>('/cases', { params }).then(r => r.data);

export const getCase = (id: string) =>
  api.get<ApiResponse<VisaCase>>(`/cases/${id}`).then(r => r.data);

export const updateCase = (id: string, data: unknown) =>
  api.put<ApiResponse<VisaCase>>(`/cases/${id}`, data).then(r => r.data);

export const deleteCase = (id: string) =>
  api.delete<ApiResponse<void>>(`/cases/${id}`).then(r => r.data);

export const advanceToInvoiced = (id: string) =>
  api.post<ApiResponse<AdvanceToInvoicedResult>>(`/cases/${id}/advance-to-invoiced`).then(r => r.data);
