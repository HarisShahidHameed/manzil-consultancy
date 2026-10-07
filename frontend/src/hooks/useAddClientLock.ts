import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { acquireCreationLock, newLockToken, releaseCreationLock, releaseCreationLockOnUnload } from '../api/clientLock';

export type AddClientLockState =
  | { status: 'acquiring' }
  | { status: 'held' }
  | { status: 'blocked'; message: string };

/**
 * Holds the exclusive Add Client lock for as long as the form using it is mounted
 * (1 Oct 2026 #8): takes it on mount (reusing the token the Add Client button already took it
 * with, when there is one), heartbeats it, and lets go on unmount or when the tab closes.
 *
 * If another member of staff holds it — or takes it over after this tab went quiet for long
 * enough to go stale — the state turns `blocked` and the form must not be submitted.
 */
export const useAddClientLock = (enabled: boolean, initialToken?: string) => {
  const token = useRef(initialToken ?? newLockToken());
  const [state, setState] = useState<AddClientLockState>({ status: 'acquiring' });

  const attempt = useCallback(async () => {
    try {
      const res = await acquireCreationLock(token.current);
      setState({ status: 'held' });
      return res.heartbeatMs;
    } catch (e) {
      const err = e as AxiosError<{ message?: string }>;
      setState({
        status: 'blocked',
        message: err.response?.status === 409
          ? err.response.data?.message ?? 'Another member of staff is currently adding a client.'
          : 'Could not reserve the Add Client form. Check your connection and try again.',
      });
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    attempt().then(ms => {
      if (cancelled) return;
      timer = setInterval(attempt, ms ?? 30_000);
    });
    const onUnload = () => releaseCreationLockOnUnload(token.current);
    window.addEventListener('pagehide', onUnload);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('pagehide', onUnload);
      releaseCreationLock(token.current);
    };
  }, [enabled, attempt]);

  return { state, retry: attempt };
};
