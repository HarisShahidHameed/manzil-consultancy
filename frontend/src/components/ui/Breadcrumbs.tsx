import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'upcoming';
  onClick?: () => void;
}

const STATE_CLASSES: Record<BreadcrumbStep['state'], string> = {
  done:     'bg-green-50 text-green-600',
  current:  '',
  upcoming: 'bg-gray-50 text-gray-400',
};

export const Breadcrumbs: React.FC<{ steps: BreadcrumbStep[]; activeKey?: string; currentClass?: string }> = ({
  steps, activeKey, currentClass = 'bg-blue-100 text-blue-700',
}) => (
  <div className="flex items-center gap-1 overflow-x-auto pb-1">
    {steps.map((s, i) => {
      const classes = s.state === 'current' ? currentClass : STATE_CLASSES[s.state];
      const isActive = activeKey === s.key;
      const chip = (
        <span
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${classes} ${
            isActive ? 'ring-2 ring-offset-1 ring-indigo-400' : ''
          } ${s.onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
        >
          {s.state === 'done' && '✓ '}{s.label}
        </span>
      );
      return (
        <React.Fragment key={s.key}>
          {s.onClick ? (
            <button type="button" onClick={s.onClick} className="flex-shrink-0">
              {chip}
            </button>
          ) : (
            <div className="flex-shrink-0">{chip}</div>
          )}
          {i < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          )}
        </React.Fragment>
      );
    })}
  </div>
);
