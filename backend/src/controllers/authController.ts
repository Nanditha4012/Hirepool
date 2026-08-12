import { Request, Response } from 'express';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { Op, UniqueConstraintError, col, fn, where as sqlWhere } from 'sequelize';
import { OAuth2Client } from 'google-auth-library';
import { sequelize } from '../config/database';
import {
  User,
  CandidateProfile,
  CompanyProfile,
  TotpSecret,
  PlanMaster,
  VerifierInvite,
  PasswordResetOtp,
} from '../models';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { hashPassword, comparePassword, strongPasswordSchema } from '../utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signTotpChallengeToken,
  verifyTotpChallengeToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
  getRefreshCookieMaxAgeMs,
} from '../utils/jwt';
import { generateTotpSecret, verifyTotpToken, generateQrCodeDataUrl, buildOtpauthUrl } from '../utils/totp';
import { sendEmail } from '../utils/email';
import { signupConfirmationEmail, passwordResetOtpEmail } from '../utils/emailTemplates';
import { isRecaptchaConfigured, verifyRecaptcha } from '../utils/recaptcha';

const SELF_SIGNUP_ROLES = ['candidate', 'company'] as const;

// Verifier is self-signup too, but ONLY when the submitted email has a live
// invite row (see VERIFIER_INVITE_ROLE handling in signup() below) — kept as
// a separate constant from SELF_SIGNUP_ROLES rather than folded in, because
// createProfileForNewUser/googleAuth intentionally still only ever accept
// 'candidate'|'company': Google sign-in for a whitelisted-email flow isn't
// part of this feature, and verifiers get no profile row.
const VERIFIER_INVITE_ROLE = 'verifier' as const;

