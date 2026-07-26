import { Request, Response } from 'express';
import { z } from 'zod';
import { Op, UniqueConstraintError } from 'sequelize';
import { OAuth2Client } from 'google-auth-library';
import { User, CandidateProfile, CompanyProfile, TotpSecret } from '../models';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { hashPassword, comparePassword } from '../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signTotpChallengeToken,
  verifyTotpChallengeToken,
  getRefreshCookieMaxAgeMs,
} from '../utils/jwt';
import { generateTotpSecret, verifyTotpToken, generateQrCodeDataUrl } from '../utils/totp';

const SELF_SIGNUP_ROLES = ['candidate', 'company'] as const;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(SELF_SIGNUP_ROLES),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const totpEnrollSchema = z.object({
  challengeToken: z.string().min(1),
});

const totpVerifySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(1),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1),
  role: z.enum(SELF_SIGNUP_ROLES).optional(),
});

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const REFRESH_COOKIE_NAME = 'refresh_token';

function refreshCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
  };
}

/** Signs a fresh access+refresh token pair and sets the refresh cookie. */
function issueSession(res: Response, user: { id: string; role: string }): string {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id, role: user.role });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshCookieOptions(),
    maxAge: getRefreshCookieMaxAgeMs(),
  });

  return accessToken;
}

/**
 * Creates the matching profile row for a newly-created candidate/company
 * user. Must be called inside the same transaction as the User.create.
 *
 * Note: CompanyProfile.company_name is NOT NULL, but neither
 * signup() nor googleAuth() collect a company name (spec's signup body is
 * only { email, password, role }) — the real company portal (Phase 3) is
 * expected to let the company fill this in properly. Using the account
 * email as a placeholder here so the row can exist at all.
 */
async function createProfileForNewUser(
  userId: string,
  email: string,
  role: (typeof SELF_SIGNUP_ROLES)[number],
  options: Parameters<typeof CandidateProfile.create>[1],
): Promise<void> {
  if (role === 'candidate') {
    await CandidateProfile.create({ userId, status: 'draft' }, options);
  } else {
    await CompanyProfile.create({ userId, companyName: email }, options);
  }
}

/**
 * Builds the { totpEnrollmentRequired | totpRequired, challengeToken }
 * response for a verifier/admin user at login time.
 */
async function buildTotpChallengeResponse(user: User): Promise<Record<string, unknown>> {
  const totpSecret = await runInRequestContext({ id: user.id, role: user.role }, (t) =>
    TotpSecret.findOne({ where: { userId: user.id }, transaction: t }),
  );

  const challengeToken = signTotpChallengeToken({ sub: user.id, role: user.role });

  if (!totpSecret || !totpSecret.enabledAt) {
    return { totpEnrollmentRequired: true, challengeToken };
  }

  return { totpRequired: true, challengeToken };
}

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, role } = signupSchema.parse(req.body);
  const passwordHash = await hashPassword(password);

  let user: User;
  try {
    user = await runInRequestContext(null, async (t) => {
      const created = await User.create({ email, passwordHash, role }, { transaction: t });
      await createProfileForNewUser(created.id, email, role, { transaction: t });
      return created;
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw err;
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role });
  res.status(201).json({
    accessToken,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  // NOTE (known RLS gap): this SELECT runs with a null request context —
  // no session exists yet, since resolving *who* is logging in is the
  // whole point of this query. The `users` table's RLS policies (see
  // migrations/20240101000004-enable-rls-and-policies.js) only allow a
  // row to be read by its own owner (id = current session's user id) or
  // by an admin session; there's no policy permitting an anonymous
  // "find by email" read. Under that migration exactly as written, this
  // query returns no rows even for a real user, so login will 401 for
  // everyone. Left as-is (matching the spec'd null-context pattern used
  // for registration) rather than silently changing the RLS policy —
  // that's a security-relevant decision that should be made deliberately,
  // e.g. by adding a narrowly-scoped anonymous select-by-email policy or
  // a SECURITY DEFINER auth lookup function.
  const user = await runInRequestContext(null, (t) =>
    User.findOne({ where: { email }, transaction: t }),
  );

  if (!user || !user.passwordHash) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const passwordValid = await comparePassword(password, user.passwordHash);
  if (!passwordValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.role === 'verifier' || user.role === 'admin') {
    res.json(await buildTotpChallengeResponse(user));
    return;
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role });
  res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
});

