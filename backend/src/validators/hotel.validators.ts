import { z } from 'zod';

const DATE_REGEX = /^(19|20)\d{2}-\d{2}-\d{2}$/;
const DATE_FORMAT_MSG = 'Use YYYY-MM-DD format (year between 1900-2099)';

export const hotelSearchQuerySchema = z.object({
  city:     z.string().min(1).max(100).trim(),
  checkIn:  z.string().regex(DATE_REGEX, DATE_FORMAT_MSG),
  checkOut: z.string().regex(DATE_REGEX, DATE_FORMAT_MSG),
  guests:   z.string().optional().transform(v => (v ? Math.max(1, parseInt(v, 10)) : 1)),
}).refine(data => new Date(data.checkOut) > new Date(data.checkIn), {
  message: 'checkOut must be after checkIn',
  path: ['checkOut'],
});

export const createHotelBookingSchema = z.object({
  offerId:   z.string().min(1),
  guestName: z.string().max(200).trim().optional(),
  notes:     z.string().max(1000).optional(),
});
