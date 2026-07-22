import { Router } from 'express';
import * as visaCaseController from '../controllers/visaCase.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyPermission, requirePermission } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requireAnyPermission('appointments:read', 'files:read', 'clients:read'),
  visaCaseController.listCases
);
router.get(
  '/:id',
  requireAnyPermission('appointments:read', 'files:read', 'clients:read'),
  visaCaseController.getCase
);
router.get(
  '/:id/advance-receipt',
  requireAnyPermission('appointments:read', 'files:read', 'clients:read', 'invoices:read'),
  visaCaseController.downloadAdvanceReceipt
);
router.get(
  '/:id/receipt-preview',
  requireAnyPermission('files:read', 'files:write', 'invoices:read', 'invoices:write'),
  visaCaseController.downloadReceiptPreview
);
router.put(
  '/:id',
  requireAnyPermission('appointments:write', 'files:write', 'clients:write', 'invoices:write'),
  visaCaseController.updateCase
);
router.post(
  '/:id/advance-to-invoiced',
  requireAnyPermission('files:write', 'invoices:write'),
  visaCaseController.advanceToInvoiced
);
router.delete('/:id', requirePermission('clients:delete'), visaCaseController.deleteCase);

export default router;
