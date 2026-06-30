import { Request, Response } from 'express';
import * as clientService from '../services/client.service';
import * as visaCaseService from '../services/visaCase.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import {
  clientQuerySchema,
  createClientSchema,
  updateClientSchema,
  createCaseSchema,
} from '../validators/client.validators';
import { streamClientPdf } from '../utils/pdf';

export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createClientSchema.parse(req.body);
    const client = await clientService.createClient({ ...data, createdById: req.user?.sub });
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CLIENT_CREATED',
      resource: 'clients',
      resourceId: client.id,
      details: { clientRef: client.clientRef },
      req,
    });
    sendSuccess(res, 'Client created', client, 201);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to create client', 500);
  }
};

export const listClients = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, search, stage, destination } = clientQuerySchema.parse(req.query);
  const result = await clientService.listClients(page, limit, search, stage, destination);
  sendSuccess(res, 'Clients retrieved', result.clients, 200, {
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  });
};

export const getClient = async (req: Request, res: Response): Promise<void> => {
  const client = await clientService.getClientById(req.params.id);
  if (!client) { sendError(res, 'Client not found', 404); return; }
  sendSuccess(res, 'Client retrieved', client);
};

export const updateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = updateClientSchema.parse(req.body);
    const client = await clientService.updateClient(req.params.id, data as any);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CLIENT_UPDATED',
      resource: 'clients',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'Client updated', client);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    if (error?.code === 'P2025') { sendError(res, 'Client not found', 404); return; }
    sendError(res, 'Failed to update client', 500);
  }
};

export const downloadClientPdf = async (req: Request, res: Response): Promise<void> => {
  const client = await clientService.getClientById(req.params.id);
  if (!client) { sendError(res, 'Client not found', 404); return; }
  streamClientPdf(res, client);
};

export const deleteClient = async (req: Request, res: Response): Promise<void> => {
  try {
    await clientService.deleteClient(req.params.id);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CLIENT_DELETED',
      resource: 'clients',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'Client deleted');
  } catch {
    sendError(res, 'Client not found', 404);
  }
};

export const addCase = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createCaseSchema.parse(req.body);
    const visaCase = await visaCaseService.createCase(req.params.id, data);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CASE_CREATED',
      resource: 'clients',
      resourceId: req.params.id,
      details: { caseId: visaCase.id },
      req,
    });
    sendSuccess(res, 'Case created', visaCase, 201);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to create case', 500);
  }
};
