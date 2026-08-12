import { HotelOffer, HotelProvider, HotelSearchParams } from './types';

const PROVIDER_NAME = 'mock';

// Deterministic PRNG (mulberry32) seeded from a string hash so the same city/dates/guests
// search returns the same-looking result set on repeat calls, like a real cached rate feed.
const hashSeed = (input: string): number => {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return h >>> 0;
};

const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const HOTEL_NAME_PREFIXES = ['Grand', 'Royal', 'Imperial', 'The Metropolitan', 'Central', 'Riverside', 'Park View', 'Golden'];
const HOTEL_NAME_SUFFIXES = ['Hotel', 'Suites', 'Inn', 'Palace', 'Residency', 'Plaza', 'Gardens'];
const ROOM_TYPES = ['Standard Double', 'Deluxe Twin', 'Superior King', 'Executive Suite', 'Family Room'];
const STREETS = ['Main Street', 'High Street', 'Station Road', 'Market Square', 'Airport Road', 'City Center Ave'];
const CURRENCY_BY_HINT: Record<string, string> = {
  uk: 'GBP', london: 'GBP', schengen: 'EUR', europe: 'EUR', germany: 'EUR', france: 'EUR',
  italy: 'EUR', spain: 'EUR', us: 'USD', usa: 'USD',
};

const inferCurrency = (city: string): string => {
  const key = city.trim().toLowerCase();
  for (const hint of Object.keys(CURRENCY_BY_HINT)) {
    if (key.includes(hint)) return CURRENCY_BY_HINT[hint];
  }
  return 'USD';
};

const nightsBetween = (checkIn: string, checkOut: string): number => {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
};

const encodeOfferId = (offer: Omit<HotelOffer, 'offerId'>): string =>
  'mk_' + Buffer.from(JSON.stringify(offer)).toString('base64url');

const decodeOfferId = (offerId: string): HotelOffer | null => {
  if (!offerId.startsWith('mk_')) return null;
  try {
    const decoded = JSON.parse(Buffer.from(offerId.slice(3), 'base64url').toString('utf8'));
    return { ...decoded, offerId };
  } catch {
    return null;
  }
};

const search = async (params: HotelSearchParams): Promise<HotelOffer[]> => {
  const nights = nightsBetween(params.checkIn, params.checkOut);
  const currency = inferCurrency(params.city);
  const seed = hashSeed(`${params.city}|${params.checkIn}|${params.checkOut}|${params.guests}`);
  const rand = mulberry32(seed);
  const count = 6 + Math.floor(rand() * 3); // 6-8 hotels

  const offers: HotelOffer[] = [];
  for (let i = 0; i < count; i++) {
    const prefix = HOTEL_NAME_PREFIXES[Math.floor(rand() * HOTEL_NAME_PREFIXES.length)];
    const suffix = HOTEL_NAME_SUFFIXES[Math.floor(rand() * HOTEL_NAME_SUFFIXES.length)];
    const hotelName = `${prefix} ${params.city} ${suffix}`;
    const street = STREETS[Math.floor(rand() * STREETS.length)];
    const starRating = 2 + Math.floor(rand() * 4); // 2-5 stars
    const basePricePerNight = 40 + starRating * 25 + Math.round(rand() * 40);
    const pricePerNight = basePricePerNight;
    const totalPrice = pricePerNight * nights;
    const roomType = ROOM_TYPES[Math.floor(rand() * ROOM_TYPES.length)];

    const base: Omit<HotelOffer, 'offerId'> = {
      provider: PROVIDER_NAME,
      hotelName,
      address: `${Math.floor(rand() * 200) + 1} ${street}, ${params.city}`,
      city: params.city,
      country: '',
      starRating,
      roomType,
      currency,
      pricePerNight,
      totalPrice,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      guests: params.guests,
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(hotelName)}/400/240`,
    };
    offers.push({ ...base, offerId: encodeOfferId(base) });
  }

  return offers.sort((a, b) => a.pricePerNight - b.pricePerNight);
};

const getOffer = async (offerId: string): Promise<HotelOffer | null> => decodeOfferId(offerId);

export const mockProvider: HotelProvider = {
  name: PROVIDER_NAME,
  search,
  getOffer,
};
