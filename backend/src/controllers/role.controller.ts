import { Request, Response } from 'express';
import * as roleService from '../services/role.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { paginationSchema } from '../validators/user.validators';

export const listRoles = async (_req: Request, res: Response): Promise<void> => {
  const roles = await roleService.listRoles();
  sendSuccess(res, 'Roles retrieved', roles);
};

export const getRole = async (req: Request, res: Response): Promise<void> => {
  const role = await roleService.getRoleById(req.params.id);
  if (!role) { sendError(res, 'Role not found', 404); return; }
  sendSuccess(res, 'Role retrieved', role);
};

export const createRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await roleService.createRole(req.body);
    await createAuditLog({ userId: req.user?.sub, action: 'ROLE_CREATED', resource: 'roles', resourceId: role.id, req });
    sendSuccess(res, 'Role created', role, 201);
  } catch {
    sendError(res, 'Role name already exists', 409);
  }
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await roleService.updateRole(req.params.id, req.body);
    await createAuditLog({ userId: req.user?.sub, action: 'ROLE_UPDATED', resource: 'roles', resourceId: req.params.id, req });
    sendSuccess(res, 'Role updated', role);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'SYSTEM_ROLE') sendError(res, 'Cannot modify system roles', 403);
    else sendError(res, 'Role not found', 404);
  }
};

export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
    await roleService.deleteRole(req.params.id);
    await createAuditLog({ userId: req.user?.sub, action: 'ROLE_DELETED', resource: 'roles', resourceId: req.params.id, req });
    sendSuccess(res, 'Role deleted');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'SYSTEM_ROLE') sendError(res, 'Cannot delete system roles', 403);
    else sendError(res, 'Role not found', 404);
  }
};

export const setRolePermissions = async (req: Request, res: Response): Promise<void> => {
  const role = await roleService.setRolePermissions(req.params.id, req.body.permissionIds);
  await createAuditLog({
    userId: req.user?.sub,
    action: 'PERMISSIONS_SET',
    resource: 'roles',
    resourceId: req.params.id,
    details: { permissionIds: req.body.permissionIds },
    req,
  });
  sendSuccess(res, 'Permissions updated', role);
};

export const listPermissions = async (_req: Request, res: Response): Promise<void> => {
  const permissions = await roleService.listPermissions();
  sendSuccess(res, 'Permissions retrieved', permissions);
};

export const createPermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const perm = await roleService.createPermission(req.body);
    await createAuditLog({ userId: req.user?.sub, action: 'PERMISSION_CREATED', resource: 'permissions', resourceId: perm.id, req });
    sendSuccess(res, 'Permission created', perm, 201);
  } catch {
    sendError(res, 'A permission with that resource:action already exists', 409);
  }
};

export const updatePermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const perm = await roleService.updatePermission(req.params.permId, req.body);
    await createAuditLog({ userId: req.user?.sub, action: 'PERMISSION_UPDATED', resource: 'permissions', resourceId: req.params.permId, req });
    sendSuccess(res, 'Permission updated', perm);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'NOT_FOUND') sendError(res, 'Permission not found', 404);
    else sendError(res, 'A permission with that resource:action already exists', 409);
  }
};

export const deletePermission = async (req: Request, res: Response): Promise<void> => {
  try {
    await roleService.deletePermission(req.params.permId);
    await createAuditLog({ userId: req.user?.sub, action: 'PERMISSION_DELETED', resource: 'permissions', resourceId: req.params.permId, req });
    sendSuccess(res, 'Permission deleted');
  } catch {
    sendError(res, 'Permission not found', 404);
  }
};

export const listAuditLogs = async (req: Request, res: Response): Promise<void> => {
  const { page, limit } = paginationSchema.parse(req.query);
  const result = await roleService.listAuditLogs(page, limit);
  sendSuccess(res, 'Audit logs retrieved', result.logs, 200, {
    total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages,
  });
};
