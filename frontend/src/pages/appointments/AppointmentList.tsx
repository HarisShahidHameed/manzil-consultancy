import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, CalendarDays, AlertTriangle } from 'lucide-react';
import { getCases } from '../../api/cases';
import { getAssignableUsers } from '../../api/users';
import type { AssignableUser, CaseStage, DocumentStatus, Priority, VisaCase } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Pagination } from '../../components/ui/Pagination';
import { usePersistedPageSize } from '../../hooks/usePersistedPageSize';
import { DESTINATION_OPTIONS, APPOINTMENT_CITY_OPTIONS, formatShortlist, formatCityShortlist, shortCity, DOC_KEYS, DOC_LABELS, DOC_STATUS_COLORS } from '../../constants/options';
import { isExpiringSoon } from '../../utils/dates';

// Same file-team role set CaseDetail uses for the fileAssignedToId dropdown, so the
// File Processing tab bar lists exactly the people a case could be assigned to.
const FILE_ROLES = ['FILE_TEAM', 'HR_MANAGER', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'];

const PRI_COLORS: Record<Priority, string> = {
  LOW: 'bg-gray-100 text-gray-600', MEDIUM: 'text-gray-700',
  HIGH: 'bg-orange-100 text-orange-700', URGENT: 'bg-red-100 text-red-700',
};
// Matches the wording used in the priority <select> on the case form (Low/Normal/High/Urgent).
const PRI_LABELS: Record<Priority, string> = { LOW: 'Low', MEDIUM: 'Normal', HIGH: 'High', URGENT: 'Urgent' };

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

// A case's destination is either decided or, before File Processing finalizes it, a shortlist.
const destinationLabel = (c: { destination: string | null; destinationOptions?: string[] }) =>
  c.destination ?? (c.destinationOptions?.length ? formatShortlist(c.destinationOptions, DESTINATION_OPTIONS) : '—');

// Same shortlist-then-finalize pattern as destinationLabel, for the appointment city.
const cityLabel = (c: { city?: string; cityOptions?: string[] }) =>
  (c.city ? shortCity(c.city) : undefined) ?? (c.cityOptions?.length ? formatCityShortlist(c.cityOptions, APPOINTMENT_CITY_OPTIONS) : undefined);

const APPT_STATUS_COLORS: Record<string, string> = {
  WAITING:    'text-gray-700',
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
  /** Omit for a cross-stage listing (the Paused page pulls from every active stage). */
  stage?: CaseStage;
  title: string;
  /** Show the Waiting/Assigned/Registered/... appointment-status sub-tabs (Appointment stage only). */
  showStatusTabs?: boolean;
  /**
   * Lists only on-hold cases across every stage, instead of the usual single-stage
   * pipeline view — paused cases are excluded from the normal Appointment/File
   * Processing/Completed pages and live here instead, same as Completed gets its own page.
   */
  pausedOnly?: boolean;
  /**
   * Restricts the list to clients of this service type. FULL_SERVICE is used on the
   * normal Appointments queue so appointment-only clients don't clutter the pipeline
   * that leads into File Processing; APPOINTMENT_ONLY powers their own dedicated page.
   */
  serviceType?: 'APPOINTMENT_ONLY' | 'FULL_SERVICE';
}

const AppointmentList: React.FC<CaseListProps> = ({ stage, title, showStatusTabs, pausedOnly, serviceType }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('ALL');
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState('');
  const [city, setCity] = useState('');
  const [fileAssignedToId, setFileAssignedToId] = useState('');
  const [advancePaid, setAdvancePaid] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePersistedPageSize(`listing:${title}`, 20);

  // File Processing already shows this client/status info on the case detail page itself —
  // dropped from the list table here per request, to keep it focused on file-processing work.
  const isFileProcessing = stage === 'FILE_PROCESSING';
  // Completed cases finished the same file-processing pipeline, so they're filtered by
  // who processed the file too, rather than by appointment city like Appointments/Paused.
  const isCompleted = stage === 'COMPLETED';
  const showUserTabs = isFileProcessing || isCompleted;

  // All filters are ANDed together server-side, so status + destination + city + advance-paid + search narrow the list in sync.
  const params: Record<string, string> = { page: String(page), limit: String(limit) };
  if (pausedOnly) {
    params.onHold = 'true';
  } else {
    if (stage) params.stage = stage;
    params.onHold = 'false';
  }
  if (serviceType) params.serviceType = serviceType;
  if (showStatusTabs && tab !== 'ALL') params.appointmentStatus = tab;
  if (search) params.search = search;
  if (destination) params.destination = destination;
  if (showUserTabs) { if (fileAssignedToId) params.fileAssignedToId = fileAssignedToId; }
  else if (city) params.city = city;
  if (advancePaid) params.advancePaid = advancePaid;

  const { data, isLoading } = useQuery({
    queryKey: ['cases', stage, pausedOnly, serviceType, tab, search, destination, city, fileAssignedToId, advancePaid, page, limit],
    queryFn:  () => getCases(params),
  });

  // File team tabs, fetched from real users rather than a hardcoded name list so the
  // bar stays correct as staff change.
  const { data: usersData } = useQuery({
    queryKey: ['users', 'assignable'],
    queryFn:  () => getAssignableUsers(),
    enabled:  showUserTabs,
  });
  const fileUsers: AssignableUser[] = (usersData?.data ?? []).filter(u => u.roles.some(r => FILE_ROLES.includes(r)));

  const changeLimit = (l: number) => { setLimit(l); setPage(1); };

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
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
            {showUserTabs ? (
              <>
                <button
                  onClick={() => { setFileAssignedToId(''); setPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    fileAssignedToId === '' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  All
                </button>
                {fileUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setFileAssignedToId(u.id); setPage(1); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      fileAssignedToId === u.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {u.firstName}
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  onClick={() => { setCity(''); setPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    city === '' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  All
                </button>
                {APPOINTMENT_CITY_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => { setCity(c); setPage(1); }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      city === c ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </>
            )}
          </div>
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
              <option value="">Any destination</option>
              {DESTINATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {showStatusTabs && (
              <select
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={tab}
                onChange={e => { setTab(e.target.value as TabKey); setPage(1); }}
              >
                {tabs.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            )}
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={advancePaid}
              onChange={e => { setAdvancePaid(e.target.value as '' | 'true' | 'false'); setPage(1); }}
            >
              <option value="">Any</option>
              <option value="true">Paid</option>
              <option value="false">Unpaid</option>
            </select>
            {(search || destination || city || fileAssignedToId || advancePaid || tab !== 'ALL') && (
              <button
                onClick={() => { setSearch(''); setDestination(''); setCity(''); setFileAssignedToId(''); setAdvancePaid(''); setTab('ALL'); setPage(1); }}
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
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Client Ref</th>
                  {pausedOnly && <th className="text-left px-4 py-3 font-medium text-gray-500">Stage</th>}
                  {!isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">Received Date</th>}
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Destination</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">City</th>
                  {isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">User Comments</th>}
                  {isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">HR Comments</th>}
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Advance</th>
                  {!isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">Priority</th>}
                  {!isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>}
                  {pausedOnly && <th className="text-left px-4 py-3 font-medium text-gray-500">Paused Reason</th>}
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Appointment</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">First Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Last Name</th>
                  {isFileProcessing && DOC_KEYS.map(key => (
                    <th key={key} className="text-center px-2 py-3 font-medium text-gray-500" title={DOC_LABELS[key]}>
                      {DOC_LABELS[key]}
                    </th>
                  ))}
                  {!isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">Passport No.</th>}
                  {!isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">DOB</th>}
                  {!isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">Nationality</th>}
                  {!isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">Issuance Date</th>}
                  {!isFileProcessing && <th className="text-left px-4 py-3 font-medium text-gray-500">Expiry Date</th>}
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
                    <td
                      className={`px-4 py-3 text-xs font-bold ${c.whatsappGroupCreated ? 'text-indigo-600' : 'text-red-600'}`}
                      title={c.whatsappGroupCreated ? undefined : 'WhatsApp group not created for this appointment'}
                    >
                      {c.client?.clientRef}
                    </td>
                    {pausedOnly && (
                      <td className="px-4 py-3 text-gray-700">{c.stage.replace('_', ' ')}</td>
                    )}
                    {!isFileProcessing && <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(c.client?.receivedDate)}</td>}
                    <td className="px-4 py-3 text-gray-700">{destinationLabel(c)}</td>
                    <td className="px-4 py-3 text-gray-700">{cityLabel(c) ?? '—'}</td>
                    {isFileProcessing && (
                      <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate" title={c.salamComments ?? ''}>
                        {c.salamComments || '—'}
                      </td>
                    )}
                    {isFileProcessing && (
                      <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate" title={c.client?.hrComments ?? ''}>
                        {c.client?.hrComments || '—'}
                      </td>
                    )}
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
                    {!isFileProcessing && (
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRI_COLORS[c.priority]}`}>
                          {PRI_LABELS[c.priority]}
                        </span>
                      </td>
                    )}
                    {!isFileProcessing && (
                      <td className="px-4 py-3">
                        {c.stage === 'APPOINTMENT' && c.appointmentStatus ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APPT_STATUS_COLORS[c.appointmentStatus]}`}>
                            {c.appointmentStatus.charAt(0) + c.appointmentStatus.slice(1).toLowerCase()}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    {pausedOnly && (
                      <td className="px-4 py-3 text-gray-700">{c.onHoldReason || '—'}</td>
                    )}
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(c.appointmentDate)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.client?.firstName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-gray-900">{c.client?.lastName}</p>
                        {(isExpiringSoon(c.client?.passportExpiry) || isExpiringSoon(c.ukVisaExpiry)) && (
                          <span
                            title={[
                              isExpiringSoon(c.client?.passportExpiry) && 'Passport expiring within 6 months',
                              isExpiringSoon(c.ukVisaExpiry) && 'Visa expiring within 6 months',
                            ].filter(Boolean).join(' · ')}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" /> Expiring
                          </span>
                        )}
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
                    {isFileProcessing && DOC_KEYS.map(key => {
                      const status = c[key] as DocumentStatus;
                      return (
                        <td key={key} className="px-2 py-3 text-center">
                          <span
                            title={DOC_LABELS[key]}
                            className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DOC_STATUS_COLORS[status]}`}
                          >
                            {status === 'NOT_REQUIRED' ? 'N/A' : status.replace('_', ' ')}
                          </span>
                        </td>
                      );
                    })}
                    {!isFileProcessing && <td className="px-4 py-3 text-gray-700">{c.client?.passportNumber ?? '—'}</td>}
                    {!isFileProcessing && <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(c.client?.dob ?? undefined)}</td>}
                    {!isFileProcessing && <td className="px-4 py-3 text-gray-700">{c.client?.nationality ?? '—'}</td>}
                    {!isFileProcessing && <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(c.client?.passportIssue ?? undefined)}</td>}
                    {!isFileProcessing && (
                      <td className={`px-4 py-3 text-xs ${isExpiringSoon(c.client?.passportExpiry) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        {fmtDate(c.client?.passportExpiry ?? undefined)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {(() => {
                        const assignee = c.stage === 'FILE_PROCESSING' ? c.fileAssigned : c.appointmentAssigned;
                        return assignee ? `${assignee.firstName} ${assignee.lastName}` : '—';
                      })()}
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

        <Pagination meta={meta} onPageChange={setPage} limit={limit} onLimitChange={changeLimit} />
      </div>
    </div>
  );
};

export default AppointmentList;
