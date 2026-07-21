import { Router } from 'express';
import * as apiKeyController from '../controllers/apiKey.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/',        requirePermission('apikeys:read'),   apiKeyController.listApiKeys);
router.post('/',       requirePermission('apikeys:write'),  apiKeyController.createApiKey);
router.post('/:id/revoke', requirePermission('apikeys:write'), apiKeyController.revokeApiKey);
router.delete('/:id',  requirePermission('apikeys:delete'), apiKeyController.deleteApiKey);

export default router;
