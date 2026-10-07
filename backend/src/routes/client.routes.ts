import { Router } from 'express';
import * as clientController from '../controllers/client.controller';
import * as clientDocumentController from '../controllers/clientDocument.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission, requireAnyPermission } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/',          requirePermission('clients:read'),   clientController.listClients);
router.post('/',         requirePermission('clients:write'),  clientController.createClient);
router.post('/import',   requirePermission('clients:write'),  clientController.importClients);
// Must stay above every '/:id' route — Express would otherwise match "check-passport"
// as an id. Advisory duplicate lookup for the client form; see client.controller.
router.get('/check-passport', requirePermission('clients:read'), clientController.checkPassport);
router.get('/:id',    requirePermission('clients:read'),   clientController.getClient);
router.get('/:id/pdf', requirePermission('clients:read'),  clientController.downloadClientPdf);
router.put('/:id',    requirePermission('clients:write'),  clientController.updateClient);
router.post('/:id/hr-comments', requireAnyPermission('clients:write', 'appointments:write', 'files:write'), clientController.appendHrComment);
router.delete('/:id', requirePermission('clients:delete'), clientController.deleteClient);
router.post('/:id/cases', requirePermission('clients:write'), clientController.addCase);

// Documents — S3-backed, presigned direct-to-bucket upload (see clientDocument.service.ts)
// The file team works documents from the File Processing view (1 Oct 2026 #6), and its role
// has files:* but only clients:read — so files:write is accepted alongside clients:write.
router.get('/:id/documents',              requireAnyPermission('clients:read', 'files:read'),   clientDocumentController.listDocuments);
router.post('/:id/documents/presign',     requireAnyPermission('clients:write', 'files:write'), clientDocumentController.requestUploads);
router.post('/:id/documents/complete',    requireAnyPermission('clients:write', 'files:write'), clientDocumentController.completeUpload);
router.post('/:id/documents/abort',       requireAnyPermission('clients:write', 'files:write'), clientDocumentController.abortUpload);
router.delete('/:id/documents/:documentId', requireAnyPermission('clients:write', 'files:write'), clientDocumentController.deleteDocument);

export default router;