const signupSchema = z.object({
  email: z.string().email(),
  password: strongPasswordSchema,
  role: z.enum([...SELF_SIGNUP_ROLES, VERIFIER_INVITE_ROLE]),
  // Optional at the schema level — enforced conditionally in signup() below,
  // only when isRecaptchaConfigured() is true. Left optional here so a
  // request body without it (every dev/test environment where the site key
  // isn't set) still parses fine.
  recaptchaToken: z.string().optional(),
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

// ---------------------------------------------------------------------
// One email = one account = one role
//
// `users.email` has always been UNIQUE, but a Postgres unique index is
// case-sensitive — so 'Manoj@gmail.com' and 'manoj@gmail.com' were two
// different values and the same mailbox could hold a candidate account AND
// a company (or verifier) account at once. Every write path below now
// lowercases before touching the DB, and every lookup compares on
// lower(email), so casing can't be used to slip past the constraint.
// migrations/20240109000001 adds the matching UNIQUE INDEX on lower(email)
// so this holds even if a future code path forgets to normalize.
// ---------------------------------------------------------------------

/** Canonical storage/lookup form for an email address. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A case-insensitive `WHERE lower(email) = ?`.
 *
 * Deliberately not `{ email: { [Op.iLike]: value } }`: iLike treats `_` and
 * `%` as wildcards, and `_` is a perfectly legal character in a local-part —
 * so `a_b@x.com` would also match `axb@x.com`.
 */
function whereEmailEquals(email: string) {
  return sqlWhere(fn('lower', col('email')), normalizeEmail(email));
}

const ROLE_LABELS: Record<string, string> = {
  candidate: 'candidate',
  company: 'company',
  verifier: 'verifier',
  admin: 'admin',
};

/**
 * Explains *why* the signup was refused. "An account with this email already
 * exists" is technically true but actively unhelpful when the collision is
 * cross-role — someone trying to register their company with the mailbox
 * they already used as a candidate needs to be told that's the rule, not
 * left guessing whether they forgot a password.
 */
function emailTakenMessage(existingRole: string, attemptedRole: string): string {
  const existingLabel = ROLE_LABELS[existingRole] ?? existingRole;
  const attemptedLabel = ROLE_LABELS[attemptedRole] ?? attemptedRole;

  if (existingRole === attemptedRole) {
    return `An account with this email already exists — log in instead.`;
  }

  return (
    `This email is already registered as a ${existingLabel} account. ` +
    `One email can only be used for one role on Hirepool, so please use a ` +
    `different email address to sign up as a ${attemptedLabel}.`
  );
}

function refreshCookieOptions() {
  // On Vercel the API and the web app are two different deployments on two
  // different hostnames, so every call from the frontend is cross-site. A
  // SameSite=Lax cookie is simply not attached to a cross-site fetch, which
  // meant the refresh cookie was set at login and then never sent again —
  // /auth/refresh would 401 on the very next page load and silently sign the
  // user out. SameSite=None is what makes it travel, and browsers only accept
  // None together with Secure (which needs HTTPS — hence keeping Lax on
  // localhost, where dev is same-site anyway and http:// would reject Secure).
  const isProduction = env.NODE_ENV === 'production';

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
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    secure: isProduction,
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
  const parsed = signupSchema.parse(req.body);
  const email = normalizeEmail(parsed.email);
  const { password, role } = parsed;

  // Shared across every self-signup role (candidate/company/verifier) — kept
  // uniform rather than exempting verifier signups, since verifier invite
  // gating already provides its own protection layer for that path and an
  // extra CAPTCHA check there is harmless. No-op whenever RECAPTCHA_SECRET_KEY
  // isn't set, so this is a no-op in dev/test environments that never
  // configure it.
  if (isRecaptchaConfigured()) {
    if (!parsed.recaptchaToken) {
      throw ApiError.badRequest('CAPTCHA verification required');
    }
    const recaptchaValid = await verifyRecaptcha(parsed.recaptchaToken);
    if (!recaptchaValid) {
      throw ApiError.badRequest('CAPTCHA verification failed, please try again');
    }
  }

  const passwordHash = await hashPassword(password);

  // Pre-flight check purely so the caller gets a message that names the role
  // the mailbox is already tied to. The DB's unique index on lower(email) is
  // still the real guard — a concurrent signup that slips between this read
  // and the create below is caught by the UniqueConstraintError handler.
  const existingUser = await runInRequestContext(null, (t) =>
    User.findOne({ where: whereEmailEquals(email), transaction: t }),
  );
  if (existingUser) {
    throw ApiError.conflict(emailTakenMessage(existingUser.role, role));
  }

  let user: User;
  try {
    user = await runInRequestContext(null, async (t) => {
      if (role === VERIFIER_INVITE_ROLE) {
        // Case-insensitive match against the whitelist — invites are always
        // stored lowercased by adminController.createVerifierInvite.
        const invite = await VerifierInvite.findOne({
          where: { email, consumedAt: null },
          transaction: t,
        });
        if (!invite) {
          throw ApiError.forbidden(
            "This email hasn't been whitelisted as a verifier. Ask an admin to invite it first.",
          );
        }

        const created = await User.create({ email, passwordHash, role }, { transaction: t });
        // Verifiers get no candidate_profiles/company_profiles row — there's
        // nothing for createProfileForNewUser to do here, unlike
        // candidate/company signup below.
        invite.consumedAt = new Date();
        invite.consumedByUserId = created.id;
        await invite.save({ transaction: t });
        return created;
      }

      const created = await User.create({ email, passwordHash, role }, { transaction: t });
      await createProfileForNewUser(created.id, email, role, { transaction: t });
      return created;
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw ApiError.conflict('An account with this email already exists — log in instead.');
    }
    throw err;
  }

  const accessToken = issueSession(res, { id: user.id, role: user.role, tokenVersion: user.tokenVersion });

  // Fire-and-forget-safe (sendEmail never throws — see utils/email.ts) —
  // called after the signup transaction has fully committed, so a slow or
  // failed email can never roll back account creation or fail this request.
  const { subject, html } = signupConfirmationEmail(user.fullName ?? user.email, user.role);
  await sendEmail({ to: user.email, subject, html });

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
  //
  // The email half compares on lower(email) so a user who typed their address
  // with different capitalisation than they registered it still signs in.
  // `username` stays an exact match: provisioned handles are issued by us,
  // are already lowercase, and are matched literally on purpose.
  const user = await runInRequestContext(null, (t) =>
    User.findOne({
      where: { [Op.or]: [whereEmailEquals(identifier), { username: identifier }] },
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
  // TODO(re-enable before real launch): admin TOTP is temporarily disabled
  // in production too, at the requester's explicit instruction, while the
  // platform is still in active development and 2FA enrollment is friction
  // nobody wants mid-build. Restore this condition before a real deployment:
  //   if (user.role === 'admin' && env.NODE_ENV === 'production') {
  //     res.json(await buildTotpChallengeResponse(user));
  //     return;
  //   }

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
  const email = normalizeEmail(tokenPayload.email);

  // Same known RLS caveat as login() above — this lookup runs with a
  // null context because no session exists until the user is resolved.
  let user = await runInRequestContext(null, (t) =>
    User.findOne({ where: { [Op.or]: [{ googleId }, whereEmailEquals(email)] }, transaction: t }),
  );

  // Cross-role guard. Without this, "Sign up with Google as a company" using
  // a mailbox that already has a candidate account silently signed the user
  // straight into their *candidate* account — no error, no explanation, just
  // the wrong portal. An explicitly requested role that disagrees with the
  // account on file is a conflict, exactly as it is on the password path.
  if (user && requestedRole && user.role !== requestedRole) {
    throw ApiError.conflict(emailTakenMessage(user.role, requestedRole));
  }

  if (user && !user.googleId) {
    const existingUser = user;
    await runInRequestContext({ id: existingUser.id, role: existingUser.role }, async (t) => {
      existingUser.googleId = googleId;
      await existingUser.save({ transaction: t });
    });
    user = existingUser;
  }

  let isNewUser = false;
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
      isNewUser = true;
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw ApiError.conflict('An account with this email already exists — log in instead.');
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

  // Same fire-and-forget-safe placement as signup() above — after the
  // account-creation transaction has committed, and only for a genuinely
  // new account (an existing user signing back in via Google must not get
  // a "welcome" email every login).
  if (isNewUser) {
    const { subject, html } = signupConfirmationEmail(user.fullName ?? user.email, user.role);
    await sendEmail({ to: user.email, subject, html });
  }

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

// ---------------------------------------------------------------------
// Forgot password: emailed OTP -> reset token -> new password.
// ---------------------------------------------------------------------

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const forgotPasswordSchema = z.object({ email: z.string().email() });

/** Generates a 6-digit OTP; padStart keeps a leading-zero code (e.g. "004821") valid. */
function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  // Always the same response whether or not the email is registered — the
  // whole point is not telling a caller which emails exist in the system.
  const genericResponse = {
    message: 'If an account exists for that email, a password reset code has been sent.',
  };

  const user = await runInRequestContext(null, (t) =>
    User.findOne({ where: whereEmailEquals(email), transaction: t }),
  );

  if (!user) {
    res.json(genericResponse);
    return;
  }

  const otp = generateOtp();
  const otpHash = await hashPassword(otp);

  await runInRequestContext(null, (t) =>
    PasswordResetOtp.create(
      { userId: user.id, otpHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      { transaction: t },
    ),
  );

  const { subject, html } = passwordResetOtpEmail(otp);
  await sendEmail({ to: user.email, subject, html });

  res.json(genericResponse);
});

const verifyResetOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const verifyResetOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp } = verifyResetOtpSchema.parse(req.body);
  const invalid = () => ApiError.unauthorized('Invalid or expired code');

  const user = await runInRequestContext(null, (t) =>
    User.findOne({ where: whereEmailEquals(email), transaction: t }),
  );
  if (!user) throw invalid();

  const otpRow = await runInRequestContext(null, (t) =>
    PasswordResetOtp.findOne({
      where: { userId: user.id, consumedAt: null },
      order: [['createdAt', 'DESC']],
      transaction: t,
    }),
  );

  if (!otpRow || otpRow.expiresAt.getTime() < Date.now() || otpRow.attempts >= OTP_MAX_ATTEMPTS) {
    throw invalid();
  }

  const matches = await comparePassword(otp, otpRow.otpHash);
  if (!matches) {
    await runInRequestContext(null, async (t) => {
      otpRow.attempts += 1;
      await otpRow.save({ transaction: t });
    });
    throw invalid();
  }

  await runInRequestContext(null, async (t) => {
    otpRow.consumedAt = new Date();
    await otpRow.save({ transaction: t });
  });

  res.json({ resetToken: signPasswordResetToken({ sub: user.id }) });
});

const resetPasswordSchema = z.object({
  resetToken: z.string().min(1),
  newPassword: strongPasswordSchema,
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { resetToken, newPassword } = resetPasswordSchema.parse(req.body);

  let payload;
  try {
    payload = verifyPasswordResetToken(resetToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired reset link. Please request a new code.');
  }

  // Defence in depth: the JWT signature already guarantees this, but
  // interpolating it into raw SQL below (SET LOCAL takes no bind params —
  // see withRequestContext.ts) means a malformed value must never reach it.
  if (!UUID_REGEX.test(payload.sub)) {
    throw ApiError.unauthorized('Invalid or expired reset link. Please request a new code.');
  }

  const newPasswordHash = await hashPassword(newPassword);

  await sequelize.transaction(async (t) => {
    // Not runInRequestContext: that helper only supports "no context" or
    // "id+role together". This flow deliberately sets ONLY
    // app.current_user_id (leaving app.current_user_role unset), matching
    // users_update_self_by_password_reset in
    // migrations/20240114000001-password-reset-otp.js — the one policy
    // that accepts that specific combination, scoped to this exact row.
    await sequelize.query(`SET LOCAL app.current_user_id = '${payload.sub}'`, { transaction: t });

    const user = await User.findByPk(payload.sub, { transaction: t });
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    user.passwordHash = newPasswordHash;
    // Recovering via "forgot password" invalidates any existing sessions —
    // unlike changeMyVerifierPassword (an authenticated, deliberate change),
    // this path runs with no proof the requester is at a device that was
    // already trusted, so anything logged in elsewhere is signed out.
    user.tokenVersion += 1;
    await user.save({ transaction: t });
  });

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
