import { prisma } from '../config/database';

/**
 * Exclusive "Add Client" lock (1 Oct 2026 #8): only one member of staff across the system may
 * have the Add Client form open at a time.
 *
 * One row (id ADD_CLIENT) records who holds it. The open form re-acquires it every
 * HEARTBEAT_MS; a holder that stops heartbeating (tab closed, laptop asleep, network gone) is
 * treated as gone once STALE_AFTER_MS passes, so a crashed browser can never lock everyone
 * out for longer than that. The same user may hold it from several tabs — it is one person
 * at the form, which is what the rule is about.
 */
export const LOCK_ID = 'ADD_CLIENT';
export const HEARTBEAT_MS = 30_000;
export const STALE_AFTER_MS = 90_000;

export interface LockHolder {
  holderId: string;
  holderName: string;
  acquiredAt: Date;
  heartbeatAt: Date;
}

export type AcquireResult =
  | { acquired: true; holder: LockHolder }
  | { acquired: false; holder: LockHolder };

const staleBefore = (now = new Date()) => new Date(now.getTime() - STALE_AFTER_MS);

/**
 * Take (or keep) the lock. Atomic: a single INSERT ... ON CONFLICT DO UPDATE that only
 * overwrites the existing row when it is stale or already ours, so two people clicking
 * Add Client in the same instant cannot both win.
 */
export const acquire = async (user: { id: string; name: string }, token: string): Promise<AcquireResult> => {
  const now = new Date();
  const rows = await prisma.$queryRaw<LockHolder[]>`
    INSERT INTO "client_creation_locks" ("id", "holderId", "holderName", "token", "acquiredAt", "heartbeatAt")
    VALUES (${LOCK_ID}, ${user.id}, ${user.name}, ${token}, ${now}, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "holderId"    = EXCLUDED."holderId",
      "holderName"  = EXCLUDED."holderName",
      "token"       = EXCLUDED."token",
      -- Keep the original start time while the same person just heartbeats.
      "acquiredAt"  = CASE WHEN "client_creation_locks"."holderId" = EXCLUDED."holderId"
                           AND "client_creation_locks"."heartbeatAt" >= ${staleBefore(now)}
                           THEN "client_creation_locks"."acquiredAt" ELSE EXCLUDED."acquiredAt" END,
      "heartbeatAt" = EXCLUDED."heartbeatAt"
    WHERE "client_creation_locks"."holderId" = EXCLUDED."holderId"
       OR "client_creation_locks"."heartbeatAt" < ${staleBefore(now)}
    RETURNING "holderId", "holderName", "acquiredAt", "heartbeatAt"`;
  if (rows.length > 0) return { acquired: true, holder: rows[0] };

  const current = await prisma.clientCreationLock.findUnique({ where: { id: LOCK_ID } });
  // The row can only be missing here if it was released between the two statements; try once more.
  if (!current) return acquire(user, token);
  return { acquired: false, holder: current };
};

/** Who holds the lock right now, or null when it is free (no row, or a stale one). */
export const currentHolder = async (): Promise<LockHolder | null> => {
  const row = await prisma.clientCreationLock.findUnique({ where: { id: LOCK_ID } });
  return row && row.heartbeatAt >= staleBefore() ? row : null;
};

/** Let go of the lock — only if this form instance still holds it. */
export const release = async (userId: string, token: string): Promise<void> => {
  await prisma.clientCreationLock.deleteMany({ where: { id: LOCK_ID, holderId: userId, token } });
};

/** Super Admin escape hatch for a lock someone walked away from. */
export const forceRelease = async (): Promise<void> => {
  await prisma.clientCreationLock.deleteMany({ where: { id: LOCK_ID } });
};

/**
 * Server-side backstop for the form: refuses a create while somebody ELSE holds a live lock.
 * A free (or stale) lock does not block — the rule is about two people at the form at once,
 * and failing closed would stop all client creation whenever a heartbeat hiccuped.
 */
export const assertMayCreate = async (userId: string | undefined): Promise<void> => {
  const holder = await currentHolder();
  if (holder && holder.holderId !== userId) {
    const e = new Error('CLIENT_CREATION_LOCKED') as Error & { holder: LockHolder };
    e.holder = holder;
    throw e;
  }
};
