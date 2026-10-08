import { Router } from 'express';
import * as financialReportsController from '../controllers/financialReports.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyPermission } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

// Either permission is enough — invoices:read covers the Accountant role, reports:read
// covers Admin/Manager, so both groups that plausibly need this can reach it.
router.get('/', requireAnyPermission('invoices:read', 'reports:read'), financialReportsController.getFinancialReports);
// Monthly business & operations report (1 Oct 2026 #7) — same audience as the report above.
router.get('/monthly', requireAnyPermission('invoices:read', 'reports:read'), financialReportsController.getMonthlyReport);

export default router;
