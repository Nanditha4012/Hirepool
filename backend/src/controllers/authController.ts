import { Request, Response } from 'express';
import { z } from 'zod';
import { Op, UniqueConstraintError } from 'sequelize';
import { OAuth2Client } from 'google-auth-library';
import { User, CandidateProfile, CompanyProfile, TotpSecret, PlanMaster } from '../models';
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
import { generateTotpSecret, verifyTotpToken, generateQrCodeDataUrl, buildOtpauthUrl } from '../utils/totp';

const SELF_SIGNUP_ROLES = ['candidate', 'company'] as const;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(SELF_SIGNUP_ROLES),
});

/**
 * `identifier` is either an email (candidate/company, who self-sign-up) or a
 * username (verifier/admin, who we provision — see
 * seeders/20240105000001-seed-verifier-account.js). It is deliberately NOT
 * `.email()`-validated: rejecting "verifier01" at the schema before the
 * lookup would make the whole username path impossible.
 *
 * `email` is still accepted as an alias so any client built against the
 * pre-Phase-5 body shape keeps working.
 */
const loginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: z.string().min(1),
  })
  .refine((body) => Boolean(body.identifier || body.email), {
    message: 'identifier is required',
    path: ['identifier'],
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
    // Explicit, rather than relying on the browser's implicit "default
    // path" derivation (the directory of whichever URL set the cookie).
    // That currently happens to resolve to /api/auth anyway since every
    // route here lives under that prefix, but it's fragile — it would
    // silently stop covering /api/auth/refresh if routes were ever
    // reorganized. clearCookie() below must use the exact same options
    // (path/sameSite/secure) or the browser won't recognize it as the same
    // cookie to delete.
    path: '/api/auth',
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
  };
}

/** Signs a fresh access+refresh token pair and sets the refresh cookie. */
function issueSession(
  res: Response,
  user: { id: string; role: string; tokenVersion: number },
): string {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion });
  const refreshToken = signRefreshToken({
    sub: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

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
 * only { email, password, role }) — companyController.upsertMyCompanyProfile
 * (Phase 3) is where the company fills this in properly. Using the account
 * email as a placeholder here so the row can exist at all.
 *
 * Phase 3: every new company is placed on the Free plan with the same
 * small dev-friendly starter allotment (3 unlocks) used to backfill
 * pre-Phase-3 rows in migrations/20240103000001-phase3-company-portal.js —
 * set explicitly here rather than via a column DEFAULT (see that
 * migration's comments for why), so this is the one place a signing-up
 * company's quota is decided. Real quota top-ups via payment are Phase 6.
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
    const freePlan = await PlanMaster.findOne({
      where: { name: 'Free' },
      transaction: options?.transaction,
    });
    await CompanyProfile.create(
      { userId, companyName: email, planId: freePlan?.id ?? null, remainingUnlocks: 3 },
      options,
    );
  }
}

/**
 * The `user` object every auth endpoint returns.
 *
 * Includes `profile` — which it did NOT before Phase 5, and that omission was
 * a real bug: the frontend decides where to land a candidate by reading
 * `user.profile?.category` (see postAuthRoute.ts). With `profile` missing from
 * the login response that check was always falsy, so a candidate who had
 * already picked Fresher/Experienced/Executive — and already submitted their
 * profile — got dumped back on the category picker on every single login.
 */
async function buildAuthUserPayload(user: User): Promise<Record<string, unknown>> {
  const profile = await runInRequestContext({ id: user.id, role: user.role }, async (t) => {
    if (user.role === 'candidate') {
      return CandidateProfile.findOne({ where: { userId: user.id }, transaction: t });
    }
    if (user.role === 'company') {
      return CompanyProfile.findOne({ where: { userId: user.id }, transaction: t });
    }
    return null;
  });

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    phone: user.phone,
    fullName: user.fullName,
    profile,
  };
}

