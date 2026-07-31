import { env } from '../config/env';

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/**
 * True iff a reCAPTCHA secret key is configured. Callers MUST check this
 * before requiring/verifying a token and skip the check entirely otherwise —
 * this mirrors the "optional external service creds that must not crash the
 * app at boot" pattern in config/env.ts (see isRazorpayConfigured() for the
 * same shape).
 */
export function isRecaptchaConfigured(): boolean {
  return Boolean(env.RECAPTCHA_SECRET_KEY);
}

/**
 * Verifies a reCAPTCHA v2 token against Google's siteverify endpoint.
 *
 * This is a security control, not a best-effort nicety, so it fails CLOSED:
 * any network hiccup, non-OK response, or unexpected shape is treated as a
 * failed verification (returns false) rather than letting the signup through.
 * Callers must still guard with isRecaptchaConfigured() first — this function
 * assumes it's being called with a real secret key configured.
 */
export async function verifyRecaptcha(token: string): Promise<boolean> {
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: env.RECAPTCHA_SECRET_KEY,
        response: token,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
