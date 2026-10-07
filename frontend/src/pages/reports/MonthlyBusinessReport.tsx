import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { getMonthlyReport } from '../../api/financialReports';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ChartEmpty } from '../../components/charts/ChartCard';
import type { AssignableUser, MonthlyReportFilters } from '../../types';

// Monthly business & operations report (1 Oct 2026 #7). Sits above the invoice-based
// Financial Reports rather than replacing them: those answer "what did we bill and collect",
// this answers "what did we complete, what fell through, and what did we actually earn".

const fmtMoney = (v: number) =>
  `£${v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const Stat: React.FC<{ label: string; value: string | number; hint?: string; tone?: 'default' | 'good' | 'bad' | 'muted' }> = ({ label, value, hint, tone = 'default' }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-xl font-bold mt-1 tabular-nums ${
      tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : tone === 'muted' ? 'text-gray-500' : 'text-gray-900'
    }`}>{value}</p>
    {hint && <p className="text-[11px] text-gray-400 mt-1 leading-snug">{hint}</p>}
  </div>
);

const selectCls = 'rounded-lg border border-gray-300 text-sm py-2.5 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

interface Props {
  /** Full-access viewers may narrow the report to one member of staff; everyone else is scoped server-side. */
  users?: AssignableUser[];
  hasFullAccess: boolean;
}

export const MonthlyBusinessReport: React.FC<Props> = ({ users = [], hasFullAccess }) => {
  const [draft, setDraft] = useState<MonthlyReportFilters>({ fromMonth: thisMonth(), toMonth: thisMonth() });
  const [filters, setFilters] = useState<MonthlyReportFilters>(draft);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['monthly-report', filters],
    queryFn:  () => getMonthlyReport(filters),
    staleTime: 60_000,
  });
  const r = data?.data;

  // The window the server actually counted (to is exclusive, so step back a day for the label).
  const periodLabel = r
    ? (() => {
        const first = monthLabel(r.range.from);
        const last = monthLabel(new Date(new Date(r.range.to).getTime() - 86_400_000).toISOString());
        return first === last ? first : `${first} – ${last}`;
      })()
    : '';

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Monthly Business Report</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Completed work, status breakdown and true service revenue{periodLabel ? ` for ${periodLabel}` : ''}.
          </p>
        </div>
        {isFetching && <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <Input
          label="From month" type="month" min="1900-01" max="2099-12" value={draft.fromMonth ?? ''}
          onChange={e => setDraft(d => ({ ...d, fromMonth: e.target.value || undefined }))}
        />
        <Input
          label="To month" type="month" min="1900-01" max="2099-12" value={draft.toMonth ?? ''}
          onChange={e => setDraft(d => ({ ...d, toMonth: e.target.value || undefined }))}
        />
        {hasFullAccess && (
          <div className="flex flex-col gap-1">
            <label htmlFor="mr-staff" className="text-sm font-medium text-gray-700">Staff member</label>
            <select
              id="mr-staff" className={selectCls} value={draft.assignedToId ?? ''}
              onChange={e => setDraft(d => ({ ...d, assignedToId: e.target.value || undefined }))}
            >
              <option value="">Everyone</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
        )}
        <Button
          size="md"
          disabled={!!draft.fromMonth && !!draft.toMonth && draft.toMonth < draft.fromMonth}
          onClick={() => setFilters(draft)}
        >
          Apply
        </Button>
        {draft.fromMonth && draft.toMonth && draft.toMonth < draft.fromMonth && (
          <p className="text-xs text-red-600 pb-3">"To" month is before "From" month.</p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 h-20 animate-pulse" />)}
        </div>
      ) : isError || !r ? (
        <ChartEmpty label="Unable to load the monthly report" />
      ) : (
        <>
          {/* Status breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Files Completed" value={r.statusCounts.completedFiles} tone="good" hint="Full-service cases completed" />
            <Stat label="Appointment Only" value={r.statusCounts.appointmentOnly} hint="Appointment-only cases opened" />
            <Stat label="Cancelled" value={r.statusCounts.cancelled} tone={r.statusCounts.cancelled ? 'bad' : 'default'} hint="Excludes duplicate clean-ups" />
            <Stat label="Missed Appointment" value={r.statusCounts.missedAppointment} tone={r.statusCounts.missedAppointment ? 'bad' : 'default'} hint="Status set to Missed" />
            <Stat label="Dropped" value={r.statusCounts.dropped} tone={r.statusCounts.dropped ? 'bad' : 'default'} hint="Status set to Dropped" />
            <Stat label="Paused" value={r.statusCounts.paused} hint="Cases paused in the period" />
          </div>

          {/* Revenue — service income separated from money that only passes through */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Net Service Revenue" value={fmtMoney(r.revenue.netServiceRevenue)} tone="good"
              hint={`Service charges ${fmtMoney(r.revenue.serviceCharges)} less discounts ${fmtMoney(r.revenue.discounts)}`} />
            <Stat label="Pass-through Costs" value={fmtMoney(r.revenue.passThroughCosts)} tone="muted"
              hint="Flights, hotels, insurance, letters and appointment fees paid for clients. Not income." />
            <Stat label="Gross Billed" value={fmtMoney(r.revenue.grossBilled)} tone="muted" hint="Net revenue + pass-through" />
            <Stat label="Clients Completed" value={r.completed.total} hint="All service types" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownTable
              title="Completed by Destination"
              head="Destination"
              rows={r.completed.byDestination.map(d => ({ key: d.destination, label: d.destination, count: d.count }))}
            />
            <BreakdownTable
              title="Completed by Staff"
              head="Handled by"
              rows={r.completed.byStaff.map(s => ({ key: s.userId ?? 'unassigned', label: s.name, count: s.count }))}
            />
          </div>
        </>
      )}
    </section>
  );
};

const BreakdownTable: React.FC<{ title: string; head: string; rows: { key: string; label: string; count: number }[] }> = ({ title, head, rows }) => (
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
    <div className="p-4 border-b border-gray-200">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
    </div>
    {rows.length === 0 ? <ChartEmpty label="Nothing completed in this period" /> : (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium text-gray-500">{head}</th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-500">Clients</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => (
            <tr key={row.key}>
              <td className="px-4 py-2.5 text-gray-700">{row.label}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-900 tabular-nums">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