/**
 * Builds the { totpEnrollmentRequired | totpRequired, challengeToken }
 * response for an admin user at login time.
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

  const accessToken = issueSession(res, { id: user.id, role: user.role, tokenVersion: user.tokenVersion });
  res.status(201).json({
    accessToken,
    user: await buildAuthUserPayload(user),
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const password = body.password;
  const identifier = (body.identifier ?? body.email ?? '').trim();

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
  // Matched against email OR username in one query — an email address can't
  // collide with a username here because usernames are only ever issued to
  // provisioned accounts and never contain '@'.
  const user = await runInRequestContext(null, (t) =>
    User.findOne({
      where: { [Op.or]: [{ email: identifier }, { username: identifier }] },
      transaction: t,
    }),
  );

  if (!user || !user.passwordHash) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const passwordValid = await comparePassword(password, user.passwordHash);
  if (!passwordValid) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (user.accountStatus !== 'active') {
    throw ApiError.forbidden(
      user.accountStatus === 'banned'
        ? 'This account has been banned.'
        : `This account is suspended${user.statusReason ? ': ' + user.statusReason : '.'}`,
    );
  }

  // Phase 5: verifiers now sign in on plain JWT like every other role — the
  // TOTP second factor is kept for admins only. (Previously both were
  // funnelled through the /onboarding/2fa challenge.)
  //
  // Dev convenience: outside production, admin logins skip the TOTP
  // challenge entirely so a freshly-seeded admin account can be used
  // immediately without an authenticator app. Gated on NODE_ENV rather than
  // a manual toggle so it can never accidentally ship enabled — a real
  // deployment always sets NODE_ENV=production, which restores the full
  // 2FA requirement unconditionally.
  if (user.role === 'admin' && env.NODE_ENV === 'production') {
    res.json(await buildTotpChallengeResponse(user));
    return;
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role, tokenVersion: user.tokenVersion });
  res.json({ accessToken, user: await buildAuthUserPayload(user) });
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

  // Persist the secret first, before generating the QR code we send back —
  // two concurrent enroll calls for the same user (a remounted page, a
  // double-click, or React StrictMode's dev-mode double-invoke of effects)
  // can both pass the `existing` check above before either commits, each
  // generating a DIFFERENT random secret. Whichever create() loses the race
  // hits the primary-key (user_id) uniqueness constraint on
  // user_totp_secrets — previously uncaught, surfacing as a raw 500 instead
  // of a handled response. Worse, even without an error, the "losing"
  // request would have returned a QR/secret that was never actually saved,
  // permanently mismatching the candidate's authenticator app. Catching the
  // unique-constraint case and re-reading whichever secret actually won
  // means both concurrent requests converge on the same, truly-persisted
  // secret.
  let persistedSecret = secret;
  try {
    await runInRequestContext(context, async (t) => {
      if (existing) {
        existing.secret = secret;
        await existing.save({ transaction: t });
      } else {
        await TotpSecret.create({ userId: payload.sub, secret }, { transaction: t });
      }
    });
  } catch (err) {
    if (!(err instanceof UniqueConstraintError)) {
      throw err;
    }
    const winner = await runInRequestContext(context, (t) =>
      TotpSecret.findOne({ where: { userId: payload.sub }, transaction: t }),
    );
    if (!winner) {
      throw err;
    }
    persistedSecret = winner.secret;
  }

  const otpauthUrlToReturn =
    persistedSecret === secret ? otpauthUrl : buildOtpauthUrl(user.email, persistedSecret);
  const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrlToReturn);

  res.json({ qrCodeDataUrl, secret: persistedSecret });
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

  if (user.accountStatus !== 'active') {
    throw ApiError.forbidden(
      user.accountStatus === 'banned'
        ? 'This account has been banned.'
        : `This account is suspended${user.statusReason ? ': ' + user.statusReason : '.'}`,
    );
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role, tokenVersion: user.tokenVersion });
  res.json({ accessToken, user: await buildAuthUserPayload(user) });
});

export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
  const { idToken, role: requestedRole } = googleAuthSchema.parse(req.body);

  let tokenPayload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    tokenPayload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized('Invalid Google token');
  }

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

  if (user.accountStatus !== 'active') {
    throw ApiError.forbidden(
      user.accountStatus === 'banned'
        ? 'This account has been banned.'
        : `This account is suspended${user.statusReason ? ': ' + user.statusReason : '.'}`,
    );
  }

  // Same dev-only TOTP bypass as login() above — see the comment there.
  if (user.role === 'admin' && env.NODE_ENV === 'production') {
    res.json(await buildTotpChallengeResponse(user));
    return;
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role, tokenVersion: user.tokenVersion });
  res.json({ accessToken, user: await buildAuthUserPayload(user) });
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

  // Phase 5: no longer trusts the refresh JWT's signature alone — re-checks
  // the DB so that a suspend/ban/force-logout (token_version bump) takes
  // effect on the very next refresh, instead of silently staying valid until
  // the refresh token's own multi-week expiry. Same null-context pattern as
  // login()'s lookup above, protected by the users_select_for_auth RLS
  // policy (see migrations/20240101000004).
  const user = await runInRequestContext(null, (t) => User.findByPk(payload.sub, { transaction: t }));

  if (!user || user.accountStatus !== 'active' || payload.tokenVersion !== user.tokenVersion) {
    throw ApiError.unauthorized('Session expired, please log in again');
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role, tokenVersion: user.tokenVersion });
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
    username: result.user.username,
    role: result.user.role,
    phone: result.user.phone,
    fullName: result.user.fullName,
    profile: result.profile,
  });
});
