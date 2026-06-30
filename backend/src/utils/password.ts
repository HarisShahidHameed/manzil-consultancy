import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, SALT_ROUNDS);

export const comparePassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

export const generateSecureToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString('hex');

export const validatePasswordStrength = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) return { valid: false, message: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, message: 'Password must contain an uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, message: 'Password must contain a lowercase letter' };
  if (!/\d/.test(password)) return { valid: false, message: 'Password must contain a number' };
  if (!/[@$!%*?&^#]/.test(password)) return { valid: false, message: 'Password must contain a special character (@$!%*?&^#)' };
  return { valid: true };
};
