import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response';
import { env } from '../config/env';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth',
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await authService.registerUser(req.body, req);
    sendSuccess(
      res,
      'Registration successful',
      { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      201
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'EMAIL_TAKEN') {
      sendError(res, 'Email already registered', 409);
    } else {
      sendError(res, 'Registration failed', 500);
    }
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password, req);

    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);

    sendSuccess(res, 'Login successful', {
      accessToken: result.accessToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      roles: result.roles,
      permissions: result.permissions,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'INVALID_CREDENTIALS') sendError(res, 'Invalid email or password', 401);
    else if (msg === 'ACCOUNT_LOCKED') sendError(res, 'Account locked. Contact admin.', 423);
    else if (msg === 'ACCOUNT_INACTIVE') sendError(res, 'Account is inactive', 403);
    else sendError(res, 'Login failed', 500);
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies[REFRESH_COOKIE];
  if (!token) {
    sendError(res, 'Refresh token missing', 401);
    return;
  }

  try {
    const result = await authService.refreshTokens(token, req);
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);
    sendSuccess(res, 'Token refreshed', { accessToken: result.accessToken });
  } catch {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    sendError(res, 'Invalid refresh token', 401);
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies[REFRESH_COOKIE];
  if (token && req.user) {
    await authService.logoutUser(token, req.user.sub, req);
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  sendSuccess(res, 'Logged out successfully');
};

export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { sendError(res, 'Unauthorized', 401); return; }
  await authService.logoutAllDevices(req.user.sub, req);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  sendSuccess(res, 'Logged out from all devices');
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  const result = await authService.initiatePasswordReset(email, req);
  // Always return 200 to prevent email enumeration
  const data = env.NODE_ENV !== 'production' && result ? { resetToken: result.token } : undefined;
  sendSuccess(res, 'If that email exists, a reset link has been sent', data);
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password, req);
    sendSuccess(res, 'Password reset successfully');
  } catch {
    sendError(res, 'Invalid or expired reset token', 400);
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { sendError(res, 'Unauthorized', 401); return; }
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.sub, currentPassword, newPassword, req);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    sendSuccess(res, 'Password changed. Please log in again.');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'INVALID_CURRENT_PASSWORD') sendError(res, 'Current password is incorrect', 400);
    else sendError(res, 'Password change failed', 500);
  }
};

export const me = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { sendError(res, 'Unauthorized', 401); return; }
  const { prisma } = await import('../config/database');
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, email: true, firstName: true, lastName: true, isActive: true, isEmailVerified: true },
  });
  if (!user) { sendError(res, 'User not found', 404); return; }
  sendSuccess(res, 'Current user', {
    ...user,
    roles: req.user.roles,
    permissions: req.user.permissions,
  });
};
