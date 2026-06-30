import React from 'react';
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, Shield, Key, FileText, LogOut,
  UserCheck, CalendarDays, FolderOpen, Receipt, Layers,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Can } from '../../routes/RoleGuard';

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      clsx(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      )
    }
  >
    <span className="w-5 h-5">{icon}</span>
    {label}
  </NavLink>
);

const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-1">{label}</p>
);

export const Sidebar: React.FC = () => {
  const { logout } = useAuth();

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center px-5 py-4 border-b border-gray-200">
        <img src="/logo.svg" alt="Manzil Consultancy" className="h-10 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <NavItem to="/dashboard" icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard" />

        {/* Clients */}
        <Can permissions={['clients:read']}>
          <SectionLabel label="Clients" />
          <NavItem to="/clients" icon={<UserCheck className="w-5 h-5" />} label="Clients" />
          <NavItem to="/groups" icon={<Layers className="w-5 h-5" />} label="Groups" />
        </Can>

        {/* Operations */}
        <Can permissions={['appointments:read', 'files:read', 'clients:read']} requireAll={false}>
          <SectionLabel label="Operations" />
        </Can>
        <Can permissions={['appointments:read']}>
          <NavItem to="/appointments" icon={<CalendarDays className="w-5 h-5" />} label="Appointments" />
        </Can>
        <Can permissions={['files:read']}>
          <NavItem to="/file-processing" icon={<FolderOpen className="w-5 h-5" />} label="File Processing" />
        </Can>
        <Can permissions={['invoices:read']}>
          <NavItem to="/invoices" icon={<Receipt className="w-5 h-5" />} label="Invoices" />
        </Can>

        {/* Administration */}
        <Can permissions={['users:read', 'roles:read', 'permissions:read', 'audit:read']} requireAll={false}>
          <SectionLabel label="Administration" />
        </Can>
        <Can permissions={['users:read']}>
          <NavItem to="/admin/users" icon={<Users className="w-5 h-5" />} label="Users" />
        </Can>
        <Can permissions={['roles:read']}>
          <NavItem to="/admin/roles" icon={<Shield className="w-5 h-5" />} label="Roles" />
        </Can>
        <Can permissions={['permissions:read']}>
          <NavItem to="/admin/permissions" icon={<Key className="w-5 h-5" />} label="Permissions" />
        </Can>
        <Can permissions={['audit:read']}>
          <NavItem to="/admin/audit-logs" icon={<FileText className="w-5 h-5" />} label="Audit Logs" />
        </Can>
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-200">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign out
        </button>
      </div>
    </aside>
  );
};
