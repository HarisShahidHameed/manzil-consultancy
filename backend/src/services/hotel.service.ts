import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { getHotelProvider, HotelSearchParams } from './hotelProviders';

const BOOKING_SELECT = {
  id: true, caseId: true, provider: true, providerOfferId: true, providerBookingRef: true,
  hotelName: true, hotelAddress: true, city: true, country: true, roomType: true,
  checkIn: true, checkOut: true, guests: true, currency: true,
  pricePerNight: true, totalPrice: true, status: true, guestName: true, notes: true,
  bookedById: true, createdAt: true, updatedAt: true,
  bookedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.HotelBookingSelect;

export const searchHotels = async (params: HotelSearchParams) => {
  const provider = getHotelProvider();
  return provider.search(params);
};

export const createBooking = async (
  caseId: string,
  data: { offerId: string; guestName?: string; notes?: string },
  userId?: string
) => {
  const caseRecord = await prisma.visaCase.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!caseRecord) throw new Error('CASE_NOT_FOUND');

  const provider = getHotelProvider();
  const offer = await provider.getOffer(data.offerId);
  if (!offer) throw new Error('OFFER_NOT_FOUND');

  const booking = await prisma.hotelBooking.create({
    data: {
      caseId,
      provider: offer.provider,
      providerOfferId: offer.offerId,
      hotelName: offer.hotelName,
      hotelAddress: offer.address,
      city: offer.city,
      country: offer.country || undefined,
      roomType: offer.roomType,
      checkIn: new Date(offer.checkIn),
      checkOut: new Date(offer.checkOut),
      guests: offer.guests,
      currency: offer.currency,
      pricePerNight: new Prisma.Decimal(offer.pricePerNight),
      totalPrice: new Prisma.Decimal(offer.totalPrice),
      status: 'CONFIRMED',
      guestName: data.guestName,
      notes: data.notes,
      bookedById: userId,
    },
    select: BOOKING_SELECT,
  });
  return booking;
};

export const listBookingsForCase = async (caseId: string) => {
  return prisma.hotelBooking.findMany({
    where: { caseId },
    select: BOOKING_SELECT,
    orderBy: { createdAt: 'desc' },
  });
};

export const getBookingById = async (id: string) => {
  return prisma.hotelBooking.findUnique({ where: { id }, select: BOOKING_SELECT });
};

export const cancelBooking = async (id: string) => {
  const existing = await prisma.hotelBooking.findUnique({ where: { id }, select: { id: true, providerBookingRef: true, provider: true } });
  if (!existing) throw new Error('NOT_FOUND');

  const provider = getHotelProvider();
  if (existing.providerBookingRef && provider.cancel) {
    await provider.cancel(existing.providerBookingRef);
  }

  return prisma.hotelBooking.update({
    where: { id },
    data: { status: 'CANCELLED' },
    select: BOOKING_SELECT,
  });
};
