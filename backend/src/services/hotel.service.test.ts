jest.mock('../config/database', () => ({
  prisma: {
    visaCase: {
      findUnique: jest.fn(),
    },
    hotelBooking: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../config/database';
import * as hotelService from './hotel.service';

const SEARCH_PARAMS = { city: 'London', checkIn: '2026-09-01', checkOut: '2026-09-05', guests: 2 };

describe('hotel.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchHotels', () => {
    it('returns multiple offers for the given params, cheapest first', async () => {
      const offers = await hotelService.searchHotels(SEARCH_PARAMS);

      expect(offers.length).toBeGreaterThanOrEqual(6);
      for (const offer of offers) {
        expect(offer.city).toBe('London');
        expect(offer.checkIn).toBe(SEARCH_PARAMS.checkIn);
        expect(offer.checkOut).toBe(SEARCH_PARAMS.checkOut);
        expect(offer.totalPrice).toBeGreaterThan(0);
      }
      const prices = offers.map(o => o.pricePerNight);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    it('is deterministic for the same search params', async () => {
      const first = await hotelService.searchHotels(SEARCH_PARAMS);
      const second = await hotelService.searchHotels(SEARCH_PARAMS);
      expect(second).toEqual(first);
    });
  });

  describe('createBooking', () => {
    it('throws CASE_NOT_FOUND when the case does not exist', async () => {
      (prisma.visaCase.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        hotelService.createBooking('missing-case', { offerId: 'mk_bogus' }, 'user-1')
      ).rejects.toThrow('CASE_NOT_FOUND');
    });

    it('throws OFFER_NOT_FOUND for a malformed offerId', async () => {
      (prisma.visaCase.findUnique as jest.Mock).mockResolvedValue({ id: 'case-1' });

      await expect(
        hotelService.createBooking('case-1', { offerId: 'not-a-real-offer' }, 'user-1')
      ).rejects.toThrow('OFFER_NOT_FOUND');
    });

    it('creates a booking from a valid offer, revalidated through the provider', async () => {
      (prisma.visaCase.findUnique as jest.Mock).mockResolvedValue({ id: 'case-1' });
      const [offer] = await hotelService.searchHotels(SEARCH_PARAMS);
      (prisma.hotelBooking.create as jest.Mock).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'booking-1', ...data })
      );

      const booking = await hotelService.createBooking(
        'case-1',
        { offerId: offer.offerId, guestName: 'Ali Khan' },
        'user-1'
      );

      expect(prisma.hotelBooking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            caseId: 'case-1',
            hotelName: offer.hotelName,
            status: 'CONFIRMED',
            guestName: 'Ali Khan',
            bookedById: 'user-1',
          }),
        })
      );
      expect(booking.hotelName).toBe(offer.hotelName);
    });
  });

  describe('cancelBooking', () => {
    it('throws NOT_FOUND when the booking does not exist', async () => {
      (prisma.hotelBooking.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(hotelService.cancelBooking('missing')).rejects.toThrow('NOT_FOUND');
    });

    it('sets status to CANCELLED for an existing booking', async () => {
      (prisma.hotelBooking.findUnique as jest.Mock).mockResolvedValue({
        id: 'booking-1', providerBookingRef: null, provider: 'mock',
      });
      (prisma.hotelBooking.update as jest.Mock).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'booking-1', status: data.status })
      );

      const result = await hotelService.cancelBooking('booking-1');

      expect(prisma.hotelBooking.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'booking-1' }, data: { status: 'CANCELLED' } })
      );
      expect(result.status).toBe('CANCELLED');
    });
  });
});
