import bcrypt from 'bcryptjs';
import { z } from 'zod';

const SALT_ROUNDS = 10;

/**
 * Shared by every endpoint that sets a password (signup, forgot-password
 * reset, verifier change-password) so the rule can't drift between them.
 * zod runs every chained check and collects all failing messages rather
 * than stopping at the first, so a caller who's missing three of the four
 * character classes sees all three at once, not one-at-a-time.
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character');

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
