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
const CLIENT_STATUS = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']);

// Filters beyond `search` a third party can narrow the client list by — each one
// optional and ANDed together (see publicApi.service.listPublicClients).
const clientFilterFields = {
  nationality:    z.string().optional(),
  passportNumber: z.string().optional(),
  destination:    z.string().optional(),
  city:           z.string().optional(),
  stage:          CASE_STAGE.optional(),
  status:         CLIENT_STATUS.optional(),
  addressCity:    z.string().optional(),
  addressCountry: z.string().optional(),
  phone:          z.string().optional(),
  email:          z.string().optional(),
};
const clientsQuerySchema = listQuerySchema.extend(clientFilterFields);

// The single-client lookup takes the same filters as the list, but requires at least
// one — otherwise "give me the one client matching nothing" is a meaningless request
// (and would non-deterministically return whichever client happens to be newest).
const singleClientQuerySchema = z.object(clientFilterFields).refine(
  (f) => Object.values(f).some((v) => v !== undefined && v !== ''),
  { message: 'At least one filter (e.g. city, addressCountry, nationality, passportNumber) is required' }
);

const updateClientStatusSchema = z.object({ status: CLIENT_STATUS });

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

// This is a public, third-party-facing surface — malformed query params are guaranteed
// to happen eventually, so unlike some internal-only controllers, these can't skip
// try/catch around .parse(): an uncaught ZodError here rejects the handler's promise,
// which Express 4 does not route to the error middleware on its own — left unhandled,
// that crashes the whole Node process (confirmed while building this).
export const listClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, ...filters } = clientsQuerySchema.parse(req.query);
    const result = await publicApiService.listPublicClients(page, limit, filters);
    await logApiKeyAccess(req, 'public_clients');
    sendSuccess(res, 'Clients retrieved', result.clients, 200, {
      total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages,
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to retrieve clients', 500);
  }
};

// Returns exactly one client record, identified by whichever attributes the caller
// has on hand (e.g. ?addressCity=London&addressCountry=UK) rather than our id/clientRef —
// see getClient below for the id/clientRef-based lookup.
export const getSingleClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = singleClientQuerySchema.parse(req.query);
    const client = await publicApiService.getSinglePublicClient(filters);
    if (!client) { sendError(res, 'No client matches the given filters', 404); return; }
    await logApiKeyAccess(req, 'public_clients', client.id);
    sendSuccess(res, 'Client retrieved', client);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      // The "at least one filter" rule is a top-level .refine(), not tied to any single
      // field, so it lands in formErrors rather than fieldErrors — surface it as the
      // message itself, or callers just see an empty `errors: {}` with no explanation.
      const flat = error.flatten();
      sendError(res, flat.formErrors[0] ?? 'Validation failed', 422, flat.fieldErrors);
      return;
    }
    sendError(res, 'Failed to retrieve client', 500);
  }
};

export const updateClientStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = updateClientStatusSchema.parse(req.body);
    const client = await publicApiService.updatePublicClientStatus(req.params.id, status);
    if (!client) { sendError(res, 'Client not found', 404); return; }
    await logApiKeyAccess(req, 'public_clients', client.id);
    sendSuccess(res, 'Client status updated', client);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to update client status', 500);
  }
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
  try {
    const { page, limit, stage } = appointmentsQuerySchema.parse(req.query);
    const result = await publicApiService.listPublicAppointments(page, limit, stage);
    await logApiKeyAccess(req, 'public_appointments');
    sendSuccess(res, 'Appointments retrieved', result.cases, 200, {
      total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages,
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to retrieve appointments', 500);
  }
};

export const getAppointment = async (req: Request, res: Response): Promise<void> => {
  const appointment = await publicApiService.getPublicAppointmentById(req.params.id);
  if (!appointment) { sendError(res, 'Appointment not found', 404); return; }
  await logApiKeyAccess(req, 'public_appointments', appointment.id);
  sendSuccess(res, 'Appointment retrieved', appointment);
};
