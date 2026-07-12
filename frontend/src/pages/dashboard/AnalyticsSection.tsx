import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getAnalytics } from '../../api/dashboard';
import { getAssignableUsers } from '../../api/users';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ChartCard, ChartEmpty, CHART_COLORS, STAGE_CHART_COLORS, DOC_STATUS_COLORS } from '../../components/charts/ChartCard';
import type { AnalyticsFilters, ApiResponse, AssignableUser } from '../../types';
import { RefreshCw } from 'lucide-react';

const fmtMoney = (v: number) =>
  `£${v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const emptyFilters: AnalyticsFilters = {};

export const AnalyticsSection: React.FC = () => {
  const { permissions } = useAuth();
  const canSeeFinancials = permissions.includes('invoices:read');

  const [draft, setDraft] = useState<AnalyticsFilters>(emptyFilters);
  const [filters, setFilters] = useState<AnalyticsFilters>(emptyFilters);

  const { data: usersResp } = useQuery<ApiResponse<AssignableUser[]>>({
    queryKey: ['assignable-users'],
    queryFn: getAssignableUsers,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dashboard-analytics', filters],
    queryFn: () => getAnalytics(filters),
    staleTime: 60_000,
  });

  const analytics = data?.data;

  const destinationOptions = useMemo(
    () => analytics?.pipeline.casesByDestination.map(d => d.destination) ?? [],
    [analytics]
  );

  const applyFilters = () => setFilters(draft);
  const resetFilters = () => { setDraft(emptyFilters); setFilters(emptyFilters); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Reports &amp; Analytics</h2>
          <p className="text-sm text-gray-500">Pipeline, financial and client insights — defaults to the last 12 months.</p>
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
          <label htmlFor="analytics-destination" className="text-sm font-medium text-gray-700">Destination</label>
          <select
            id="analytics-destination"
            className="rounded-lg border border-gray-300 text-sm py-2.5 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={draft.destination ?? ''}
            onChange={e => setDraft(d => ({ ...d, destination: e.target.value || undefined }))}
          >
            <option value="">All destinations</option>
            {destinationOptions.map(dest => <option key={dest} value={dest}>{dest}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="analytics-assigned-to" className="text-sm font-medium text-gray-700">Assigned to</label>
          <select
            id="analytics-assigned-to"
            className="rounded-lg border border-gray-300 text-sm py-2.5 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={draft.assignedToId ?? ''}
            onChange={e => setDraft(d => ({ ...d, assignedToId: e.target.value || undefined }))}
          >
            <option value="">Everyone</option>
            {(usersResp?.data ?? []).map(u => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        </div>
        <Button size="md" onClick={applyFilters}>Apply</Button>
        <Button size="md" variant="outline" onClick={resetFilters}>Reset</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-72 animate-pulse" />
          ))}
        </div>
      ) : !analytics ? (
        <ChartEmpty label="Unable to load analytics" />
      ) : (
        <>
          {/* Pipeline & Operations */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Pipeline &amp; Operations</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Cases by Stage">
                {analytics.pipeline.casesByStage.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={analytics.pipeline.casesByStage}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {analytics.pipeline.casesByStage.map((entry, i) => (
                          <Cell key={i} fill={STAGE_CHART_COLORS[entry.stage] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Cases by Priority">
                {analytics.pipeline.casesByPriority.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={analytics.pipeline.casesByPriority} dataKey="count" nameKey="priority" outerRadius={100} label>
                        {analytics.pipeline.casesByPriority.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Top Destinations">
                {analytics.pipeline.casesByDestination.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={analytics.pipeline.casesByDestination} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="destination" width={90} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Appointment Funnel">
                {analytics.pipeline.appointmentFunnel.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={analytics.pipeline.appointmentFunnel}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Team Workload" subtitle="Cases per assigned appointment handler">
                {analytics.pipeline.workload.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={analytics.pipeline.workload} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="New Cases Trend">
                {analytics.pipeline.caseTrend.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={analytics.pipeline.caseTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Document Completion" subtitle="Status breakdown per document type" className="lg:col-span-2">
                {analytics.pipeline.documentCompletion.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={analytics.pipeline.documentCompletion.map(d => {
                        const row: Record<string, string | number> = { field: d.field.replace('doc', '') };
                        d.statuses.forEach(s => { row[s.status] = s.count; });
                        return row;
                      })}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="field" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      {Object.keys(DOC_STATUS_COLORS).map(status => (
                        <Bar key={status} dataKey={status} stackId="docs" fill={DOC_STATUS_COLORS[status]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          </div>

          {/* Financials */}
          {canSeeFinancials && (
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Financials</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Invoices by Status">
                  {analytics.financials.invoicesByStatus.length === 0 ? <ChartEmpty /> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={analytics.financials.invoicesByStatus} dataKey="count" nameKey="status" outerRadius={100} label>
                          {analytics.financials.invoicesByStatus.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <ChartCard title="Revenue Trend" subtitle="Invoiced vs. collected vs. outstanding">
                  {analytics.financials.revenueTrend.length === 0 ? <ChartEmpty /> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={analytics.financials.revenueTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtMoney(v)} />
                        <Tooltip formatter={v => fmtMoney(Number(v))} />
                        <Legend />
                        <Line type="monotone" dataKey="charges" name="Invoiced" stroke="#6366f1" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="paid" name="Collected" stroke="#22c55e" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="outstanding" name="Outstanding" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            </div>
          )}

          {/* Demographics */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Client Demographics</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Top Nationalities">
                {analytics.demographics.clientsByNationality.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={analytics.demographics.clientsByNationality} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="nationality" width={90} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#a855f7" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Gender Split">
                {analytics.demographics.clientsByGender.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={analytics.demographics.clientsByGender} dataKey="count" nameKey="gender" outerRadius={100} label>
                        {analytics.demographics.clientsByGender.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Client Source">
                {analytics.demographics.clientsBySource.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={analytics.demographics.clientsBySource}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="New Clients Trend">
                {analytics.demographics.newClientsTrend.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={analytics.demographics.newClientsTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
