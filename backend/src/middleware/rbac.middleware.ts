import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export const requirePermission =
  (...permissions: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    const userPermissions = new Set(req.user.permissions);
    const hasPermission = permissions.every(p => userPermissions.has(p));

    if (!hasPermission) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };

export const requireAnyPermission =
  (...permissions: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    const userPermissions = new Set(req.user.permissions);
    const hasPermission = permissions.some(p => userPermissions.has(p));

    if (!hasPermission) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };

export const requireRole =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    const userRoles = new Set(req.user.roles);
    const hasRole = roles.some(r => userRoles.has(r));

    if (!hasRole) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };

export const requireSelf =
  (paramKey = 'id') =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    const isSelf = req.params[paramKey] === req.user.sub;
    const isAdmin = req.user.roles.includes('SUPER_ADMIN') || req.user.roles.includes('ADMIN');

    if (!isSelf && !isAdmin) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };
