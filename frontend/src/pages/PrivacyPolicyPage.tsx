import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import { APP_NAME, SUPPORT_EMAIL } from '@/lib/config'

const LAST_UPDATED = '27 July 2026'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="flex flex-col gap-3 text-ink/70">{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink/50">Last updated: {LAST_UPDATED}</p>
      </div>

      <Card className="mt-10 flex flex-col gap-8">
        <p className="text-ink/70">
          {APP_NAME} is a reverse job board: candidates build one verified profile, and hiring
          companies pay to unlock the contact details of the specific candidates they want to
          reach. This policy explains what we collect, and — most importantly — exactly when and
          with whom your contact information is shared.
        </p>

        <Section title="1. What we collect">
          <p>
            To build and verify your profile, we collect the information you give us, including:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Basic profile information (name, category, location, headline)</li>
            <li>Resume and portfolio links</li>
            <li>Coding-platform profiles and badges (e.g. LeetCode, GitHub, contest results)</li>
            <li>Work history, achievements, and other claims you add for verification</li>
            <li>Your phone number, email address, and WhatsApp contact link</li>
          </ul>
          <p>
            Companies provide their organisation details, and everyone who signs in gets an
            account record (email, hashed password or Google identity, and role).
          </p>
        </Section>

        <Section title="2. How your contact information is shared — the core of how this works">
          <p className="font-semibold text-ink">
            Your phone number, email, and WhatsApp link are private by default. They are never
            shown publicly, never listed in bulk, and never handed to a company just because they
            can see your profile.
          </p>
          <p>
            A company only sees your contact details after it spends an unlock credit on your
            specific profile. Unlocking is a per-candidate, paid action — a company browsing or
            searching the candidate pool sees your verified profile (skills, verification badges,
            work history) but not your phone, email, or WhatsApp, until it chooses to pay to unlock
            you individually. Once unlocked, that company can see and use your contact details to
            reach out; other companies that have not unlocked your profile still cannot see them.
          </p>
          <p>
            We do not sell contact data, share it in aggregate exports, or provide it to anyone
            outside the unlock flow described above.
          </p>
        </Section>

        <Section title="3. Verification">
          <p>
            Claims on your profile — coding badges, projects, employment history, achievements —
            are reviewed by a human verifier before they go live as "verified." Verification
            reduces the chance of inaccurate claims reaching companies, but is a review process,
            not a background check or a legal guarantee.
          </p>
        </Section>

        <Section title="4. Payments">
          <p>
            Company payments (unlocking candidates, subscriptions, boosts) are processed through
            Razorpay. We do not store your card, UPI, or other payment instrument details on our
            servers — Razorpay handles and stores that information under its own security and
            compliance program.
          </p>
        </Section>

        <Section title="5. Your control over your profile">
          <p>You can, at any time:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Pause your profile (mark yourself "not actively looking") to stop new unlocks</li>
            <li>Edit or update any part of your profile</li>
            <li>Request deletion of your account and associated data by contacting us</li>
          </ul>
          <p>
            Pausing hides you from new searches and unlocks; it does not retroactively hide
            contact details from companies that already unlocked you before you paused.
          </p>
        </Section>

        <Section title="6. Cookies and sessions">
          <p>
            We use a single httpOnly refresh-token cookie to keep you signed in across visits.
            It exists purely to manage your session — it is not used for advertising, cross-site
            tracking, or analytics profiling.
          </p>
        </Section>

        <Section title="7. Contact us">
          <p>
            Questions about this policy, or requests to access or delete your data, can be sent
            to{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-primary hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <p className="border-t border-line pt-4 text-sm text-ink/50">
          See also our{' '}
          <Link to="/terms" className="font-semibold text-primary hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </Card>
    </div>
  )
}
