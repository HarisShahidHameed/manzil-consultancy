import { prisma } from '../config/database';
import { env } from '../config/env';
import { hashPassword, comparePassword, generateSecureToken } from '../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  storeRefreshToken,
  findValidRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from './token.service';
import { createAuditLog } from '../utils/audit';
import { Request } from 'express';

export const getUserWithPermissions = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });
  if (!user) return null;

  const roles = user.userRoles.map(ur => ur.role.name);
  const permissions = [
    ...new Set(
      user.userRoles.flatMap(ur =>
        ur.role.rolePermissions.map(rp => rp.permission.name)
      )
    ),
  ];

  return { user, roles, permissions };
};

export const registerUser = async (
  data: { email: string; password: string; firstName: string; lastName: string },
  req?: Request
) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error('EMAIL_TAKEN');

  const hashedPassword = await hashPassword(data.password);

  const defaultRole = await prisma.role.findUnique({ where: { name: 'USER' } });
  if (!defaultRole) throw new Error('DEFAULT_ROLE_MISSING');

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      userRoles: { create: { roleId: defaultRole.id } },
    },
  });

  await createAuditLog({
    userId: user.id,
    action: 'REGISTER',
    resource: 'auth',
    success: true,
    req,
  });

  return user;
};

export const loginUser = async (
  email: string,
  password: string,
  req?: Request
) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await createAuditLog({ action: 'LOGIN_FAILED', resource: 'auth', details: { email }, success: false, req });
    throw new Error('INVALID_CREDENTIALS');
  }

  // Check lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await createAuditLog({ userId: user.id, action: 'LOGIN_LOCKED', resource: 'auth', success: false, req });
    throw new Error('ACCOUNT_LOCKED');
  }

  if (!user.isActive) throw new Error('ACCOUNT_INACTIVE');

  const passwordMatch = await comparePassword(password, user.password);
  if (!passwordMatch) {
    const failedCount = user.failedLoginCount + 1;
    const shouldLock = failedCount >= env.MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000)
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failedCount,
        ...(lockedUntil && { lockedUntil }),
      },
    });

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN_FAILED',
      resource: 'auth',
      details: { failedCount },
      success: false,
      req,
    });
    throw new Error(shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS');
  }

  // Reset failed attempts on success
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const result = await getUserWithPermissions(user.id);
  if (!result) throw new Error('USER_NOT_FOUND');

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    roles: result.roles,
    permissions: result.permissions,
  });

  const refreshToken = signRefreshToken();
  const ipAddress = req ? getClientIpFromReq(req) : undefined;
  const userAgent = req?.headers['user-agent'];
  await storeRefreshToken(refreshToken, user.id, ipAddress, userAgent);

  await createAuditLog({ userId: user.id, action: 'LOGIN', resource: 'auth', success: true, req });

  return { accessToken, refreshToken, user: result.user, roles: result.roles, permissions: result.permissions };
};

export const refreshTokens = async (oldRefreshToken: string, req?: Request) => {
  const storedToken = await findValidRefreshToken(oldRefreshToken);
  if (!storedToken) throw new Error('INVALID_REFRESH_TOKEN');

  const result = await getUserWithPermissions(storedToken.userId);
  if (!result || !result.user.isActive) throw new Error('USER_NOT_FOUND');

  const accessToken = signAccessToken({
    sub: result.user.id,
    email: result.user.email,
    roles: result.roles,
    permissions: result.permissions,
  });

  const ipAddress = req ? getClientIpFromReq(req) : undefined;
  const userAgent = req?.headers['user-agent'];
  const newRefreshToken = await rotateRefreshToken(oldRefreshToken, result.user.id, ipAddress, userAgent);

  return { accessToken, refreshToken: newRefreshToken };
};

export const logoutUser = async (refreshToken: string, userId: string, req?: Request) => {
  await revokeRefreshToken(refreshToken);
  await createAuditLog({ userId, action: 'LOGOUT', resource: 'auth', success: true, req });
};

export const logoutAllDevices = async (userId: string, req?: Request) => {
  await revokeAllUserRefreshTokens(userId);
  await createAuditLog({ userId, action: 'LOGOUT_ALL', resource: 'auth', success: true, req });
};

export const initiatePasswordReset = async (email: string, req?: Request) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Silent fail to prevent email enumeration

  const token = generateSecureToken();
  const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetTokenExpiry: expiry },
  });

  await createAuditLog({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', resource: 'auth', success: true, req });

  // In production, send email here with token
  return { token, userId: user.id }; // dev only
};

export const resetPassword = async (token: string, newPassword: string, req?: Request) => {
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) throw new Error('INVALID_OR_EXPIRED_TOKEN');

  const hashedPassword = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetTokenExpiry: null,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  await revokeAllUserRefreshTokens(user.id);
  await createAuditLog({ userId: user.id, action: 'PASSWORD_RESET', resource: 'auth', success: true, req });
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
  req?: Request
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('USER_NOT_FOUND');

  const passwordMatch = await comparePassword(currentPassword, user.password);
  if (!passwordMatch) throw new Error('INVALID_CURRENT_PASSWORD');

  const hashedPassword = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  await revokeAllUserRefreshTokens(userId);
  await createAuditLog({ userId, action: 'PASSWORD_CHANGED', resource: 'auth', success: true, req });
};

const getClientIpFromReq = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
};
