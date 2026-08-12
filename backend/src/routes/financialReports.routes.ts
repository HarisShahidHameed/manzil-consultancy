import { Router } from 'express';
import * as financialReportsController from '../controllers/financialReports.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyPermission } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

// Either permission is enough — invoices:read covers the Accountant role, reports:read
// covers Admin/Manager, so both groups that plausibly need this can reach it.
router.get('/', requireAnyPermission('invoices:read', 'reports:read'), financialReportsController.getFinancialReports);

export default router;
