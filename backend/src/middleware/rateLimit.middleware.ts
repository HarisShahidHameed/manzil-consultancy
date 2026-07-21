import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    sendError(res, 'Too many authentication attempts. Try again in 15 minutes.', 429),
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    sendError(res, 'Too many password reset requests. Try again in 1 hour.', 429),
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    sendError(res, 'Too many requests. Please slow down.', 429),
});

// Keyed per API key rather than per IP — a third party's own backend fronts many end
// users from one IP, so an IP-based limit would throttle every legitimate integration
// consumer as one bucket. Falls back to IP only for the pre-auth case (no key yet/bad key).
export const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header('X-API-Key') ?? req.ip ?? 'unknown',
  handler: (_req, res) =>
    sendError(res, 'Too many requests. Please slow down.', 429),
});
