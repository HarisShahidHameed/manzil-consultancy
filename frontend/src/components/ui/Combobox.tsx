import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { clsx } from 'clsx';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Searchable dropdown restricted to a fixed list of values (destination, city, etc.).
export const Combobox: React.FC<ComboboxProps> = ({ value, onChange, options, placeholder, className, disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2.5 text-sm bg-white text-left',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors',
          disabled && 'bg-gray-50 text-gray-500 cursor-not-allowed',
          className
        )}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value || placeholder || 'Select...'}</span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
          <div className="relative border-b border-gray-100">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400">No matches</li>
            ) : (
              filtered.map(o => (
                <li key={o}>
                  <button
                    type="button"
                    onClick={() => { onChange(o); setOpen(false); setQuery(''); }}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-indigo-50',
                      o === value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                    )}
                  >
                    {o}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
