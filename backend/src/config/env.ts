import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().url(),
  APP_NAME: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  /**
   * Absolute session ceiling — how long the httpOnly refresh cookie stays
   * valid, and therefore the hard limit on how long a session can be revived
   * without re-entering credentials.
   *
   * Was 30d, which meant a browser left open (or simply reopened) resumed a
   * month-old session silently. 12h caps that at "one working day": combined
   * with the 30-minute idle timeout the frontend enforces (see
   * SESSION_IDLE_MINUTES in frontend/src/lib/config.ts), a walked-away-from
   * machine logs itself out, and a machine that never comes back can't be
   * used to resume tomorrow either.
   */
  JWT_REFRESH_EXPIRES_IN: z.string().default('12h'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().optional().default(''),
  TOTP_ISSUER: z.string().default('Hirepool'),
  // Razorpay (Phase 6 payments) — same "optional, empty-string default"
  // pattern as GOOGLE_CLIENT_ID/SECRET above: an optional external service
  // credential that must NOT crash the app at boot if unset. Callers check
  // isRazorpayConfigured() (see utils/razorpay.ts) before using these and
  // return a proper ApiError instead of letting an unconfigured client throw.
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  // SMTP (Phase 6 email notifications) — same "optional, empty-string
  // default" pattern as the Razorpay vars above: an optional external
  // service credential that must NOT crash the app at boot if unset.
  // Callers check isEmailConfigured() (see utils/email.ts) before sending
  // and no-op instead of throwing — email must never be a hard dependency.
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default('Hirepool <no-reply@hirepool.com>'),
  // reCAPTCHA (Phase 7 security hardening) — same "optional, empty-string
  // default" pattern as the vars above: an optional external service
  // credential that must NOT crash the app at boot if unset. Callers check
  // isRecaptchaConfigured() (see utils/recaptcha.ts) before verifying and
  // skip the check entirely when unset, so signup behaves exactly as before
  // in any environment that hasn't configured reCAPTCHA. Only the secret key
  // lives here — the site key is public and only used by the frontend widget
  // (VITE_RECAPTCHA_SITE_KEY).
  RECAPTCHA_SECRET_KEY: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
