import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { getFinancialReports } from '../../api/financialReports';
import { getAssignableUsers } from '../../api/users';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ChartCard, ChartEmpty, CHART_COLORS } from '../../components/charts/ChartCard';
import { DESTINATION_OPTIONS, APPOINTMENT_CITY_OPTIONS } from '../../constants/options';
import type { ApiResponse, AssignableUser, FinancialReportsFilters } from '../../types';

const fmtMoney = (v: number) =>
  `£${v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

const SERVICE_TYPE_OPTIONS: { value: FinancialReportsFilters['serviceType'] | ''; label: string }[] = [
  { value: '',                  label: 'Any service type' },
  { value: 'FULL_SERVICE',      label: 'Full Service' },
  { value: 'APPOINTMENT_ONLY',  label: 'Appointment Only' },
];

const STAGE_OPTIONS: { value: FinancialReportsFilters['stage'] | ''; label: string }[] = [
  { value: '',                 label: 'Any stage' },
  { value: 'APPOINTMENT',      label: 'Appointment' },
  { value: 'FILE_PROCESSING',  label: 'File Processing' },
  { value: 'INVOICED',         label: 'Invoiced' },
  { value: 'COMPLETED',        label: 'Completed' },
  { value: 'CANCELLED',        label: 'Cancelled' },
];

const PRIORITY_OPTIONS: { value: FinancialReportsFilters['priority'] | ''; label: string }[] = [
  { value: '',        label: 'Any priority' },
  { value: 'LOW',      label: 'Low' },
  { value: 'MEDIUM',   label: 'Medium' },
  { value: 'HIGH',     label: 'High' },
  { value: 'URGENT',   label: 'Urgent' },
];

const STATUS_OPTIONS: { value: FinancialReportsFilters['status'] | ''; label: string }[] = [
  { value: '',        label: 'Any status' },
  { value: 'DRAFT',    label: 'Draft' },
  { value: 'SENT',     label: 'Sent' },
  { value: 'PARTIAL',  label: 'Partial' },
  { value: 'PAID',     label: 'Paid' },
];

const emptyFilters: FinancialReportsFilters = {};

// Mirrors backend's FULL_ACCESS_EMAILS (financialReports.controller.ts) — the server is the
// actual enforcement point, this only decides whether to show the now-pointless "Appointed/
// Closed By" filter (the server overrides assignedToId to the caller for everyone else anyway).
const FULL_ACCESS_EMAILS = new Set(['admin@manzilconsultancy.com', 'admin@manzil.com']);

const selectCls = 'rounded-lg border border-gray-300 text-sm py-2.5 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

const StatCard: React.FC<{ label: string; value: string; tone?: 'default' | 'good' | 'bad' }> = ({ label, value, tone = 'default' }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-xl font-bold mt-1 ${tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900'}`}>
      {value}
    </p>
  </div>
);

