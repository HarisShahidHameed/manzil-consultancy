import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { getCases } from '../../api/cases';
import { Modal } from '../ui/Modal';
import type { AppointmentMetrics, CaseStage, MetricBreakdown, MetricCard, VisaCase } from '../../types';

// The three buckets always render in this order, so the cards line up row-for-row
// next to each other even while one of them is still loading.
const ROWS: { key: keyof MetricBreakdown; label: string }[] = [
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'month',     label: 'Month' },
];

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

interface MetricBreakdownCardProps {
  icon: LucideIcon;
  label: string;
  /**
   * Undefined while the metrics request is in flight — the rows render as skeletons. Carries
   * both the three counts and the server-built `filters` reproducing this card's subset in
   * `/api/cases`, so a drill-down can't drift away from the number printed on the row.
   */
  card?: MetricCard;
  /** The half-open [from, to) instants the server actually used, per bucket. */
  ranges?: AppointmentMetrics['ranges'];
  isLoading?: boolean;
}

/**
 * Header stat card showing one funnel metric split into Today / Yesterday / Month-to-date,
 * each row drilling down into a modal listing exactly the cases that row counted.
 *
 * Absorbed the old CaseCountCard's count+modal rather than sharing it from a third file:
 * CaseCountCard was the single-stat variant of this card and had no remaining callers once
 * the funnel cards replaced it, so an extracted "case list modal" would have had exactly one
 * consumer. The listing lives here and CaseCountCard is gone.
 */
export const MetricBreakdownCard: React.FC<MetricBreakdownCardProps> = ({ icon: Icon, label, card, ranges, isLoading }) => {
  const navigate = useNavigate();
  const [openBucket, setOpenBucket] = useState<keyof MetricBreakdown | null>(null);

  // The drill-down query is this card's own server-supplied `filters` (which already include
  // the right `dateField`) merged with the server's [from, to) instants for the clicked
  // bucket. Deliberately no date arithmetic here: the agency's calendar day is not
  // necessarily the viewer's, so a locally computed "today" would list a different set of
  // cases than the count printed on the row. That is exactly why the endpoint returns `ranges`.
  const drillParams = openBucket && card && ranges
    ? { ...card.filters, from: ranges[openBucket].from, to: ranges[openBucket].to }
    : null;

  const { data, isLoading: rowsLoading } = useQuery({
    queryKey: ['cases', 'metricDrilldown', drillParams],
    queryFn:  () => getCases({ ...drillParams!, limit: String(MODAL_ROW_LIMIT) }),
    enabled:  !!drillParams,
  });

  const cases: VisaCase[] = data?.data ?? [];
  // Falls back to the count the card itself printed until the listing's own meta arrives, so
  // the "first N of M" hint never briefly shows a different M than the row that was clicked.
  const total = data?.meta?.total ?? (openBucket && card ? card[openBucket] : 0);
  const bucketLabel = ROWS.find(r => r.key === openBucket)?.label ?? '';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-1.5 text-gray-500">
        <Icon className="w-3.5 h-3.5 text-indigo-500" />
        <p className="text-xs">{label}</p>
      </div>
      {/* Plain divs rather than the previous <dl>: the rows are interactive controls now, and a
          <button> wrapping <dt>/<dd> is not valid description-list content. */}
      <div className="mt-2 space-y-1">
        {ROWS.map(({ key, label: rowLabel }) => {
          const count = card ? card[key] : undefined;
          // Nothing to drill into on an empty bucket, and nothing to drill *with* until the
          // metrics payload (filters + ranges) has landed.
          const canDrill = !!card && !!ranges && !!count;
          return (
            <button
              key={key}
              type="button"
              disabled={!canDrill}
              onClick={() => setOpenBucket(key)}
              title={canDrill ? `Show the ${count} case${count === 1 ? '' : 's'} counted here` : undefined}
              className="flex w-full items-baseline justify-between gap-6 -mx-1.5 px-1.5 py-0.5 rounded-md text-left cursor-pointer transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="text-xs text-gray-500">{rowLabel}</span>
              {/* Skeleton rather than a placeholder 0: a real 0 reads as "nothing happened today"
                  and the numbers visibly re-render a moment later. The bar is sized to the value
                  line so the card never changes height between loading and loaded. Once the request
                  has settled a missing payload means it failed — show an em dash, not a stuck shimmer. */}
              {isLoading ? (
                <span className="h-5 w-8 rounded bg-gray-100 animate-pulse" />
              ) : (
                // Dotted underline on the drillable numbers only — the affordance has to be
                // visible without hovering, and a 0 row genuinely cannot be opened.
                <span className={`text-lg font-bold leading-5 tabular-nums text-gray-900 ${canDrill ? 'underline decoration-dotted decoration-gray-300 underline-offset-4' : ''}`}>
                  {count ?? '—'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Modal
        open={!!openBucket}
        onClose={() => setOpenBucket(null)}
        title={`${label} — ${bucketLabel}`}
        subtitle={`The ${total} case${total === 1 ? '' : 's'} counted in the ${bucketLabel.toLowerCase()} bucket`}
        size="xl"
      >
        {rowsLoading ? (
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
                      onClick={() => { setOpenBucket(null); navigate(`/cases/${c.id}`); }}
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
    </div>
  );
};
