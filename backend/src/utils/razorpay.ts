import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env';

/**
 * True iff both the public key id and secret are configured. Callers MUST
 * check this before calling getRazorpayClient() or attempting any checkout
 * flow, and return a proper ApiError.serviceUnavailable(...) to the client
 * instead — this mirrors the "optional external service creds that must
 * not crash the app at boot" pattern in config/env.ts.
 */
export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID) && Boolean(env.RAZORPAY_KEY_SECRET);
}

let client: Razorpay | null = null;

/**
 * Lazily constructs and returns a singleton Razorpay SDK client. Throws a
 * plain internal Error (not ApiError — this is a programmer error, not a
 * client-facing condition) if called while unconfigured; callers must
 * guard with isRazorpayConfigured() first.
 */
export function getRazorpayClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new Error(
      'getRazorpayClient() called while Razorpay is not configured — callers must check isRazorpayConfigured() first',
    );
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return client;
}

/**
 * Verifies a Razorpay webhook's `X-Razorpay-Signature` header: HMAC-SHA256
 * of the raw request body using RAZORPAY_WEBHOOK_SECRET, compared against
 * the provided signature with a timing-safe comparison (crypto.timingSafeEqual
 * rather than `===`, to avoid a timing side-channel on a real signature
 * check).
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(signature, 'utf8');

  // timingSafeEqual throws if the buffers differ in length rather than
  // returning false — guard explicitly so a malformed/short header never
  // throws out of this function.
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
