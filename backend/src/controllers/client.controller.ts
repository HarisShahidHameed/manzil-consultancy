import { Request, Response } from 'express';
import * as clientService from '../services/client.service';
import * as visaCaseService from '../services/visaCase.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { z } from 'zod';
import {
  clientQuerySchema,
  createClientSchema,
  importClientSchema,
  updateClientSchema,
  createCaseSchema,
  appendHrCommentSchema,
} from '../validators/client.validators';
import { streamClientPdf } from '../utils/pdf';
import * as clientCreationLock from '../services/clientCreationLock.service';
import { prisma } from '../config/database';

export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createClientSchema.parse(req.body);
    // Backstop for the exclusive Add Client lock: another person holding a live lock means
    // this form should never have been open. Imports and the public API are not gated.
    await clientCreationLock.assertMayCreate(req.user?.sub);
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
    if (error?.message === 'CLIENT_CREATION_LOCKED') {
      sendError(res, `${error.holder.holderName} is currently adding a client. Please wait until they finish.`, 409);
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

// Advisory duplicate check the client form fires per debounced keystroke while a
// passport number is being typed. Never rejects: a blank/garbage query is simply "no
// match", because a 400 mid-typing would surface as an error toast on every character.
// That's also why the query is read straight off req.query instead of going through a
// zod schema that would throw.
export const checkPassport = async (req: Request, res: Response): Promise<void> => {
  try {
    const passportNumber = typeof req.query.passportNumber === 'string' ? req.query.passportNumber : '';
    // Sent when editing, so the client being edited doesn't match itself.
    const excludeClientId = typeof req.query.excludeClientId === 'string' && req.query.excludeClientId
      ? req.query.excludeClientId
      : undefined;
    const result = await clientService.findClientByPassport(passportNumber, excludeClientId);
    sendSuccess(res, result.exists ? 'Existing client found' : 'No matching client', result);
  } catch {
    sendError(res, 'Failed to check passport number', 500);
  }
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
    if (error?.message === 'CLIENT_LOCKED') { sendError(res, 'This client is locked because all cases are completed', 409); return; }
    sendError(res, 'Failed to update client', 500);
  }
};

export const appendHrComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phase, text } = appendHrCommentSchema.parse(req.body);
    const client = await clientService.appendClientHrComment(req.params.id, phase, text);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'CLIENT_HR_COMMENT_ADDED',
      resource: 'clients',
      resourceId: req.params.id,
      details: { phase },
      req,
    });
    sendSuccess(res, 'Comment added', client);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    if (error?.code === 'P2025') { sendError(res, 'Client not found', 404); return; }
    sendError(res, 'Failed to add comment', 500);
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

export const importClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = z.object({ rows: z.array(z.record(z.unknown())).min(1).max(500) }).parse(req.body);

    const validated: Parameters<typeof clientService.bulkImportClients>[0] = [];
    const parseErrors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const result = importClientSchema.safeParse(rows[i]);
      if (result.success) {
        // Schema guarantees at least one of the two is set; fall back to whichever is present.
        const { firstName, lastName, ...restData } = result.data;
        validated.push({ ...restData, firstName: firstName ?? lastName!, lastName });
      } else {
        parseErrors.push({ row: i + 1, message: Object.values(result.error.flatten().fieldErrors).flat().join(', ') });
      }
    }

    const importResult = await clientService.bulkImportClients(validated, req.user?.sub);
    importResult.failed  += parseErrors.length;
    importResult.errors   = [...parseErrors, ...importResult.errors];

    await createAuditLog({ userId: req.user?.sub, action: 'CLIENTS_IMPORTED', resource: 'clients', details: { imported: importResult.imported, failed: importResult.failed }, req });
    sendSuccess(res, `Import complete: ${importResult.imported} imported, ${importResult.failed} failed`, importResult);
  } catch (error: any) {
    if (error?.name === 'ZodError') { sendError(res, 'Invalid request body', 422, error.flatten().fieldErrors); return; }
    sendError(res, 'Import failed', 500);
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

// ── Exclusive Add Client lock (1 Oct 2026 #8) ────────────────────────────────────────────
// The Add Client form takes this lock when it opens and heartbeats it while open; anyone
// else clicking Add Client in the meantime is told who is busy instead of getting the form.

const lockTokenSchema = z.object({ token: z.string().min(8).max(100) });

const lockHolderView = (h: clientCreationLock.LockHolder) => ({
  holderId: h.holderId, holderName: h.holderName, since: h.acquiredAt,
});

const actorName = async (userId: string, fallback: string): Promise<string> => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return u ? `${u.firstName} ${u.lastName}`.trim() : fallback;
};

export const getCreationLock = async (_req: Request, res: Response): Promise<void> => {
  const holder = await clientCreationLock.currentHolder();
  sendSuccess(res, 'Add Client lock status', {
    locked: !!holder,
    holder: holder ? lockHolderView(holder) : null,
    heartbeatMs: clientCreationLock.HEARTBEAT_MS,
  });
};

export const acquireCreationLock = async (req: Request, res: Response): Promise<void> => {
  const parsed = lockTokenSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 'Validation failed', 422, parsed.error.flatten().fieldErrors); return; }
  if (!req.user?.sub) { sendError(res, 'Unauthorized', 401); return; }
  const name = await actorName(req.user.sub, req.user.email);
  const result = await clientCreationLock.acquire({ id: req.user.sub, name }, parsed.data.token);
  if (!result.acquired) {
    sendError(res, `${result.holder.holderName} is currently adding a client. Please wait until they finish.`, 409);
    return;
  }
  sendSuccess(res, 'Add Client lock held', {
    holder: lockHolderView(result.holder),
    heartbeatMs: clientCreationLock.HEARTBEAT_MS,
  });
};

export const releaseCreationLock = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.sub) { sendError(res, 'Unauthorized', 401); return; }
  // ?force=true lets a Super Admin clear a lock someone walked away from.
  if (req.query.force === 'true') {
    if (!req.user.roles?.includes('SUPER_ADMIN')) { sendError(res, 'Only a Super Admin can force-release the Add Client lock.', 403); return; }
    await clientCreationLock.forceRelease();
    await createAuditLog({ userId: req.user.sub, action: 'CLIENT_LOCK_FORCE_RELEASED', resource: 'clients', req });
    sendSuccess(res, 'Add Client lock released');
    return;
  }
  const token = typeof req.query.token === 'string' ? req.query.token : (req.body?.token as string | undefined);
  if (token) await clientCreationLock.release(req.user.sub, token);
  sendSuccess(res, 'Add Client lock released');
};
