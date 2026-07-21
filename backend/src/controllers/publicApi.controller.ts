import { Request, Response } from 'express';
import { z } from 'zod';
import * as publicApiService from '../services/publicApi.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';

const listQuerySchema = z.object({
  page:   z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit:  z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  search: z.string().optional(),
});

const appointmentsQuerySchema = listQuerySchema.extend({
  stage: z.enum(['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED', 'CANCELLED']).optional(),
});

// Every hit is logged against the API key (not a user) so usage is auditable —
// same audit trail as an internal user's actions, keyed off the key's id/name instead.
const logApiKeyAccess = (req: Request, resource: string, resourceId?: string) =>
  createAuditLog({
    action: 'API_KEY_ACCESS',
    resource,
    resourceId,
    details: { apiKeyId: req.apiKey?.id, apiKeyName: req.apiKey?.name, path: req.originalUrl },
    req,
  });

export const listClients = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, search } = listQuerySchema.parse(req.query);
  const result = await publicApiService.listPublicClients(page, limit, search);
  await logApiKeyAccess(req, 'public_clients');
  sendSuccess(res, 'Clients retrieved', result.clients, 200, {
    total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages,
  });
};

export const getClient = async (req: Request, res: Response): Promise<void> => {
  const client = await publicApiService.getPublicClientById(req.params.id);
  if (!client) { sendError(res, 'Client not found', 404); return; }
  await logApiKeyAccess(req, 'public_clients', client.id);
  sendSuccess(res, 'Client retrieved', client);
};

export const listAppointments = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, stage } = appointmentsQuerySchema.parse(req.query);
  const result = await publicApiService.listPublicAppointments(page, limit, stage);
  await logApiKeyAccess(req, 'public_appointments');
  sendSuccess(res, 'Appointments retrieved', result.cases, 200, {
    total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages,
  });
};

export const getAppointment = async (req: Request, res: Response): Promise<void> => {
  const appointment = await publicApiService.getPublicAppointmentById(req.params.id);
  if (!appointment) { sendError(res, 'Appointment not found', 404); return; }
  await logApiKeyAccess(req, 'public_appointments', appointment.id);
  sendSuccess(res, 'Appointment retrieved', appointment);
};
