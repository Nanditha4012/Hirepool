import { env } from '../config/env';

/**
 * Small pure functions building { subject, html } pairs for every
 * transactional email Hirepool sends (Phase 6). Deliberately minimal,
 * inline-styled HTML — no external CSS or template engine, since email
 * clients need inline styles anyway and these are the only consumers of
 * this markup.
 */

const PRIMARY_BLUE = '#0A66C2';

/** Shared page chrome: heading + body + optional CTA link. */
function renderEmail(params: { heading: string; bodyHtml: string; ctaUrl?: string; ctaLabel?: string }): string {
  const { heading, bodyHtml, ctaUrl, ctaLabel } = params;
  const cta =
    ctaUrl && ctaLabel
      ? `<p style="margin: 24px 0 0;">
           <a href="${ctaUrl}" style="background-color: ${PRIMARY_BLUE}; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; display: inline-block; font-weight: 600;">${ctaLabel}</a>
         </p>`
      : '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h1 style="color: ${PRIMARY_BLUE}; font-size: 20px; margin: 0 0 16px;">${heading}</h1>
      ${bodyHtml}
      ${cta}
      <p style="margin: 32px 0 0; font-size: 12px; color: #6b7280;">— The Hirepool team</p>
    </div>
  `;
}

export function signupConfirmationEmail(
  fullNameOrEmail: string,
  role: string,
): { subject: string; html: string } {
  const landing = role === 'company' ? '/company' : '/candidate';
  return {
    subject: 'Welcome to Hirepool',
    html: renderEmail({
      heading: `Welcome to Hirepool, ${fullNameOrEmail}!`,
      bodyHtml: `
        <p style="margin: 0 0 12px; line-height: 1.5;">Your account has been created successfully as a <strong>${role}</strong>.</p>
        <p style="margin: 0; line-height: 1.5;">You can now complete your profile and get started.</p>
      `,
      ctaUrl: `${env.FRONTEND_URL}${landing}`,
      ctaLabel: 'Go to your dashboard',
    }),
  };
}

export function profileStatusChangedEmail(
  fullName: string,
  status: string,
  reason?: string,
): { subject: string; html: string } {
  const name = fullName || 'there';

  if (status === 'approved') {
    return {
      subject: 'Your Hirepool profile has been approved',
      html: renderEmail({
        heading: `Great news, ${name} — you're verified!`,
        bodyHtml: `
          <p style="margin: 0; line-height: 1.5;">Your profile has been approved and is now live to companies searching Hirepool. Good luck with your search!</p>
        `,
        ctaUrl: `${env.FRONTEND_URL}/candidate`,
        ctaLabel: 'View your profile',
      }),
    };
  }

  const isRejected = status === 'rejected';
  return {
    subject: isRejected ? 'Update needed on your Hirepool profile' : 'More information needed on your Hirepool profile',
    html: renderEmail({
      heading: isRejected ? `Hi ${name}, your profile needs some changes` : `Hi ${name}, we need a bit more information`,
      bodyHtml: `
        <p style="margin: 0 0 12px; line-height: 1.5;">
          ${
            isRejected
              ? "Your profile wasn't approved this time, but you can update it and resubmit."
              : 'Our review team needs a bit more information before your profile can be approved.'
          }
        </p>
        ${reason ? `<p style="margin: 0 0 12px; line-height: 1.5; background: #f3f4f6; padding: 12px; border-radius: 6px;"><strong>Reason:</strong> ${reason}</p>` : ''}
        <p style="margin: 0; line-height: 1.5;">Head back to your profile to make the fix and resubmit for review.</p>
      `,
      ctaUrl: `${env.FRONTEND_URL}/candidate`,
      ctaLabel: 'Update your profile',
    }),
  };
}

export function paymentReceiptEmail(
  fullNameOrEmail: string,
  description: string,
  amount: number,
  currency: string,
): { subject: string; html: string } {
  return {
    subject: 'Your Hirepool payment receipt',
    html: renderEmail({
      heading: `Thanks, ${fullNameOrEmail} — payment received`,
      bodyHtml: `
        <p style="margin: 0 0 12px; line-height: 1.5;">We've received your payment for <strong>${description}</strong>.</p>
        <p style="margin: 0; line-height: 1.5; font-size: 18px;"><strong>${currency} ${amount.toFixed(2)}</strong></p>
      `,
      ctaUrl: `${env.FRONTEND_URL}/payments/history`,
      ctaLabel: 'View payment history',
    }),
  };
}

export function paymentFailedEmail(
  fullNameOrEmail: string,
  description: string,
): { subject: string; html: string } {
  return {
    subject: 'Your Hirepool payment could not be completed',
    html: renderEmail({
      heading: `Hi ${fullNameOrEmail}, your payment didn't go through`,
      bodyHtml: `
        <p style="margin: 0 0 12px; line-height: 1.5;">We couldn't complete your payment for <strong>${description}</strong>. No amount was deducted.</p>
        <p style="margin: 0; line-height: 1.5;">Please try again — if the problem continues, reach out to support.</p>
      `,
      ctaUrl: `${env.FRONTEND_URL}/payments/history`,
      ctaLabel: 'Try again',
    }),
  };
}

export function passwordResetOtpEmail(otp: string): { subject: string; html: string } {
  return {
    // Deliberately doesn't include the code itself — the subject line is
    // what shows in a lock-screen notification and inbox list preview
    // without the email being opened, so putting the OTP there would defeat
    // the point of it being a secret the recipient has to go get.
    subject: 'Your Hirepool password reset code',
    html: renderEmail({
      heading: 'Reset your password',
      bodyHtml: `
        <p style="margin: 0 0 16px; line-height: 1.5;">Use this code to reset your Hirepool password. It expires in 10 minutes.</p>
        <p style="margin: 0 0 16px; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1f2937;">${otp}</p>
        <p style="margin: 0; line-height: 1.5; color: #6b7280;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      `,
    }),
  };
}

export function renewalReminderEmail(
  companyName: string,
  daysRemaining: number,
): { subject: string; html: string } {
  const dayWord = daysRemaining === 1 ? 'day' : 'days';
  return {
    subject: 'Your Hirepool plan renews soon',
    html: renderEmail({
      heading: `Hi ${companyName}, your plan renews soon`,
      bodyHtml: `
        <p style="margin: 0 0 12px; line-height: 1.5;">Your unlock and message quotas will reset in <strong>${daysRemaining} ${dayWord}</strong>.</p>
        <p style="margin: 0; line-height: 1.5;">Review your plan and billing details any time from your company dashboard.</p>
      `,
      ctaUrl: `${env.FRONTEND_URL}/company/billing`,
      ctaLabel: 'View billing',
    }),
  };
}
