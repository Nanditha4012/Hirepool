import rateLimit from 'express-rate-limit';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export const signupLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many signup attempts. Please try again later.' },
});

export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
});

// Forgot-password request — low ceiling since each hit sends a real email;
// also the outer guard against an attacker enumerating accounts by email.
export const forgotPasswordLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset requests. Please try again later.' },
});

// OTP verification — the per-row `attempts` counter in
// authController.verifyResetOtp is the primary brute-force guard (it locks
// out a specific OTP after a few wrong tries); this is the secondary,
// per-IP backstop against spraying guesses across many requested OTPs.
export const otpVerifyLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

// Search is authenticated (a company must already be logged in), so this is
// a much higher ceiling than signup/login — it's here to stop a scripted
// scrape of the whole candidate pool, not to throttle normal browsing. Keyed
// per-IP by default (express-rate-limit's default keyGenerator), same as
// the other two limiters.
export const searchLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many search requests. Please slow down and try again shortly.' },
});

// Public Careers Page (Feature 2, Phase 5) — genuinely anonymous, no
// requireAuth to lean on at all (unlike searchLimiter above, which is a
// secondary guard behind a login wall). Ceiling is higher than search
// since a job's careers link is meant to be embedded/shared widely and
// legitimately hit by many distinct visitors, not just one signed-in user
// browsing.
export const careersLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again shortly.' },
});

// Submitting an application is a write, not a read — much lower ceiling
// than careersLimiter above, same order of magnitude as signupLimiter
// since both are "anonymous, creates a row" endpoints.
export const careersApplyLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many applications submitted. Please try again later.' },
});
