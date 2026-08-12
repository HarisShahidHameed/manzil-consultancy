export interface HotelSearchParams {
  city: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  guests: number;
}

export interface HotelOffer {
  offerId: string;
  provider: string;
  hotelName: string;
  address: string;
  city: string;
  country: string;
  starRating: number;
  roomType: string;
  currency: string;
  pricePerNight: number;
  totalPrice: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  imageUrl: string;
}

export interface HotelProvider {
  name: string;
  search(params: HotelSearchParams): Promise<HotelOffer[]>;
  getOffer(offerId: string): Promise<HotelOffer | null>;
  // Real providers may need to notify the supplier when a held booking is cancelled —
  // optional because a booking-only provider (or the mock) has nothing to call.
  cancel?(providerBookingRef: string): Promise<void>;
}
