import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, CalendarDays } from 'lucide-react';
import { getCases } from '../../api/cases';
import type { CaseStage, Priority, VisaCase } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const STAGE_COLORS: Record<CaseStage, string> = {
  INTAKE:          'bg-gray-100 text-gray-700',
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

type TabStage = 'ALL' | 'INTAKE' | 'APPOINTMENT';

const AppointmentList: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabStage>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page), limit: '20' };
  if (tab !== 'ALL') params.stage = tab;
  if (search) params.search = search;

  const { data, isLoading } = useQuery({
    queryKey: ['cases', tab, search, page],
    queryFn:  () => getCases(params),
  });

  const cases: VisaCase[] = data?.data ?? [];
  const meta = data?.meta;

  const tabs: { key: TabStage; label: string }[] = [
    { key: 'ALL',         label: 'All' },
    { key: 'INTAKE',      label: 'Intake' },
    { key: 'APPOINTMENT', label: 'Appointment' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        <p className="text-gray-500 text-sm mt-1">{meta?.total ?? 0} cases</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
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
          <Input
            placeholder="Search by client, destination..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            leftIcon={<Search className="w-4 h-4" />}
            className="max-w-xs"
          />
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
                    <td className="px-4 py-3 text-gray-700">{c.destination}{c.city ? ` (${c.city})` : ''}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRI_COLORS[c.priority]}`}>
                        {c.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[c.stage]}`}>
                        {c.stage.replace('_', ' ')}
                      </span>
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
