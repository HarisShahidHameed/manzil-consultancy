import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, CalendarDays, FolderOpen, Receipt, CheckCircle, TrendingUp, Shield, Key, FileText } from 'lucide-react';
import { getDashboardStats } from '../../api/dashboard';
import { useAuth } from '../../hooks/useAuth';
import { Can } from '../../routes/RoleGuard';
import type { ApiResponse, Role, Permission, CaseStage, DashboardStats } from '../../types';
import api from '../../api/axios';
import { AnalyticsSection } from './AnalyticsSection';

const STAGE_COLORS: Record<CaseStage, string> = {
  APPOINTMENT:     'bg-blue-100 text-blue-700',
  FILE_PROCESSING: 'bg-yellow-100 text-yellow-700',
  INVOICED:        'bg-purple-100 text-purple-700',
  COMPLETED:       'bg-green-100 text-green-700',
  CANCELLED:       'bg-red-100 text-red-700',
};

const StatCard: React.FC<{
  label: string; value: number | string; icon: React.ReactNode;
  color: string; sub?: string; onClick?: () => void;
}> = ({ label, value, icon, color, sub, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all' : 'hover:shadow-sm transition-shadow'}`}
  >
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const SkeletonCard = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 animate-pulse">
    <div className="w-12 h-12 rounded-xl bg-gray-200 flex-shrink-0" />
    <div className="space-y-2">
      <div className="h-7 w-16 bg-gray-200 rounded" />
      <div className="h-4 w-24 bg-gray-100 rounded" />
    </div>
  </div>
);

const fmtMoney = (v: number) =>
  `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, roles, permissions } = useAuth();

  const hasClients = permissions.includes('clients:read');
  const canReadUsers = permissions.includes('users:read');
  const canReadRoles = permissions.includes('roles:read');
  const canReadPerms = permissions.includes('permissions:read');

  const { data: statsResp, isLoading: statsLoading } = useQuery<{ data?: DashboardStats }>({
    queryKey: ['dashboard-stats'],
    queryFn:  getDashboardStats,
    staleTime: 60_000,
    enabled: hasClients,
  });

  const { data: userMeta } = useQuery({
    queryKey: ['dashboard-users-count'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<unknown[]>>('/users?limit=1');
      return res.data.meta;
    },
    enabled: canReadUsers,
  });

  const { data: rolesList } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Role[]>>('/roles');
      return res.data.data ?? [];
    },
    enabled: canReadRoles,
  });

  const { data: permsList } = useQuery<Permission[]>({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<Permission[]>>('/roles/permissions');
      return res.data.data ?? [];
    },
    enabled: canReadPerms,
  });

  const stats = statsResp?.data;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-1">
          <TrendingUp className="w-5 h-5 opacity-75" />
          <p className="text-indigo-200 text-sm font-medium">Overview</p>
        </div>
        <h1 className="text-2xl font-bold">
          Welcome back, {user?.firstName || user?.email?.split('@')[0]}!
        </h1>
        <p className="text-indigo-200 text-sm mt-1">
          Signed in as{' '}
          {roles.map((r, i) => (
            <span key={r}>
              <span className="font-semibold text-white">{r}</span>
              {i < roles.length - 1 && ', '}
            </span>
          ))}
        </p>
      </div>

      {/* CRM Stats */}
      <Can permissions={['clients:read']}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statsLoading ? (
            Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)
          ) : stats ? (
            <>
              <StatCard
                label="Total Clients" value={stats.totalClients}
                icon={<Users className="w-6 h-6 text-indigo-600" />}
                color="bg-indigo-50" onClick={() => navigate('/clients')}
              />
              <StatCard
                label="Appointments" value={stats.appointmentCases}
                icon={<CalendarDays className="w-6 h-6 text-blue-600" />}
                color="bg-blue-50" onClick={() => navigate('/appointments')}
              />
              <StatCard
                label="File Processing" value={stats.fileProcessingCases}
                icon={<FolderOpen className="w-6 h-6 text-yellow-600" />}
                color="bg-yellow-50" onClick={() => navigate('/appointments')}
              />
              <StatCard
                label="Invoiced" value={stats.invoicedCases}
                icon={<Receipt className="w-6 h-6 text-purple-600" />}
                color="bg-purple-50" onClick={() => navigate('/invoices')}
              />
              <StatCard
                label="Completed" value={stats.completedCases}
                icon={<CheckCircle className="w-6 h-6 text-green-600" />}
                color="bg-green-50"
              />
              <StatCard
                label="Total Invoices" value={stats.totalInvoices}
                icon={<Receipt className="w-6 h-6 text-indigo-600" />}
                color="bg-indigo-50" onClick={() => navigate('/invoices')}
              />
              <StatCard
                label="Pending Collections"
                value={fmtMoney(stats.pendingAmount)}
                icon={<TrendingUp className="w-6 h-6 text-orange-600" />}
                color="bg-orange-50"
              />
            </>
          ) : null}
        </div>
      </Can>

      {/* Admin stats for users without clients:read */}
      <Can permissions={['users:read', 'roles:read', 'permissions:read']} requireAll={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Can permissions={['users:read']}>
            <StatCard label="Total Users" value={userMeta?.total ?? '—'}
              icon={<Users className="w-6 h-6 text-indigo-600" />} color="bg-indigo-50"
              sub="registered accounts"
            />
          </Can>
          <Can permissions={['roles:read']}>
            <StatCard label="Roles" value={rolesList?.length ?? '—'}
              icon={<Shield className="w-6 h-6 text-purple-600" />} color="bg-purple-50"
              sub={`${rolesList?.filter(r => r.isSystem).length ?? 0} system roles`}
            />
          </Can>
          <Can permissions={['permissions:read']}>
            <StatCard label="Permissions" value={permsList?.length ?? '—'}
              icon={<Key className="w-6 h-6 text-emerald-600" />} color="bg-emerald-50"
              sub="system capabilities"
            />
          </Can>
          <StatCard label="Your Access" value={permissions.length}
            icon={<FileText className="w-6 h-6 text-orange-600" />} color="bg-orange-50"
            sub="permissions granted"
          />
        </div>
      </Can>

      {/* Recent Clients */}
      <Can permissions={['clients:read']}>
        {stats && stats.recentClients.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Recent Clients</h2>
              <button onClick={() => navigate('/clients')} className="text-xs text-indigo-600 hover:underline font-medium">
                View all
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Client Ref</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">First Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Last Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Destination</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Stage</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.recentClients.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                      <td className="px-4 py-3 text-xs font-bold text-indigo-600">{c.clientRef}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.firstName}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.lastName}</td>
                      <td className="px-4 py-3 text-gray-600">{c.visaCases[0]?.destination ?? '—'}</td>
                      <td className="px-4 py-3">
                        {c.visaCases[0] ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[c.visaCases[0].stage]}`}>
                            {c.visaCases[0].stage.replace('_', ' ')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(c.createdAt).toLocaleDateString('en-GB')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Can>

      {/* Reports & Analytics */}
      <Can permissions={['reports:read']}>
        <AnalyticsSection />
      </Can>

      {/* Roles & Permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Your Roles</h2>
          {roles.length === 0 ? (
            <p className="text-sm text-gray-400">No roles assigned</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map(role => (
                <span key={role} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-semibold">
                  <Shield className="w-3.5 h-3.5" /> {role}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Permissions <span className="text-gray-400 font-normal text-sm">({permissions.length})</span>
          </h2>
          {permissions.length === 0 ? (
            <p className="text-sm text-gray-400">No permissions granted</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {permissions.map(p => (
                <span key={p} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
