import { Request, Response } from 'express';
import { z } from 'zod';
import * as invoiceService from '../services/invoice.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { createInvoiceSchema, updateInvoiceSchema } from '../validators/client.validators';
import { streamInvoicePdf } from '../utils/pdf';

const invoiceQuerySchema = z.object({
  page:   z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit:  z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  status: z.string().optional(),
  search: z.string().optional(),
});

export const createInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createInvoiceSchema.parse(req.body);
    const invoice = await invoiceService.createInvoice({ ...data, createdById: req.user?.sub });
    await createAuditLog({
      userId: req.user?.sub,
      action: 'INVOICE_CREATED',
      resource: 'invoices',
      resourceId: invoice.id,
      details: { invoiceRef: invoice.invoiceRef },
      req,
    });
    sendSuccess(res, 'Invoice created', invoice, 201);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to create invoice', 500);
  }
};

export const listInvoices = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, status, search } = invoiceQuerySchema.parse(req.query);
  const result = await invoiceService.listInvoices(page, limit, status, search);
  sendSuccess(res, 'Invoices retrieved', result.invoices, 200, {
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  });
};

export const getInvoice = async (req: Request, res: Response): Promise<void> => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);
  if (!invoice) { sendError(res, 'Invoice not found', 404); return; }
  sendSuccess(res, 'Invoice retrieved', invoice);
};

export const updateInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = updateInvoiceSchema.parse(req.body);
    const invoice = await invoiceService.updateInvoice(req.params.id, data);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'INVOICE_UPDATED',
      resource: 'invoices',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'Invoice updated', invoice);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    if (error?.code === 'P2025' || error?.message === 'NOT_FOUND') {
      sendError(res, 'Invoice not found', 404);
      return;
    }
    sendError(res, 'Failed to update invoice', 500);
  }
};

export const downloadInvoicePdf = async (req: Request, res: Response): Promise<void> => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);
  if (!invoice) { sendError(res, 'Invoice not found', 404); return; }
  streamInvoicePdf(res, invoice);
};

export const deleteInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    await invoiceService.deleteInvoice(req.params.id);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'INVOICE_DELETED',
      resource: 'invoices',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'Invoice deleted');
  } catch {
    sendError(res, 'Invoice not found', 404);
  }
};
