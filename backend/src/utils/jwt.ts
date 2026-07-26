import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: string;
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
 */
export interface RefreshTokenPayload {
  sub: string;
  role: string;
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

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
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
