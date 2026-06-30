import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, requireAnyPermission, requireSelf } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { updateUserSchema, assignRoleSchema, createUserSchema } from '../validators/user.validators';

const router = Router();

router.use(authenticate);

// Assignment dropdown source — available to anyone who can edit a case (static path before /:id)
router.get(
  '/assignable',
  requireAnyPermission('appointments:write', 'files:write', 'clients:write', 'users:read'),
  userController.getAssignableUsers
);

router.get('/', requirePermission('users:read'), userController.listUsers);
router.post('/', requirePermission('users:write'), validate(createUserSchema), userController.createUser);
router.get('/:id', requireSelf(), userController.getUser);
router.put('/:id', requirePermission('users:write'), validate(updateUserSchema), userController.updateUser);
router.delete('/:id', requirePermission('users:delete'), userController.deleteUser);

router.post('/:id/roles', requirePermission('users:write'), validate(assignRoleSchema), userController.assignRole);
router.delete('/:id/roles/:roleId', requirePermission('users:write'), userController.removeRole);

router.get('/:id/audit-logs', requirePermission('audit:read'), userController.getUserLogs);

export default router;
