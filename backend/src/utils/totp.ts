import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../config/env';

export interface TotpSecretResult {
  secret: string;
  otpauthUrl: string;
}

/**
 * Generates a new TOTP secret and its otpauth:// URI, labeled with the
 * user's email and the configured issuer, for enrollment.
 *
 * Deviation from spec: spec listed the signature as `generateTotpSecret()`
 * with no arguments, but also said the otpauth URL should use "the user's
 * email as label" — that's only possible if the email is passed in, so
 * this takes an `email: string` parameter.
 */
export function generateTotpSecret(email: string): TotpSecretResult {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, env.TOTP_ISSUER, secret);
  return { secret, otpauthUrl };
}

/**
 * Rebuilds the otpauth:// URI for an ALREADY-ISSUED secret (as opposed to
 * generateTotpSecret, which mints a brand-new random one). Needed when a
 * concurrent enrollment race means the secret that actually got persisted
 * differs from the one this request originally generated — see the
 * unique-constraint recovery path in authController.totpEnroll.
 */
export function buildOtpauthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, env.TOTP_ISSUER, secret);
}

export function verifyTotpToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export async function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}
