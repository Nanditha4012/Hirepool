import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  /**
   * Phase 5: force-logout support. Carried on the access token too (not just
   * the refresh token) purely for symmetry/completeness — requireAuth does
   * NOT check it against the DB (see migrations/20240106000001-phase5-admin-portal.js
   * for why that's a deliberate stateless-vs-checked-on-refresh tradeoff).
   */
  tokenVersion: number;
}

/**
 * Deviation from spec: the refresh token payload also carries `role`
 * (spec described it as `{ sub: string }`). Reason: POST /auth/refresh
 * needs to reissue an access token with a role claim, and the `users`
 * table's RLS SELECT policies (see migrations/20240101000004) only allow
 * a row to be read by its own owner (id = current session's user id) or
 * by an admin session — there is no policy permitting a fully anonymous
 * "look up a user by id" query. Since /refresh only has the refresh JWT
 * to go on (no session yet), a DB lookup to recover the role would be
 * blocked by RLS. Carrying `role` in the refresh token (still
 * signed/verified with JWT_REFRESH_SECRET, so it can't be forged) avoids
 * that DB round-trip entirely and sidesteps the gap.
 *
 * Phase 5 also adds `tokenVersion`: authController.refresh now looks the
 * user up in the DB anyway (to check accountStatus), so this is compared
 * against the DB's current users.token_version on every refresh — a
 * mismatch means the session was force-logged-out (suspend/ban) since this
 * refresh token was issued, and the refresh is rejected.
 */
export interface RefreshTokenPayload {
  sub: string;
  role: string;
  tokenVersion: number;
}

/**
 * Deviation from spec: also carries `role`, for the same RLS reason as
 * RefreshTokenPayload above — user_totp_secrets is owner-scoped by
 * user_id only, but the controller still needs to know the role to open
 * a correctly-populated runInRequestContext transaction, and to re-derive
 * it without an extra (RLS-blocked, anonymous) users lookup.
 */
export interface TotpChallengePayload {
  sub: string;
  role: string;
  purpose: 'totp_challenge';
}

/**
 * `expiresIn` defaults to the env-configured session lifetime, but callers
 * can override it — used by admin impersonation (adminController.impersonate)
 * to issue a short-lived (5m) access token instead of a normal session.
 */
export function signAccessToken(
  payload: AccessTokenPayload,
  expiresIn: jwt.SignOptions['expiresIn'] = env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

const TOTP_CHALLENGE_EXPIRES_IN = '5m' as jwt.SignOptions['expiresIn'];

export function signTotpChallengeToken(payload: { sub: string; role: string }): string {
  return jwt.sign(
    { sub: payload.sub, role: payload.role, purpose: 'totp_challenge' as const },
    env.JWT_ACCESS_SECRET,
    { expiresIn: TOTP_CHALLENGE_EXPIRES_IN },
  );
}

export function verifyTotpChallengeToken(token: string): TotpChallengePayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as TotpChallengePayload;
  if (decoded.purpose !== 'totp_challenge') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
}

/**
 * Forgot-password flow: authController.verifyResetOtp issues one of these
 * only after the emailed OTP has been checked against the DB, so possessing
 * a valid token already proves the OTP step passed. authController.resetPassword
 * then only needs to verify the signature/purpose/expiry — no second OTP
 * check — before allowing exactly one password change.
 */
export interface PasswordResetTokenPayload {
  sub: string;
  purpose: 'password_reset';
}

const PASSWORD_RESET_TOKEN_EXPIRES_IN = '15m' as jwt.SignOptions['expiresIn'];

export function signPasswordResetToken(payload: { sub: string }): string {
  return jwt.sign(
    { sub: payload.sub, purpose: 'password_reset' as const },
    env.JWT_ACCESS_SECRET,
    { expiresIn: PASSWORD_RESET_TOKEN_EXPIRES_IN },
  );
}

export function verifyPasswordResetToken(token: string): PasswordResetTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as PasswordResetTokenPayload;
  if (decoded.purpose !== 'password_reset') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
}

/**
 * Parses simple duration strings like "15m", "30d", "1h" (the same format
 * used by JWT_ACCESS_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN) into
 * milliseconds, for use as a cookie maxAge. Falls back to 30 days if the
 * string can't be parsed.
 */
function parseDurationToMs(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d|w|y)?$/i.exec(input.trim());
  const fallback = 30 * 24 * 60 * 60 * 1000;
  if (!match) return fallback;

  const value = Number(match[1]);
  const unit = (match[2] ?? 'ms').toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] ?? 1);
}

export function getRefreshCookieMaxAgeMs(): number {
  return parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN);
}
