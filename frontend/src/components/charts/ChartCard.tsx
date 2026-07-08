import React from 'react';

export const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string }> = ({
  title, subtitle, children, className,
}) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className ?? ''}`}>
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
    {children}
  </div>
);

export const ChartEmpty: React.FC<{ label?: string }> = ({ label = 'No data for the selected filters' }) => (
  <div className="h-64 flex items-center justify-center text-sm text-gray-400">{label}</div>
);

export const CHART_COLORS = [
  '#6366f1', '#3b82f6', '#f59e0b', '#a855f7', '#22c55e',
  '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316',
];

export const STAGE_CHART_COLORS: Record<string, string> = {
  APPOINTMENT: '#3b82f6',
  FILE_PROCESSING: '#f59e0b',
  INVOICED: '#a855f7',
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
};

export const DOC_STATUS_COLORS: Record<string, string> = {
  PENDING: '#9ca3af',
  IN_PROGRESS: '#f59e0b',
  DONE: '#22c55e',
  NOT_REQUIRED: '#e5e7eb',
};
