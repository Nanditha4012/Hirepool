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
