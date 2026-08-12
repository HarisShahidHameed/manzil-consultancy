import React from 'react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, Shield, Key, FileText, LogOut,
  UserCheck, CalendarDays, CalendarCheck, FolderOpen, Receipt, Layers, CheckCircle2, KeyRound, PauseCircle, LineChart,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Can } from '../../routes/RoleGuard';

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string; collapsed: boolean }> = ({ to, icon, label, collapsed }) => (
  <NavLink
    to={to}
    title={collapsed ? label : undefined}
    className={({ isActive }) =>
      clsx(
        'flex items-center rounded-lg text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
        isActive
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      )
    }
  >
    <span className="w-5 h-5 flex-shrink-0">{icon}</span>
    {!collapsed && label}
  </NavLink>
);

const SectionLabel: React.FC<{ label: string; collapsed: boolean }> = ({ label, collapsed }) =>
  collapsed ? (
    <div className="mt-4 mb-1 border-t border-gray-100" />
  ) : (
    <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-1">{label}</p>
  );

export const Sidebar: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const { logout } = useAuth();

  return (
    <aside className={clsx(
      'flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full transition-[width] duration-200',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className={clsx('flex items-center border-b border-gray-200', collapsed ? 'justify-center px-2 py-4' : 'px-5 py-4')}>
        <img src="/logo.svg" alt="Manzil Consultancy" className={collapsed ? 'h-8 w-auto' : 'h-10 w-auto'} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        <NavItem to="/dashboard" icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" collapsed={collapsed} />

        {/* Clients */}
        <Can permissions={['clients:read']}>
          <SectionLabel label="Clients" collapsed={collapsed} />
          <NavItem to="/clients" icon={<UserCheck className="w-5 h-5" />} label="Clients" collapsed={collapsed} />
          <NavItem to="/groups" icon={<Layers className="w-5 h-5" />} label="Groups" collapsed={collapsed} />
        </Can>

        {/* Operations */}
        <Can permissions={['appointments:read', 'files:read', 'clients:read']} requireAll={false}>
          <SectionLabel label="Operations" collapsed={collapsed} />
        </Can>
        <Can permissions={['appointments:read']}>
          <NavItem to="/appointments" icon={<CalendarDays className="w-5 h-5" />} label="Appointments" collapsed={collapsed} />
        </Can>
        <Can permissions={['appointments:read']}>
          <NavItem to="/appointment-only" icon={<CalendarCheck className="w-5 h-5" />} label="Appointment Only" collapsed={collapsed} />
        </Can>
        <Can permissions={['files:read']}>
          <NavItem to="/file-processing" icon={<FolderOpen className="w-5 h-5" />} label="File Processing" collapsed={collapsed} />
        </Can>
        <Can permissions={['invoices:read']}>
          <NavItem to="/invoices" icon={<Receipt className="w-5 h-5" />} label="Invoices" collapsed={collapsed} />
        </Can>
        <Can permissions={['invoices:read', 'reports:read']} requireAll={false}>
          <NavItem to="/reports/financial" icon={<LineChart className="w-5 h-5" />} label="Financial Reports" collapsed={collapsed} />
        </Can>
        <Can permissions={['appointments:read', 'files:read', 'invoices:read', 'clients:read']} requireAll={false}>
          <NavItem to="/completed" icon={<CheckCircle2 className="w-5 h-5" />} label="Completed" collapsed={collapsed} />
        </Can>
        <Can permissions={['appointments:read', 'files:read', 'clients:read']} requireAll={false}>
          <NavItem to="/paused" icon={<PauseCircle className="w-5 h-5" />} label="Paused" collapsed={collapsed} />
        </Can>

        {/* Administration */}
        <Can permissions={['users:read', 'roles:read', 'permissions:read', 'audit:read', 'apikeys:read']} requireAll={false}>
          <SectionLabel label="Administration" collapsed={collapsed} />
        </Can>
        <Can permissions={['users:read']}>
          <NavItem to="/admin/users" icon={<Users className="w-5 h-5" />} label="Users" collapsed={collapsed} />
        </Can>
        <Can permissions={['roles:read']}>
          <NavItem to="/admin/roles" icon={<Shield className="w-5 h-5" />} label="Roles" collapsed={collapsed} />
        </Can>
        <Can permissions={['permissions:read']}>
          <NavItem to="/admin/permissions" icon={<Key className="w-5 h-5" />} label="Permissions" collapsed={collapsed} />
        </Can>
        <Can permissions={['audit:read']}>
          <NavItem to="/admin/audit-logs" icon={<FileText className="w-5 h-5" />} label="Audit Logs" collapsed={collapsed} />
        </Can>
        <Can permissions={['apikeys:read']}>
          <NavItem to="/admin/api-keys" icon={<KeyRound className="w-5 h-5" />} label="API Keys" collapsed={collapsed} />
        </Can>
      </nav>

      {/* Logout */}
      <div className="px-2 py-4 border-t border-gray-200">
        <button
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className={clsx(
            'flex items-center w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
};
