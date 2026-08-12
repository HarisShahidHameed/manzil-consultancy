import { Router } from 'express';
import * as hotelController from '../controllers/hotel.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';

// Mounted at '/api' (not '/api/hotels') so it can own both the /hotels/search endpoint
// and the /cases/:caseId/hotel-bookings sub-resource without a second router.
const router = Router();
router.use(authenticate);

router.get('/hotels/search', requirePermission('hotels:read'), hotelController.searchHotels);

router.get('/cases/:caseId/hotel-bookings',  requirePermission('hotels:read'),  hotelController.listCaseBookings);
router.post('/cases/:caseId/hotel-bookings', requirePermission('hotels:write'), hotelController.createBooking);

router.delete('/hotel-bookings/:id', requirePermission('hotels:write'), hotelController.cancelBooking);

export default router;
