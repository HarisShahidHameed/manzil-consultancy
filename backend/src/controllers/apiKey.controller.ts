import { Request, Response } from 'express';
import * as apiKeyService from '../services/apiKey.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { createApiKeySchema } from '../validators/client.validators';

export const createApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createApiKeySchema.parse(req.body);
    const key = await apiKeyService.createApiKey({ ...data, createdById: req.user?.sub });
    await createAuditLog({
      userId: req.user?.sub,
      action: 'API_KEY_CREATED',
      resource: 'api_keys',
      resourceId: key.id,
      details: { name: key.name, scopes: key.scopes },
      req,
    });
    // rawKey is only ever present on this one response — the caller must copy it now.
    sendSuccess(res, 'API key created — copy it now, it will not be shown again', key, 201);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to create API key', 500);
  }
};

export const listApiKeys = async (_req: Request, res: Response): Promise<void> => {
  const keys = await apiKeyService.listApiKeys();
  sendSuccess(res, 'API keys retrieved', keys);
};

export const revokeApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const key = await apiKeyService.revokeApiKey(req.params.id);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'API_KEY_REVOKED',
      resource: 'api_keys',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'API key revoked', key);
  } catch {
    sendError(res, 'API key not found', 404);
  }
};

export const deleteApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    await apiKeyService.deleteApiKey(req.params.id);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'API_KEY_DELETED',
      resource: 'api_keys',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'API key deleted');
  } catch {
    sendError(res, 'API key not found', 404);
  }
};
