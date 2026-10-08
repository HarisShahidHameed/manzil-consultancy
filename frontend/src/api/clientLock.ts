import api, { getAccessToken } from './axios';
import type { ApiResponse } from '../types';

// Exclusive Add Client lock (1 Oct 2026 #8) — see backend clientCreationLock.service.ts.

export interface CreationLockHolder { holderId: string; holderName: string; since: string }

export const newLockToken = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Take or keep the lock. Rejects with a 409 (message names the holder) when someone else has it. */
export const acquireCreationLock = (token: string) =>
  api.post<ApiResponse<{ holder: CreationLockHolder; heartbeatMs: number }>>('/clients/creation-lock', { token })
    .then(r => r.data.data!);

export const releaseCreationLock = (token: string) =>
  api.delete('/clients/creation-lock', { params: { token } }).catch(() => undefined);

export const forceReleaseCreationLock = () =>
  api.delete('/clients/creation-lock', { params: { force: 'true' } });

/**
 * Release while the tab is closing. A normal request is cancelled when the page unloads, so
 * this uses fetch keepalive. Best-effort only: if it never arrives, the lock still frees
 * itself once its heartbeat goes stale on the server.
 */
export const releaseCreationLockOnUnload = (token: string) => {
  const base = import.meta.env.VITE_API_URL ?? '/api';
  const access = getAccessToken();
  try {
    fetch(`${base}/clients/creation-lock?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
      keepalive: true,
      credentials: 'include',
      headers: access ? { Authorization: `Bearer ${access}` } : undefined,
    });
  } catch { /* the stale-heartbeat expiry covers this */ }
};
