import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { getCases } from '../../api/cases';
import { Modal } from '../ui/Modal';
import type { CaseStage, VisaCase } from '../../types';

const STAGE_COLORS: Record<CaseStage, string> = {
  APPOINTMENT:     'bg-blue-100 text-blue-700',
  FILE_PROCESSING: 'bg-yellow-100 text-yellow-700',
  INVOICED:        'bg-purple-100 text-purple-700',
  COMPLETED:       'bg-green-100 text-green-700',
  CANCELLED:       'bg-red-100 text-red-700',
};

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

// Cap matches the backend's per-request limit cap (caseQuerySchema), so the modal shows as
// many rows as one request can return; anything beyond that just isn't worth paginating for
// what's meant to be a quick glance list.
const MODAL_ROW_LIMIT = 100;

interface CaseCountCardProps {
  icon: LucideIcon;
  label: string;
  modalTitle: string;
  modalSubtitle: string;
  /** Query params identifying the case subset this card counts/lists (ANDed server-side). */
  params: Record<string, string>;
}

/**
 * Header stat card showing a count of cases matching `params`. Clicking it opens a modal
 * listing exactly those cases, each linking through to its case detail page.
 */
export const CaseCountCard: React.FC<CaseCountCardProps> = ({ icon: Icon, label, modalTitle, modalSubtitle, params }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: countData } = useQuery({
    queryKey: ['cases', 'count', params],
    queryFn:  () => getCases({ ...params, limit: '1' }),
  });
  const total = countData?.meta?.total ?? 0;

  const { data: listData, isLoading } = useQuery({
    queryKey: ['cases', 'list', params],
    queryFn:  () => getCases({ ...params, limit: String(MODAL_ROW_LIMIT) }),
    enabled:  open,
  });
  const cases: VisaCase[] = listData?.data ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-colors"
      >
        <div className="flex items-center gap-1.5 text-gray-500">
          <Icon className="w-3.5 h-3.5 text-indigo-500" />
          <p className="text-xs">{label}</p>
        </div>
        <p className="text-xl font-bold text-gray-900 mt-1">{total}</p>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={modalTitle} subtitle={modalSubtitle} size="xl">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cases.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No cases found</p>
        ) : (
          <>
            {total > cases.length && (
              <p className="text-xs text-gray-400 mb-2">Showing the first {cases.length} of {total}</p>
            )}
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-6 py-2.5 font-medium text-gray-500">Client Ref</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Destination</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Stage</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500">Appointment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cases.map(c => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => { setOpen(false); navigate(`/cases/${c.id}`); }}
                    >
                      <td className="px-6 py-2.5 text-xs font-bold text-indigo-600">{c.client?.clientRef}</td>
                      <td className="px-4 py-2.5 text-gray-900">{c.client?.firstName} {c.client?.lastName}</td>
                      <td className="px-4 py-2.5 text-gray-700">{c.destination ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[c.stage]}`}>
                          {c.stage.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(c.appointmentDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </>
  );
};