export const totpEnroll = asyncHandler(async (req: Request, res: Response) => {
  const { challengeToken } = totpEnrollSchema.parse(req.body);

  let payload;
  try {
    payload = verifyTotpChallengeToken(challengeToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired challenge token');
  }

  if (payload.role !== 'verifier' && payload.role !== 'admin') {
    throw ApiError.forbidden('TOTP enrollment is only available for verifier/admin accounts');
  }

  const context = { id: payload.sub, role: payload.role };

  const existing = await runInRequestContext(context, (t) =>
    TotpSecret.findOne({ where: { userId: payload.sub }, transaction: t }),
  );

  if (existing?.enabledAt) {
    throw ApiError.conflict('TOTP is already enrolled for this account');
  }

  const user = await runInRequestContext(context, (t) => User.findByPk(payload.sub, { transaction: t }));
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const { secret, otpauthUrl } = generateTotpSecret(user.email);
  const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);

  await runInRequestContext(context, async (t) => {
    if (existing) {
      existing.secret = secret;
      await existing.save({ transaction: t });
    } else {
      await TotpSecret.create({ userId: payload.sub, secret }, { transaction: t });
    }
  });

  res.json({ qrCodeDataUrl, secret });
});

export const totpVerify = asyncHandler(async (req: Request, res: Response) => {
  const { challengeToken, code } = totpVerifySchema.parse(req.body);

  let payload;
  try {
    payload = verifyTotpChallengeToken(challengeToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired challenge token');
  }

  const context = { id: payload.sub, role: payload.role };

  const totpSecret = await runInRequestContext(context, (t) =>
    TotpSecret.findOne({ where: { userId: payload.sub }, transaction: t }),
  );

  if (!totpSecret) {
    throw ApiError.unauthorized('Invalid code');
  }

  const codeValid = verifyTotpToken(totpSecret.secret, code);
  if (!codeValid) {
    throw ApiError.unauthorized('Invalid code');
  }

  const wasFirstEnrollment = !totpSecret.enabledAt;
  if (wasFirstEnrollment) {
    await runInRequestContext(context, async (t) => {
      totpSecret.enabledAt = new Date();
      await totpSecret.save({ transaction: t });
    });
  }

  const user = await runInRequestContext(context, (t) => User.findByPk(payload.sub, { transaction: t }));
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role });
  res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
});

export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
  const { idToken, role: requestedRole } = googleAuthSchema.parse(req.body);

  const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const tokenPayload = ticket.getPayload();

  if (!tokenPayload?.email || !tokenPayload.sub) {
    throw ApiError.unauthorized('Invalid Google token');
  }

  const googleId = tokenPayload.sub;
  const email = tokenPayload.email;

  // Same known RLS caveat as login() above — this lookup runs with a
  // null context because no session exists until the user is resolved.
  let user = await runInRequestContext(null, (t) =>
    User.findOne({ where: { [Op.or]: [{ googleId }, { email }] }, transaction: t }),
  );

  if (user && !user.googleId) {
    const existingUser = user;
    await runInRequestContext({ id: existingUser.id, role: existingUser.role }, async (t) => {
      existingUser.googleId = googleId;
      await existingUser.save({ transaction: t });
    });
    user = existingUser;
  }

  if (!user) {
    if (requestedRole !== 'candidate' && requestedRole !== 'company') {
      throw ApiError.forbidden('role must be "candidate" or "company" to sign up via Google');
    }

    try {
      user = await runInRequestContext(null, async (t) => {
        const created = await User.create(
          { email, googleId, role: requestedRole, passwordHash: null },
          { transaction: t },
        );
        await createProfileForNewUser(created.id, email, requestedRole, { transaction: t });
        return created;
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw ApiError.conflict('An account with this email already exists');
      }
      throw err;
    }
  }

  if (user.role === 'verifier' || user.role === 'admin') {
    res.json(await buildTotpChallengeResponse(user));
    return;
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role });
  res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw ApiError.unauthorized('Missing refresh token');
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const accessToken = issueSession(res, { id: payload.sub, role: payload.role });
  res.json({ accessToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user;
  if (!authUser) {
    throw ApiError.unauthorized();
  }

  const result = await runInRequestContext(authUser, async (t) => {
    const user = await User.findByPk(authUser.id, { transaction: t });
    if (!user) return null;

    let profile: CandidateProfile | CompanyProfile | null = null;
    if (user.role === 'candidate') {
      profile = await CandidateProfile.findOne({ where: { userId: user.id }, transaction: t });
    } else if (user.role === 'company') {
      profile = await CompanyProfile.findOne({ where: { userId: user.id }, transaction: t });
    }

    return { user, profile };
  });

  if (!result?.user) {
    throw ApiError.notFound('User not found');
  }

  res.json({
    id: result.user.id,
    email: result.user.email,
    role: result.user.role,
    phone: result.user.phone,
    profile: result.profile,
  });
});
