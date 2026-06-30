import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  jti: string;
}

export const signAccessToken = (payload: Omit<AccessTokenPayload, 'jti'>): string =>
  jwt.sign(
    { ...payload, jti: uuidv4() },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
};

export const signRefreshToken = (): string => uuidv4();

export const storeRefreshToken = async (
  token: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { token, userId, expiresAt, ipAddress, userAgent },
  });
};

export const rotateRefreshToken = async (
  oldToken: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> => {
  // Revoke old token
  await prisma.refreshToken.update({
    where: { token: oldToken },
    data: { isRevoked: true },
  });

  // Issue new token
  const newToken = signRefreshToken();
  await storeRefreshToken(newToken, userId, ipAddress, userAgent);
  return newToken;
};

export const revokeRefreshToken = async (token: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { token },
    data: { isRevoked: true },
  });
};

export const revokeAllUserRefreshTokens = async (userId: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true },
  });
};

export const findValidRefreshToken = async (token: string) => {
  return prisma.refreshToken.findFirst({
    where: {
      token,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
};

export const cleanExpiredTokens = async (): Promise<void> => {
  await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { isRevoked: true }] },
  });
};
