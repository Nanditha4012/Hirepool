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