const FinancialReports: React.FC = () => {
  const { user } = useAuth();
  const hasFullAccess = !!user?.email && FULL_ACCESS_EMAILS.has(user.email.toLowerCase());
  const [draft, setDraft] = useState<FinancialReportsFilters>(emptyFilters);
  const [filters, setFilters] = useState<FinancialReportsFilters>(emptyFilters);

  const { data: usersResp } = useQuery<ApiResponse<AssignableUser[]>>({
    queryKey: ['assignable-users'],
    queryFn: getAssignableUsers,
  });
  const users = usersResp?.data ?? [];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['financial-reports', filters],
    queryFn:  () => getFinancialReports(filters),
    staleTime: 60_000,
  });

  const report = data?.data;

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined && v !== '').length;

  const applyFilters = () => setFilters(draft);
  const resetFilters = () => { setDraft(emptyFilters); setFilters(emptyFilters); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-gray-500 text-sm mt-1">
            Revenue, collections and outstanding balances — defaults to the last 12 months.
            {!hasFullAccess && ' Scoped to cases assigned to you.'}
          </p>
        </div>
        {isFetching && <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
        <Input
          label="From" type="date" min="1900-01-01" max="2099-12-31" value={draft.dateFrom ?? ''}
          onChange={e => setDraft(d => ({ ...d, dateFrom: e.target.value || undefined }))}
        />
        <Input
          label="To" type="date" min="1900-01-01" max="2099-12-31" value={draft.dateTo ?? ''}
          onChange={e => setDraft(d => ({ ...d, dateTo: e.target.value || undefined }))}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="fr-destination" className="text-sm font-medium text-gray-700">Destination</label>
          <select
            id="fr-destination" className={selectCls}
            value={draft.destination ?? ''}
            onChange={e => setDraft(d => ({ ...d, destination: e.target.value || undefined }))}
          >
            <option value="">Any destination</option>
            {DESTINATION_OPTIONS.map(dest => <option key={dest} value={dest}>{dest}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fr-city" className="text-sm font-medium text-gray-700">City</label>
          <select
            id="fr-city" className={selectCls}
            value={draft.city ?? ''}
            onChange={e => setDraft(d => ({ ...d, city: e.target.value || undefined }))}
          >
            <option value="">Any city</option>
            {APPOINTMENT_CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fr-service-type" className="text-sm font-medium text-gray-700">Service Type</label>
          <select
            id="fr-service-type" className={selectCls}
            value={draft.serviceType ?? ''}
            onChange={e => setDraft(d => ({ ...d, serviceType: (e.target.value || undefined) as FinancialReportsFilters['serviceType'] }))}
          >
            {SERVICE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fr-stage" className="text-sm font-medium text-gray-700">Case Stage</label>
          <select
            id="fr-stage" className={selectCls}
            value={draft.stage ?? ''}
            onChange={e => setDraft(d => ({ ...d, stage: (e.target.value || undefined) as FinancialReportsFilters['stage'] }))}
          >
            {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fr-priority" className="text-sm font-medium text-gray-700">Priority</label>
          <select
            id="fr-priority" className={selectCls}
            value={draft.priority ?? ''}
            onChange={e => setDraft(d => ({ ...d, priority: (e.target.value || undefined) as FinancialReportsFilters['priority'] }))}
          >
            {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fr-status" className="text-sm font-medium text-gray-700">Invoice Status</label>
          <select
            id="fr-status" className={selectCls}
            value={draft.status ?? ''}
            onChange={e => setDraft(d => ({ ...d, status: (e.target.value || undefined) as FinancialReportsFilters['status'] }))}
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {hasFullAccess && (
          <div className="flex flex-col gap-1">
            <label htmlFor="fr-assigned" className="text-sm font-medium text-gray-700">Case Appointed/Closed By</label>
            <select
              id="fr-assigned" className={selectCls}
              value={draft.assignedToId ?? ''}
              onChange={e => setDraft(d => ({ ...d, assignedToId: e.target.value || undefined }))}
            >
              <option value="">Anyone</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="fr-created-by" className="text-sm font-medium text-gray-700">Invoice Issued By</label>
          <select
            id="fr-created-by" className={selectCls}
            value={draft.createdById ?? ''}
            onChange={e => setDraft(d => ({ ...d, createdById: e.target.value || undefined }))}
          >
            <option value="">Anyone</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
        <Input
          label="Min amount" type="number" min="0" step="0.01" value={draft.minAmount ?? ''}
          onChange={e => setDraft(d => ({ ...d, minAmount: e.target.value || undefined }))}
          className="max-w-[110px]"
        />
        <Input
          label="Max amount" type="number" min="0" step="0.01" value={draft.maxAmount ?? ''}
          onChange={e => setDraft(d => ({ ...d, maxAmount: e.target.value || undefined }))}
          className="max-w-[110px]"
        />
        <Input
          label="Search" placeholder="Invoice, client name or ref..." value={draft.search ?? ''}
          onChange={e => setDraft(d => ({ ...d, search: e.target.value || undefined }))}
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-700 pb-2.5">
          <input
            type="checkbox"
            checked={draft.outstandingOnly === 'true'}
            onChange={e => setDraft(d => ({ ...d, outstandingOnly: e.target.checked ? 'true' : undefined }))}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Outstanding only
        </label>
        <Button size="md" onClick={applyFilters}>Apply</Button>
        <Button size="md" variant="outline" onClick={resetFilters}>Reset{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-72 animate-pulse" />
          ))}
        </div>
      ) : !report ? (
        <ChartEmpty label="Unable to load financial reports" />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Invoiced" value={fmtMoney(report.summary.totalAmount)} />
            <StatCard label="Collected" value={fmtMoney(report.summary.paidAmount + report.summary.advance)} tone="good" />
            <StatCard label="Outstanding" value={fmtMoney(report.summary.outstanding)} tone={report.summary.outstanding > 0 ? 'bad' : 'default'} />
            <StatCard label="Discounts Given" value={fmtMoney(report.summary.discount)} />
            <StatCard label="Collection Rate" value={`${report.summary.collectionRate.toFixed(1)}%`} tone={report.summary.collectionRate >= 80 ? 'good' : 'default'} />
            <StatCard label="Invoices" value={String(report.summary.invoiceCount)} />
          </div>

          {/* Revenue trend + status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Revenue Trend" subtitle="Invoiced vs. collected vs. outstanding, by month" className="lg:col-span-2">
              {report.revenueTrend.length === 0 ? <ChartEmpty /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={report.revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtMoney(v)} />
                    <Tooltip formatter={v => fmtMoney(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="charges" name="Invoiced" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="discount" name="Discounted" stroke="#f97316" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="paid" name="Collected" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="outstanding" name="Outstanding" stroke="#ef4444" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Invoices by Status">
              {report.invoicesByStatus.length === 0 ? <ChartEmpty /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={report.invoicesByStatus} dataKey="count" nameKey="status" outerRadius={100} label>
                      {report.invoicesByStatus.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Aging of Outstanding Balances" subtitle="Unpaid amounts by days past due">
              {report.agingBuckets.every(b => b.amount === 0) ? <ChartEmpty label="Nothing outstanding" /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={report.agingBuckets}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtMoney(v)} />
                    <Tooltip formatter={v => fmtMoney(Number(v))} />
                    <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Revenue breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Revenue by Destination" subtitle="Top 10 destinations by invoiced amount">
              {report.revenueByDestination.length === 0 ? <ChartEmpty /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={report.revenueByDestination} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmtMoney(v)} />
                    <YAxis type="category" dataKey="destination" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => fmtMoney(Number(v))} />
                    <Bar dataKey="totalAmount" name="Invoiced" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Revenue by Service Type">
              {report.revenueByServiceType.length === 0 ? <ChartEmpty /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={report.revenueByServiceType} dataKey="totalAmount" nameKey="serviceType" outerRadius={100} label>
                      {report.revenueByServiceType.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => fmtMoney(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Revenue by Staff" subtitle="Invoiced amount by who issued the invoice" className="lg:col-span-2">
              {report.revenueByStaff.length === 0 ? <ChartEmpty /> : (
                <ResponsiveContainer width="100%" height={Math.max(220, report.revenueByStaff.length * 40)}>
                  <BarChart data={report.revenueByStaff} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmtMoney(v)} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => fmtMoney(Number(v))} />
                    <Bar dataKey="totalAmount" name="Invoiced" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Top Clients by Revenue</h3>
              </div>
              {report.topClients.length === 0 ? <ChartEmpty /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Client</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Invoices</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Invoiced</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.topClients.map(c => (
                        <tr key={c.clientId}>
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mr-1.5">{c.clientRef}</span>
                            {c.name}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700">{c.count}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{fmtMoney(c.totalAmount)}</td>
                          <td className={`px-4 py-2.5 ${c.outstanding > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{fmtMoney(c.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Overdue Invoices</h3>
                <p className="text-xs text-gray-400">Unpaid balances past their due date, most overdue first</p>
              </div>
              {report.overdueInvoices.length === 0 ? <ChartEmpty label="Nothing overdue" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Invoice</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Client</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Due</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Outstanding</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500">Days Overdue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.overdueInvoices.map(inv => (
                        <tr key={inv.id}>
                          <td className="px-4 py-2.5 font-semibold text-indigo-600">{inv.invoiceRef}</td>
                          <td className="px-4 py-2.5 text-gray-700">
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mr-1.5">{inv.clientRef}</span>
                            {inv.clientName}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(inv.dueDate)}</td>
                          <td className="px-4 py-2.5 font-medium text-red-600">{fmtMoney(inv.outstanding)}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">{inv.daysOverdue}d</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FinancialReports;
