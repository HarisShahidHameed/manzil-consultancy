import { Request, Response } from 'express';
import { z } from 'zod';
import * as publicApiService from '../services/publicApi.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { createPublicClientSchema } from '../validators/client.validators';

const listQuerySchema = z.object({
  page:   z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit:  z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  search: z.string().optional(),
});

const CASE_STAGE = z.enum(['APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED', 'CANCELLED']);

// Filters beyond `search` a third party can narrow the client list by — each one
// optional and ANDed together (see publicApi.service.listPublicClients).
const clientsQuerySchema = listQuerySchema.extend({
  nationality:    z.string().optional(),
  passportNumber: z.string().optional(),
  destination:    z.string().optional(),
  city:           z.string().optional(),
  stage:          CASE_STAGE.optional(),
});

const appointmentsQuerySchema = listQuerySchema.extend({
  stage: CASE_STAGE.optional(),
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
  const { page, limit, search, nationality, passportNumber, destination, city, stage } = clientsQuerySchema.parse(req.query);
  const result = await publicApiService.listPublicClients(page, limit, { search, nationality, passportNumber, destination, city, stage });
  await logApiKeyAccess(req, 'public_clients');
  sendSuccess(res, 'Clients retrieved', result.clients, 200, {
    total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages,
  });
};

export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createPublicClientSchema.parse(req.body);
    const created = await publicApiService.createPublicClient({
      ...data,
      receivedDate: data.receivedDate || new Date().toISOString().split('T')[0],
    });
    await logApiKeyAccess(req, 'public_clients', created?.id);
    sendSuccess(res, 'Client created', created, 201);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    if (error?.code === 'P2002') {
      sendError(res, 'A client with this passport number already exists', 409);
      return;
    }
    sendError(res, 'Failed to create client', 500);
  }
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
