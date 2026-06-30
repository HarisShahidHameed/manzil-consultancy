import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import * as authService from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { paginationSchema } from '../validators/user.validators';

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, roleId } = req.body;
    const user = await authService.registerUser({ email, password, firstName, lastName }, req);
    if (roleId) {
      // Override default USER role with the specified role
      const { prisma } = await import('../config/database');
      const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
      if (defaultRole) {
        await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: defaultRole.id } });
      }
      await userService.assignRoleToUser(user.id, roleId);
    }
    await createAuditLog({
      userId: req.user?.sub,
      action: 'USER_CREATED',
      resource: 'users',
      resourceId: user.id,
      details: { email, roleId },
      req,
    });
    sendSuccess(res, 'User created', { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }, 201);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'EMAIL_TAKEN') sendError(res, 'Email already registered', 409);
    else sendError(res, 'Failed to create user', 500);
  }
};

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, search } = paginationSchema.parse(req.query);
  const result = await userService.listUsers(page, limit, search);
  sendSuccess(res, 'Users retrieved', result.users, 200, {
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  });
};

export const getAssignableUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await userService.listAssignableUsers();
  sendSuccess(res, 'Assignable users retrieved', users);
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  const user = await userService.getUserById(req.params.id);
  if (!user) { sendError(res, 'User not found', 404); return; }
  sendSuccess(res, 'User retrieved', user);
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'USER_UPDATED',
      resource: 'users',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'User updated', user);
  } catch {
    sendError(res, 'User not found', 404);
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  if (req.params.id === req.user?.sub) {
    sendError(res, 'Cannot delete your own account', 400);
    return;
  }
  try {
    await userService.deleteUser(req.params.id);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'USER_DELETED',
      resource: 'users',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'User deleted');
  } catch {
    sendError(res, 'User not found', 404);
  }
};

export const assignRole = async (req: Request, res: Response): Promise<void> => {
  try {
    await userService.assignRoleToUser(req.params.id, req.body.roleId);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'ROLE_ASSIGNED',
      resource: 'users',
      resourceId: req.params.id,
      details: { roleId: req.body.roleId },
      req,
    });
    sendSuccess(res, 'Role assigned');
  } catch {
    sendError(res, 'Failed to assign role', 400);
  }
};

export const removeRole = async (req: Request, res: Response): Promise<void> => {
  try {
    await userService.removeRoleFromUser(req.params.id, req.params.roleId);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'ROLE_REMOVED',
      resource: 'users',
      resourceId: req.params.id,
      details: { roleId: req.params.roleId },
      req,
    });
    sendSuccess(res, 'Role removed');
  } catch {
    sendError(res, 'Failed to remove role', 400);
  }
};

export const getUserLogs = async (req: Request, res: Response): Promise<void> => {
  const { page, limit } = paginationSchema.parse(req.query);
  const result = await userService.getUserAuditLogs(req.params.id, page, limit);
  sendSuccess(res, 'Audit logs retrieved', result.logs, 200, {
    total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages,
  });
};
