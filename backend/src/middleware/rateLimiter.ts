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
