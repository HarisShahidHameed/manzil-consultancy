import { HotelProvider } from './types';
import { mockProvider } from './mockProvider';

// Registry of pluggable hotel suppliers. To go live with a real provider (Booking.com
// affiliate, Expedia Rapid, RateHawk, etc.) once credentials exist: implement HotelProvider
// in a new file here, add it to this map, and set HOTEL_PROVIDER — no other code changes.
const PROVIDERS: Record<string, HotelProvider> = {
  mock: mockProvider,
};

export const getHotelProvider = (): HotelProvider =>
  PROVIDERS[process.env.HOTEL_PROVIDER ?? 'mock'] ?? mockProvider;

export * from './types';
