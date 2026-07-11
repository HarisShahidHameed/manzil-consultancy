import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, CalendarDays, AlertTriangle } from 'lucide-react';
import { getCases } from '../../api/cases';
import type { CaseStage, Priority, VisaCase } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DESTINATION_OPTIONS, APPOINTMENT_CITY_OPTIONS } from '../../constants/options';

const STAGE_COLORS: Record<CaseStage, string> = {
  APPOINTMENT:     'bg-blue-100 text-blue-700',
  FILE_PROCESSING: 'bg-yellow-100 text-yellow-700',
  INVOICED:        'bg-purple-100 text-purple-700',
  COMPLETED:       'bg-green-100 text-green-700',
  CANCELLED:       'bg-red-100 text-red-700',
};

const PRI_COLORS: Record<Priority, string> = {
  LOW: 'bg-gray-100 text-gray-600', MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700', URGENT: 'bg-red-100 text-red-700',
};

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

// A case's destination is either decided or, before File Processing finalizes it, a shortlist.
const destinationLabel = (c: { destination: string | null; destinationOptions?: string[] }) =>
  c.destination ?? (c.destinationOptions?.length ? `${c.destinationOptions.join(', ')} (undecided)` : '—');

const APPT_STATUS_COLORS: Record<string, string> = {
  WAITING:    'bg-amber-100 text-amber-700',
  ASSIGNED:   'bg-blue-100 text-blue-700',
  REGISTERED: 'bg-green-100 text-green-700',
  COMPLETED:  'bg-green-100 text-green-700',
  HOLD:       'bg-orange-100 text-orange-700',
  DROPPED:    'bg-red-100 text-red-700',
  BACK_UP:    'bg-purple-100 text-purple-700',
};

// Mirrors the appointment workflow: Waiting → Assigned (to a booker) → Registered / Completed / Hold / Dropped / Back-Up.
type TabKey = 'ALL' | 'WAITING' | 'ASSIGNED' | 'REGISTERED' | 'COMPLETED' | 'HOLD' | 'DROPPED' | 'BACK_UP';

interface CaseListProps {
  stage: CaseStage;
  title: string;
  /** Show the Waiting/Assigned/Registered/... appointment-status sub-tabs (Appointment stage only). */
  showStatusTabs?: boolean;
}

const AppointmentList: React.FC<CaseListProps> = ({ stage, title, showStatusTabs }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('ALL');
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);

  // All filters are ANDed together server-side, so status + destination + city + search narrow the list in sync.
  const params: Record<string, string> = { page: String(page), limit: '20', stage };
  if (showStatusTabs && tab !== 'ALL') params.appointmentStatus = tab;
  if (search) params.search = search;
  if (destination) params.destination = destination;
  if (city) params.city = city;

  const { data, isLoading } = useQuery({
    queryKey: ['cases', stage, tab, search, destination, city, page],
    queryFn:  () => getCases(params),
  });

  const cases: VisaCase[] = data?.data ?? [];
  const meta = data?.meta;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'ALL',        label: 'All' },
    { key: 'WAITING',    label: 'Waiting' },
    { key: 'ASSIGNED',   label: 'Assigned' },
    { key: 'REGISTERED', label: 'Registered' },
    { key: 'COMPLETED',  label: 'Completed' },
    { key: 'HOLD',       label: 'Hold' },
    { key: 'DROPPED',    label: 'Dropped' },
    { key: 'BACK_UP',    label: 'Back-Up' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-500 text-sm mt-1">{meta?.total ?? 0} cases</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {showStatusTabs && (
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search by client, destination..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              leftIcon={<Search className="w-4 h-4" />}
              className="max-w-xs"
            />
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={destination}
              onChange={e => { setDestination(e.target.value); setPage(1); }}
            >
              <option value="">All destinations</option>
              {DESTINATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={city}
              onChange={e => { setCity(e.target.value); setPage(1); }}
            >
              <option value="">All cities</option>
              {APPOINTMENT_CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(search || destination || city || tab !== 'ALL') && (
              <button
                onClick={() => { setSearch(''); setDestination(''); setCity(''); setTab('ALL'); setPage(1); }}
                className="text-xs text-indigo-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <CalendarDays className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No cases found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Destination</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Stage</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Advance</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Appointment</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Assigned To</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cases.map((c: VisaCase) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/cases/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-indigo-600">{c.client?.clientRef}</p>
                      <p className="font-medium text-gray-900">{c.client?.firstName} {c.client?.lastName}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{destinationLabel(c)}{c.city ? ` (${c.city})` : ''}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRI_COLORS[c.priority]}`}>
                        {c.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[c.stage]}`}>
                          {c.stage.replace('_', ' ')}
                        </span>
                        {(c.missingRequiredFields?.length ?? 0) > 0 && (
                          <span
                            title="Missing required client info"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" /> Incomplete
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.stage === 'APPOINTMENT' && c.appointmentStatus ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APPT_STATUS_COLORS[c.appointmentStatus]}`}>
                          {c.appointmentStatus.charAt(0) + c.appointmentStatus.slice(1).toLowerCase()}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.stage === 'CANCELLED' ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : c.advancePaid ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Paid</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                          <AlertTriangle className="w-2.5 h-2.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(c.appointmentDate)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {c.appointmentAssigned
                        ? `${c.appointmentAssigned.firstName} ${c.appointmentAssigned.lastName}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/cases/${c.id}`)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && (meta.totalPages ?? 1) > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {meta.page} of {meta.totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={meta.page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={meta.page === meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppointmentList;
