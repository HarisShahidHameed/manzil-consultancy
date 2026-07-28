import { Router } from 'express';
import * as publicApiController from '../controllers/publicApi.controller';
import { authenticateApiKey, requireApiScope } from '../middleware/apiKey.middleware';
import { publicApiLimiter } from '../middleware/rateLimit.middleware';

// Third-party integration surface: authenticated with an API key (X-API-Key header),
// never a user login. See docs/PUBLIC_API.md.
const router = Router();
router.use(publicApiLimiter);
router.use(authenticateApiKey);

router.get('/clients',            requireApiScope('clients:read'),       publicApiController.listClients);
// Must be registered before '/clients/:id' — otherwise Express would match "single" as
// the :id param and this route would never be reached.
router.get('/clients/single',     requireApiScope('clients:read'),       publicApiController.getSingleClient);
router.get('/clients/:id',        requireApiScope('clients:read'),       publicApiController.getClient);
router.post('/clients',           requireApiScope('clients:write'),      publicApiController.createClient);
router.patch('/clients/:id/status', requireApiScope('clients:write'),    publicApiController.updateClientStatus);
router.get('/appointments',       requireApiScope('appointments:read'),  publicApiController.listAppointments);
router.get('/appointments/:id',   requireApiScope('appointments:read'),  publicApiController.getAppointment);

export default router;
