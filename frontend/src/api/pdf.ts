import api from './axios';

// Fetches a PDF (with the auth token attached by the axios interceptor) and
// triggers a browser download.
const downloadPdf = async (url: string, filename: string): Promise<void> => {
  const res = await api.get(url, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
};

export const downloadClientPdf = (clientId: string, ref: string) =>
  downloadPdf(`/clients/${clientId}/pdf`, `${ref}-profile.pdf`);

export const downloadAdvanceReceipt = (caseId: string, ref: string) =>
  downloadPdf(`/cases/${caseId}/advance-receipt`, `ADV-${ref}-receipt.pdf`);

export const downloadInvoicePdf = (invoiceId: string, ref: string) =>
  downloadPdf(`/invoices/${invoiceId}/receipt`, `${ref}.pdf`);
