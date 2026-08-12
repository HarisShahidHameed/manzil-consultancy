import api from './axios';
import type { ApiResponse, HotelBooking, HotelOffer } from '../types';

export interface HotelSearchParams {
  city: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
}

export const searchHotels = (params: HotelSearchParams) =>
  api.get<ApiResponse<HotelOffer[]>>('/hotels/search', { params }).then(r => r.data);

export const listCaseHotelBookings = (caseId: string) =>
  api.get<ApiResponse<HotelBooking[]>>(`/cases/${caseId}/hotel-bookings`).then(r => r.data);

export const createHotelBooking = (caseId: string, data: { offerId: string; guestName?: string; notes?: string }) =>
  api.post<ApiResponse<HotelBooking>>(`/cases/${caseId}/hotel-bookings`, data).then(r => r.data);

export const cancelHotelBooking = (id: string) =>
  api.delete<ApiResponse<HotelBooking>>(`/hotel-bookings/${id}`).then(r => r.data);
