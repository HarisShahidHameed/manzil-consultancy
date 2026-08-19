import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Trash2, Eye, Filter, Upload, AlertTriangle } from 'lucide-react';
import { AxiosError } from 'axios';
import { getClients, deleteClient } from '../../api/clients';
import type { Client, CaseStage } from '../../types';
import { isExpiringSoon } from '../../utils/dates';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Pagination } from '../../components/ui/Pagination';
import { usePersistedPageSize } from '../../hooks/usePersistedPageSize';
import { Can } from '../../routes/RoleGuard';
import ImportClientsModal from './ImportClientsModal';
import { DESTINATION_OPTIONS, APPOINTMENT_CITY_OPTIONS, formatShortlist } from '../../constants/options';

const STAGE_OPTIONS: { value: CaseStage | ''; label: string }[] = [
  { value: '', label: 'All Stages' },
  { value: 'APPOINTMENT', label: 'Appointment' },
  { value: 'FILE_PROCESSING', label: 'File Processing' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STAGE_COLORS: Record<CaseStage, string> = {
  APPOINTMENT:     'bg-blue-100 text-blue-700',
  FILE_PROCESSING: 'bg-yellow-100 text-yellow-700',
  INVOICED:        'bg-purple-100 text-purple-700',
  COMPLETED:       'bg-green-100 text-green-700',
  CANCELLED:       'bg-red-100 text-red-700',
};

const StageBadge: React.FC<{ stage: CaseStage }> = ({ stage }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[stage]}`}>
    {stage.replace('_', ' ')}
  </span>
);

// Same plain-text treatment as the Appointments listing — no colored pill for these two.
const PRI_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600', MEDIUM: 'text-gray-700',
  HIGH: 'bg-orange-100 text-orange-700', URGENT: 'bg-red-100 text-red-700',
};
const APPT_STATUS_COLORS: Record<string, string> = {
  WAITING:    'text-gray-700',
  ASSIGNED:   'bg-blue-100 text-blue-700',
  REGISTERED: 'bg-green-100 text-green-700',
  COMPLETED:  'bg-green-100 text-green-700',
  HOLD:       'bg-orange-100 text-orange-700',
  DROPPED:    'bg-red-100 text-red-700',
  BACK_UP:    'bg-purple-100 text-purple-700',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB');
const fmtDateOrDash = (d?: string | null) => (d ? fmtDate(d) : '—');

// Same shortlist-then-finalize pattern as the Appointments table — shown here for the
// client's primary (most recent) case so Destination/City are visible from the Clients
// list too, not just buried inside the Cases column.
const destinationLabel = (vc?: { destination: string | null; destinationOptions?: string[] }) =>
  !vc ? '—' : vc.destination ?? (vc.destinationOptions?.length ? `${formatShortlist(vc.destinationOptions, DESTINATION_OPTIONS)} (undecided)` : '—');
const cityLabel = (vc?: { city?: string | null; cityOptions?: string[] }) =>
  !vc ? '—' : vc.city ?? (vc.cityOptions?.length ? `${formatShortlist(vc.cityOptions, APPOINTMENT_CITY_OPTIONS)} (undecided)` : '—');

const ClientList: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<CaseStage | ''>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePersistedPageSize('clients', 20);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const params: Record<string, string> = { page: String(page), limit: String(limit) };
  if (search) params.search = search;
  if (stage)  params.stage  = stage;

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, limit, search, stage],
    queryFn:  () => getClients(params),
  });

  const changeLimit = (l: number) => { setLimit(l); setPage(1); };

  const del = useMutation({
    mutationFn: deleteClient,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setSuccess('Client deleted');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (e: AxiosError<{ message: string }>) =>
      setError(e.response?.data?.message ?? 'Failed to delete client'),
  });

  const clients: Client[] = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 text-sm mt-1">{meta?.total ?? 0} total clients</p>
        </div>
        <Can permissions={['clients:write']}>
          <div className="flex items-center gap-2">
            <Button variant="outline" leftIcon={<Upload className="w-4 h-4" />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => navigate('/clients/new')}>
              Add Client
            </Button>
          </div>
        </Can>
      </div>

      {error   && <Alert variant="error"   message={error}   onClose={() => setError(null)} />}
      {success && <Alert variant="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search by name, ref, passport, phone..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            leftIcon={<Search className="w-4 h-4" />}
            className="max-w-sm"
          />
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={stage}
              onChange={e => { setStage(e.target.value as CaseStage | ''); setPage(1); }}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STAGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <UserPlus className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">{search ? 'No clients match your search' : 'No clients yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Client Ref</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Received</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Destination</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">City</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Advance</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Appointment</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">First Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Last Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">DOB</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Nationality</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Passport No</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Passport Issue / Expiry</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Availability</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Cases</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clients.map((c: Client) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/clients/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-indigo-600 text-xs">{c.clientRef}</p>
                        {c.visaCases.some(vc => (vc.missingRequiredFields?.length ?? 0) > 0) && (
                          <span
                            title="Missing required client info"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" /> Missing info
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(c.receivedDate)}</td>
                    <td className="px-4 py-3 text-gray-700">{destinationLabel(c.visaCases[0])}</td>
                    <td className="px-4 py-3 text-gray-700">{cityLabel(c.visaCases[0])}</td>
                    <td className="px-4 py-3">
                      {!c.visaCases[0] || c.visaCases[0].stage === 'CANCELLED' ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : c.visaCases[0].advancePaid ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Paid</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                          <AlertTriangle className="w-2.5 h-2.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.visaCases[0] ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRI_COLORS[c.visaCases[0].priority]}`}>
                          {c.visaCases[0].priority}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.visaCases[0]?.stage === 'APPOINTMENT' && c.visaCases[0].appointmentStatus ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APPT_STATUS_COLORS[c.visaCases[0].appointmentStatus]}`}>
                          {c.visaCases[0].appointmentStatus.charAt(0) + c.visaCases[0].appointmentStatus.slice(1).toLowerCase()}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateOrDash(c.visaCases[0]?.appointmentDate)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.firstName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium text-gray-900">{c.lastName ?? <span className="text-gray-400 italic">no last name</span>}</p>
                        {(isExpiringSoon(c.passportExpiry) || c.visaCases.some(vc => isExpiringSoon(vc.ukVisaExpiry))) && (
                          <span
                            title={[
                              isExpiringSoon(c.passportExpiry) && 'Passport expiring within 6 months',
                              c.visaCases.some(vc => isExpiringSoon(vc.ukVisaExpiry)) && 'Visa expiring within 6 months',
                            ].filter(Boolean).join(' · ')}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" /> Expiring
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtDateOrDash(c.dob)}</td>
                    <td className="px-4 py-3 text-gray-700">{c.nationality ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{c.passportNumber ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-gray-700">{fmtDateOrDash(c.passportIssue)} / </span>
                      <span className={isExpiringSoon(c.passportExpiry) ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                        {fmtDateOrDash(c.passportExpiry)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.phone}</td>
                    <td className="px-4 py-3 text-gray-700">{c.availability ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.visaCases.slice(0, 2).map(vc => (
                          <div key={vc.id} className="flex flex-col gap-0.5">
                            <span className="text-xs text-gray-600" title={vc.destinationOptions ? formatShortlist(vc.destinationOptions, DESTINATION_OPTIONS) : undefined}>
                              {vc.destination ?? (vc.destinationOptions?.length ? 'Undecided' : '—')}
                            </span>
                            <StageBadge stage={vc.stage} />
                          </div>
                        ))}
                        {c.visaCases.length > 2 && (
                          <span className="text-xs text-gray-400">+{c.visaCases.length - 2} more</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Eye className="w-3.5 h-3.5" />}
                          onClick={() => navigate(`/clients/${c.id}`)}
                        >
                          View
                        </Button>
                        <Can permissions={['clients:delete']}>
                          <Button
                            variant="danger"
                            size="sm"
                            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                            onClick={() => {
                              if (confirm(`Delete ${c.firstName} ${c.lastName}? All cases will be deleted too.`)) {
                                del.mutate(c.id);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination meta={meta} onPageChange={setPage} limit={limit} onLimitChange={changeLimit} />
      </div>

      <ImportClientsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ['clients'] });
          setImportOpen(false);
          setSuccess('Import complete — client list refreshed');
          setTimeout(() => setSuccess(null), 4000);
        }}
      />
    </div>
  );
};

export default ClientList;
