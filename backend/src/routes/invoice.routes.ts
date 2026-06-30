import { Router } from 'express';
import * as invoiceController from '../controllers/invoice.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/',       requirePermission('invoices:read'),   invoiceController.listInvoices);
router.post('/',      requirePermission('invoices:write'),  invoiceController.createInvoice);
router.get('/:id',    requirePermission('invoices:read'),   invoiceController.getInvoice);
router.get('/:id/receipt', requirePermission('invoices:read'), invoiceController.downloadInvoicePdf);
router.put('/:id',    requirePermission('invoices:write'),  invoiceController.updateInvoice);
router.delete('/:id', requirePermission('invoices:delete'), invoiceController.deleteInvoice);

export default router;
