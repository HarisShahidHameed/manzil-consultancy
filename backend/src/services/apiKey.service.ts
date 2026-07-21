import { prisma } from '../config/database';
import { generateApiKey, hashApiKey } from '../utils/apiKey';

// Scopes an API key may be granted — deliberately just the read side of the two
// resources exposed to third parties (see routes/public.routes.ts). Extend this list
// (and the corresponding query in publicApi.service.ts) if more gets exposed later.
export const AVAILABLE_API_SCOPES = ['clients:read', 'appointments:read'] as const;
export type ApiScope = (typeof AVAILABLE_API_SCOPES)[number];

const API_KEY_SELECT = {
  id: true, name: true, keyPrefix: true, scopes: true, isActive: true,
  lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

export const createApiKey = async (data: {
  name: string; scopes: string[]; expiresAt?: string; createdById?: string;
}) => {
  const { raw, keyPrefix, keyHash } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      name: data.name,
      keyPrefix,
      keyHash,
      scopes: data.scopes,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      createdById: data.createdById,
    },
    select: API_KEY_SELECT,
  });
  // The only point in this key's lifetime the raw value is ever available —
  // the caller must show it to the admin now, it can't be retrieved again.
  return { ...key, rawKey: raw };
};

export const listApiKeys = async () => {
  return prisma.apiKey.findMany({ select: API_KEY_SELECT, orderBy: { createdAt: 'desc' } });
};

export const revokeApiKey = async (id: string) => {
  return prisma.apiKey.update({
    where: { id },
    data: { isActive: false, revokedAt: new Date() },
    select: API_KEY_SELECT,
  });
};

export const deleteApiKey = async (id: string) => {
  return prisma.apiKey.delete({ where: { id } });
};

// Used by the auth middleware on every request — a raw miss (bad key) and an
// inactive/expired key both just mean "unauthenticated" to the caller.
export const findActiveApiKeyByRaw = async (raw: string) => {
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(raw) } });
  if (!key || !key.isActive) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  return key;
};

// Fire-and-forget from the middleware — a lost update to lastUsedAt isn't worth
// blocking or failing the request over.
export const touchApiKeyLastUsed = (id: string): void => {
  prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => {});
};
