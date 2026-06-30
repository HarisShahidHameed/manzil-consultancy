import { Router } from 'express';
import * as groupController from '../controllers/group.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/',       requirePermission('clients:read'),  groupController.listGroups);
router.post('/',      requirePermission('clients:write'), groupController.createGroup);
router.get('/:id',    requirePermission('clients:read'),  groupController.getGroup);
router.put('/:id',    requirePermission('clients:write'), groupController.updateGroup);
router.delete('/:id', requirePermission('clients:delete'), groupController.deleteGroup);
router.post('/:id/members', requirePermission('clients:write'), groupController.addMembers);
router.delete('/:id/members/:clientId', requirePermission('clients:write'), groupController.removeMember);

export default router;
