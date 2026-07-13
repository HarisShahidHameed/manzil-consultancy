import React from 'react';
import { Button } from './Button';

interface PaginationMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

interface PaginationProps {
  meta?: PaginationMeta;
  onPageChange: (page: number) => void;
  limit?: number;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

export const Pagination: React.FC<PaginationProps> = ({
  meta,
  onPageChange,
  limit,
  onLimitChange,
  limitOptions = [10, 20, 50, 100],
}) => {
  if (!meta || !meta.total) return null;
  const page = meta.page ?? 1;
  const totalPages = meta.totalPages ?? 1;
  const showPager = totalPages > 1;
  if (!showPager && !onLimitChange) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 flex-wrap gap-2">
      <p className="text-sm text-gray-500">
        Page {page} of {totalPages}{meta.total != null ? ` (${meta.total} total)` : ''}
      </p>
      <div className="flex items-center gap-3">
        {onLimitChange && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Rows per page
            <select
              value={limit}
              onChange={e => onLimitChange(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {limitOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        )}
        {showPager && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
