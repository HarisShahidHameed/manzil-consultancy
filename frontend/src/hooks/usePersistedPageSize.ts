import { useCallback, useState } from 'react';

// Keeps each listing's chosen "rows per page" for the duration of the session —
// cleared on logout via clearPersistedPageSizes() so it doesn't leak between users.
const STORAGE_PREFIX = 'manzil:pageSize:';

export function usePersistedPageSize(key: string, defaultLimit: number) {
  const storageKey = STORAGE_PREFIX + key;

  const [limit, setLimitState] = useState<number>(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? stored : defaultLimit;
  });

  const setLimit = useCallback((next: number) => {
    setLimitState(next);
    localStorage.setItem(storageKey, String(next));
  }, [storageKey]);

  return [limit, setLimit] as const;
}

export function clearPersistedPageSizes() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
  }
}
