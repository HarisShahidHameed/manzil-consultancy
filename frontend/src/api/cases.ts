import api from './axios';
import type { ApiResponse, AppointmentMetrics, VisaCase, Invoice } from '../types';

export type AdvanceToInvoicedResult = {
  invoice: Pick<Invoice, 'id' | 'invoiceRef' | 'totalAmount' | 'outstanding' | 'status' | 'issueDate'>;
  case: VisaCase;
};

// Flat param bag ANDed together server-side. Besides the listing filters it accepts the
// half-open date window `from`/`to` plus `dateField` (appointmentDateSetAt |
// fileProcessingStartedAt | createdAt), which is what the funnel cards' drill-down uses.
export const getCases = (params?: Record<string, string>) =>
  api.get<ApiResponse<VisaCase[]>>('/cases', { params }).then(r => r.data);

// Today/Yesterday/Month-to-date counts for the three funnel cards above the
// Appointment and File Processing listings. Aggregated server-side because the
// buckets are calendar-based and can't be derived from a single paged /cases query.
// The payload also carries, per card, the exact `/cases` filters behind it and, per
// bucket, the [from, to) instants the server used — so a drill-down reproduces the
// printed count without the browser guessing at the agency's calendar day.
export const getAppointmentMetrics = () =>
  api.get<ApiResponse<AppointmentMetrics>>('/cases/metrics/appointments').then(r => r.data);

export const getCase = (id: string) =>
  api.get<ApiResponse<VisaCase>>(`/cases/${id}`).then(r => r.data);

export const updateCase = (id: string, data: unknown) =>
  api.put<ApiResponse<VisaCase>>(`/cases/${id}`, data).then(r => r.data);

export const deleteCase = (id: string) =>
  api.delete<ApiResponse<void>>(`/cases/${id}`).then(r => r.data);

export const advanceToInvoiced = (id: string) =>
  api.post<ApiResponse<AdvanceToInvoicedResult>>(`/cases/${id}/advance-to-invoiced`).then(r => r.data);
