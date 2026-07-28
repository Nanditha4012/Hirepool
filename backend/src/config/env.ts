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
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
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
  // Resend (Phase 6 email notifications) — same "optional, empty-string
  // default" pattern as the Razorpay vars above: an optional external
  // service credential that must NOT crash the app at boot if unset.
  // Callers check isEmailConfigured() (see utils/email.ts) before sending
  // and no-op instead of throwing — email must never be a hard dependency.
  // EMAIL_FROM gets a real usable default (Resend's shared sandbox sender,
  // which needs no domain verification) since it isn't itself a secret.
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default('Hirepool <onboarding@resend.dev>'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
