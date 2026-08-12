import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

/**
 * True iff SMTP is configured. Email is never a hard dependency — callers
 * don't need to check this themselves before calling sendEmail();
 * sendEmail() checks it internally and no-ops when unconfigured. This is
 * exported mainly for parity with isRazorpayConfigured() and for any call
 * site that wants to short-circuit its own extra work (e.g. building an
 * email body) when sending would be a no-op anyway.
 */
export function isEmailConfigured(): boolean {
  return env.SMTP_HOST.length > 0 && env.SMTP_USER.length > 0 && env.SMTP_PASS.length > 0;
}

let client: Transporter | null = null;

/** Lazily constructs and returns a singleton SMTP transporter. */
function getSmtpClient(): Transporter {
  if (!client) {
    client = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // Port 465 is implicit TLS; every other port (587, 25, ...) starts
      // plaintext and upgrades via STARTTLS, which nodemailer only does
      // when `secure` is false.
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return client;
}

/**
 * Sends a transactional email via SMTP. This is deliberately "fire and
 * forget safe": unlike getRazorpayClient()'s callers (which must check
 * isRazorpayConfigured() first and surface a 503 to the client), email is
 * never on the critical path of any request — a failed or skipped email
 * must never break the request it's attached to (e.g. a signup, or a
 * payment webhook that already succeeded). So this function swallows every
 * failure itself: it no-ops with a console.log when unconfigured, and
 * catches+logs (never throws) when the SMTP send itself fails. Callers
 * never need their own try/catch.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!isEmailConfigured()) {
    console.log('[email] skipped (not configured):', subject);
    return;
  }

  try {
    await getSmtpClient().sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] send failed:', err);
  }
}
