import React from 'react';
import { Bell, ChevronDown, PanelLeftClose, PanelLeftOpen, User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface HeaderProps {
  collapsed: boolean;
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ collapsed, onToggleSidebar }) => {
  const { user, roles } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <button
        onClick={onToggleSidebar}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
      </button>

      <div className="flex items-center gap-4">
        <button className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 cursor-pointer select-none group">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900 leading-tight">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-gray-500">{roles[0] ?? 'User'}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </div>
    </header>
  );
};
