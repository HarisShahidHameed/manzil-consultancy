import React from 'react';
import { clsx } from 'clsx';
import { CheckCircle, AlertCircle, XCircle, Info } from 'lucide-react';

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

const CONFIG: Record<AlertVariant, { icon: React.ElementType; classes: string }> = {
  success: { icon: CheckCircle, classes: 'bg-green-50 border-green-200 text-green-800' },
  error:   { icon: XCircle,     classes: 'bg-red-50 border-red-200 text-red-800' },
  warning: { icon: AlertCircle, classes: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  info:    { icon: Info,        classes: 'bg-blue-50 border-blue-200 text-blue-800' },
};

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  message,
  onClose,
  className,
}) => {
  const { icon: Icon, classes } = CONFIG[variant];

  return (
    <div className={clsx('flex items-start gap-3 p-4 rounded-lg border', classes, className)}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold text-sm">{title}</p>}
        <p className="text-sm">{message}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="flex-shrink-0 hover:opacity-70 transition-opacity">
          <XCircle className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
