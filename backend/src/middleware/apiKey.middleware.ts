import { Request, Response, NextFunction } from 'express';
import { findActiveApiKeyByRaw, touchApiKeyLastUsed } from '../services/apiKey.service';
import { sendError } from '../utils/response';

export interface ApiKeyContext {
  id: string;
  name: string;
  scopes: string[];
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
    }
  }
}

// Third-party integrations authenticate with a static key instead of logging in —
// no user session, no JWT. See docs/PUBLIC_API.md for how a consumer is expected
// to call these endpoints.
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const raw = req.header('X-API-Key');
  if (!raw) {
    sendError(res, 'Missing API key. Pass it in the X-API-Key header.', 401);
    return;
  }

  try {
    const key = await findActiveApiKeyByRaw(raw);
    if (!key) {
      sendError(res, 'Invalid, inactive, or expired API key', 401);
      return;
    }
    req.apiKey = { id: key.id, name: key.name, scopes: key.scopes };
    touchApiKeyLastUsed(key.id);
    next();
  } catch {
    sendError(res, 'Authentication failed', 500);
  }
};

export const requireApiScope =
  (...scopes: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      sendError(res, 'Unauthorized', 401);
      return;
    }
    const granted = new Set(req.apiKey.scopes);
    const hasScope = scopes.every(s => granted.has(s));
    if (!hasScope) {
      sendError(res, 'This API key does not have the required scope', 403);
      return;
    }
    next();
  };
