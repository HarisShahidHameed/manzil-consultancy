import { Request, Response } from 'express';
import * as hotelService from '../services/hotel.service';
import { sendSuccess, sendError } from '../utils/response';
import { createAuditLog } from '../utils/audit';
import { hotelSearchQuerySchema, createHotelBookingSchema } from '../validators/hotel.validators';

export const searchHotels = async (req: Request, res: Response): Promise<void> => {
  try {
    const params = hotelSearchQuerySchema.parse(req.query);
    const offers = await hotelService.searchHotels(params);
    sendSuccess(res, 'Hotel offers retrieved', offers);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    sendError(res, 'Failed to search hotels', 500);
  }
};

export const listCaseBookings = async (req: Request, res: Response): Promise<void> => {
  const bookings = await hotelService.listBookingsForCase(req.params.caseId);
  sendSuccess(res, 'Hotel bookings retrieved', bookings);
};

export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = createHotelBookingSchema.parse(req.body);
    const booking = await hotelService.createBooking(req.params.caseId, data, req.user?.sub);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'HOTEL_BOOKING_CREATED',
      resource: 'hotel_bookings',
      resourceId: booking.id,
      details: { caseId: req.params.caseId, hotelName: booking.hotelName },
      req,
    });
    sendSuccess(res, 'Hotel booked', booking, 201);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      sendError(res, 'Validation failed', 422, error.flatten().fieldErrors);
      return;
    }
    if (error?.message === 'CASE_NOT_FOUND') {
      sendError(res, 'Case not found', 404);
      return;
    }
    if (error?.message === 'OFFER_NOT_FOUND') {
      sendError(res, 'Selected offer is no longer available, please search again', 410);
      return;
    }
    sendError(res, 'Failed to create hotel booking', 500);
  }
};

export const cancelBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const booking = await hotelService.cancelBooking(req.params.id);
    await createAuditLog({
      userId: req.user?.sub,
      action: 'HOTEL_BOOKING_CANCELLED',
      resource: 'hotel_bookings',
      resourceId: req.params.id,
      req,
    });
    sendSuccess(res, 'Hotel booking cancelled', booking);
  } catch (error: any) {
    if (error?.message === 'NOT_FOUND') {
      sendError(res, 'Hotel booking not found', 404);
      return;
    }
    sendError(res, 'Failed to cancel hotel booking', 500);
  }
};
