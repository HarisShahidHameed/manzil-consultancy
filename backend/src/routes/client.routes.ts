import { Router } from 'express';
import * as clientController from '../controllers/client.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, requireAnyPermission } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/',          requirePermission('clients:read'),   clientController.listClients);
router.post('/',         requirePermission('clients:write'),  clientController.createClient);
router.post('/import',   requirePermission('clients:write'),  clientController.importClients);
router.get('/:id',    requirePermission('clients:read'),   clientController.getClient);
router.get('/:id/pdf', requirePermission('clients:read'),  clientController.downloadClientPdf);
router.put('/:id',    requirePermission('clients:write'),  clientController.updateClient);
router.post('/:id/hr-comments', requireAnyPermission('clients:write', 'appointments:write', 'files:write'), clientController.appendHrComment);
router.delete('/:id', requirePermission('clients:delete'), clientController.deleteClient);
router.post('/:id/cases', requirePermission('clients:write'), clientController.addCase);

export default router;
