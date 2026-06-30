import { Router } from 'express';
import * as roleController from '../controllers/role.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createRoleSchema, updateRoleSchema, setPermissionsSchema,
  createPermissionSchema, updatePermissionSchema,
} from '../validators/user.validators';

const router = Router();

router.use(authenticate);

// ── permissions sub-resource (static paths BEFORE /:id) ──────────────────
router.get('/permissions', requirePermission('permissions:read'), roleController.listPermissions);
router.post('/permissions', requirePermission('permissions:write'), validate(createPermissionSchema), roleController.createPermission);
router.put('/permissions/:permId', requirePermission('permissions:write'), validate(updatePermissionSchema), roleController.updatePermission);
router.delete('/permissions/:permId', requirePermission('permissions:delete'), roleController.deletePermission);

router.get('/audit-logs', requirePermission('audit:read'), roleController.listAuditLogs);

router.get('/', requirePermission('roles:read'), roleController.listRoles);
router.post('/', requirePermission('roles:write'), validate(createRoleSchema), roleController.createRole);
router.get('/:id', requirePermission('roles:read'), roleController.getRole);
router.put('/:id', requirePermission('roles:write'), validate(updateRoleSchema), roleController.updateRole);
router.delete('/:id', requirePermission('roles:delete'), roleController.deleteRole);
router.put('/:id/permissions', requirePermission('permissions:write'), validate(setPermissionsSchema), roleController.setRolePermissions);

export default router;
