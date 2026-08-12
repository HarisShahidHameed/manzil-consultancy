import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Search, BedDouble, Star, CalendarX2 } from 'lucide-react';
import { searchHotels, listCaseHotelBookings, createHotelBooking, cancelHotelBooking } from '../../api/hotels';
import type { HotelOffer } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Alert } from '../../components/ui/Alert';
import { Can } from '../../routes/RoleGuard';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');
const fmtPrice = (v: number | string, currency: string) => {
  const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  return `${symbol}${parseFloat(String(v)).toFixed(2)}`;
};

const STATUS_COLORS: Record<string, string> = {
  HELD: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

interface Props {
  caseId: string;
  defaultCity?: string;
  defaultCheckIn?: string;
}

export const HotelBookingPanel: React.FC<Props> = ({ caseId, defaultCity, defaultCheckIn }) => {
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    city: defaultCity ?? '',
    checkIn: defaultCheckIn ?? '',
    checkOut: '',
    guests: '1',
  });
  const [searchParams, setSearchParams] = useState<{ city: string; checkIn: string; checkOut: string; guests: number } | null>(null);
  const [bookingOffer, setBookingOffer] = useState<HotelOffer | null>(null);
  const [guestName, setGuestName] = useState('');

  const bookingsQuery = useQuery({
    queryKey: ['hotel-bookings', caseId],
    queryFn: () => listCaseHotelBookings(caseId).then(r => r.data ?? []),
  });

  const offersQuery = useQuery({
    queryKey: ['hotel-offers', searchParams],
    queryFn: () => searchHotels(searchParams!).then(r => r.data ?? []),
    enabled: !!searchParams,
  });

  const bookMut = useMutation({
    mutationFn: () => createHotelBooking(caseId, { offerId: bookingOffer!.offerId, guestName: guestName || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel-bookings', caseId] });
      setBookingOffer(null);
      setSearchOpen(false);
    },
    onError: (err: AxiosError<{ message?: string }>) => {
      setError(err.response?.data?.message ?? 'Failed to book hotel');
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelHotelBooking(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hotel-bookings', caseId] }),
  });

  const bookings = bookingsQuery.data ?? [];

  const runSearch = () => {
    if (!form.city || !form.checkIn || !form.checkOut) return;
    setSearchParams({ city: form.city, checkIn: form.checkIn, checkOut: form.checkOut, guests: Math.max(1, parseInt(form.guests, 10) || 1) });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Hotel Bookings ({bookings.length})
        </h3>
        <Can permissions={['hotels:write']}>
          <Button size="sm" leftIcon={<Search className="w-3.5 h-3.5" />} onClick={() => { setError(null); setSearchOpen(true); }}>
            Search Hotels
          </Button>
        </Can>
      </div>

      {bookings.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No hotel bookings yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-xs text-gray-500">Hotel</th>
                <th className="text-left px-3 py-2 text-xs text-gray-500">Dates</th>
                <th className="text-left px-3 py-2 text-xs text-gray-500">Total</th>
                <th className="text-left px-3 py-2 text-xs text-gray-500">Status</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.map(b => (
                <tr key={b.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{b.hotelName}</div>
                    <div className="text-xs text-gray-500">{b.roomType}{b.guestName ? ` · ${b.guestName}` : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{fmtDate(b.checkIn)} – {fmtDate(b.checkOut)}</td>
                  <td className="px-3 py-2">{fmtPrice(b.totalPrice, b.currency)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status]}`}>{b.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {b.status !== 'CANCELLED' && (
                      <Can permissions={['hotels:write']}>
                        <button
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                          disabled={cancelMut.isPending}
                          onClick={() => cancelMut.mutate(b.id)}
                        >
                          <CalendarX2 className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </Can>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Search + results modal */}
      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Search Hotels" size="xl">
        {error && <Alert variant="error" message={error} className="mb-4" />}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="col-span-2">
            <label className="text-xs text-gray-500">City</label>
            <input className={`${inputCls} mt-1`} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. London" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Check-in</label>
            <input type="date" className={`${inputCls} mt-1`} value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Check-out</label>
            <input type="date" className={`${inputCls} mt-1`} value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Guests</label>
            <input type="number" min="1" className={`${inputCls} mt-1`} value={form.guests} onChange={e => setForm(f => ({ ...f, guests: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button className="w-full" leftIcon={<Search className="w-3.5 h-3.5" />} onClick={runSearch} disabled={!form.city || !form.checkIn || !form.checkOut}>
              Search
            </Button>
          </div>
        </div>

        {offersQuery.isFetching && <p className="text-sm text-gray-400 text-center py-6">Searching…</p>}
        {offersQuery.isError && <Alert variant="error" message="Failed to search hotels — check the dates and try again." />}

        {offersQuery.data && (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {offersQuery.data.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No hotels found</p>}
            {offersQuery.data.map(offer => (
              <div key={offer.offerId} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                    <BedDouble className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{offer.hotelName}</div>
                    <div className="text-xs text-gray-500">{offer.address}</div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-0.5">
                        {Array.from({ length: offer.starRating }).map((_, i) => <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />)}
                      </span>
                      <span>·</span>
                      <span>{offer.roomType}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="font-semibold text-gray-900">{fmtPrice(offer.totalPrice, offer.currency)}</div>
                  <div className="text-xs text-gray-500 mb-2">{fmtPrice(offer.pricePerNight, offer.currency)}/night</div>
                  <Can permissions={['hotels:write']}>
                    <Button size="sm" onClick={() => { setError(null); setBookingOffer(offer); setGuestName(''); }}>Book</Button>
                  </Can>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Confirm booking modal */}
      <Modal
        open={!!bookingOffer}
        onClose={() => setBookingOffer(null)}
        title="Confirm Booking"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setBookingOffer(null)}>Cancel</Button>
            <Button loading={bookMut.isPending} onClick={() => bookMut.mutate()}>Confirm Booking</Button>
          </>
        }
      >
        {bookingOffer && (
          <div className="space-y-4">
            <div className="text-sm">
              <div className="font-medium text-gray-900">{bookingOffer.hotelName}</div>
              <div className="text-gray-500">{fmtDate(bookingOffer.checkIn)} – {fmtDate(bookingOffer.checkOut)} · {bookingOffer.roomType}</div>
              <div className="font-semibold text-gray-900 mt-1">{fmtPrice(bookingOffer.totalPrice, bookingOffer.currency)}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Guest Name</label>
              <input className={`${inputCls} mt-1`} value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Name on the reservation" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
