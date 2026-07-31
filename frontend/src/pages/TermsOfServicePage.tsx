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

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-ink/50">Last updated: {LAST_UPDATED}</p>
      </div>

      <Card className="mt-10 flex flex-col gap-8">
        <p className="text-ink/70">
          These terms govern your use of {APP_NAME}. By creating an account, you agree to them.
          If anything here is unclear, contact us before signing up.
        </p>

        <Section title="1. Accounts and roles">
          <p>
            {APP_NAME} has four kinds of accounts: candidate, company, verifier, and admin. Each
            role gets access to the parts of the platform it needs, and no others — for example,
            only verifiers review profile submissions, and only admins manage suspensions and
            site-wide settings. You agree to use your account only for its intended role, keep
            your login credentials confidential, and provide accurate information when you
            register.
          </p>
        </Section>

        <Section title="2. Acceptable use">
          <p>
            You agree not to misrepresent your identity or credentials, impersonate another
            person or company, submit false employment or verification claims, or attempt to
            circumvent the verification process. Automated scraping, bulk-harvesting profile or
            contact data, or probing the platform for vulnerabilities outside of an authorised
            security review is prohibited.
          </p>
        </Section>

        <Section title="3. No guarantee of employment or hiring outcomes">
          <p>
            {APP_NAME} helps verified candidates get discovered by hiring companies, but we do not
            guarantee that any candidate will be contacted, interviewed, or hired, nor that any
            company will find a suitable candidate. We are a discovery platform, not a party to
            any employment relationship that results from it.
          </p>
        </Section>

        <Section title="4. Company obligations around unlocked contact data">
          <p>
            When a company spends an unlock credit on a candidate, it gains access to that
            candidate's contact details for the purpose of recruiting outreach — nothing more.
            Companies agree to:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Contact unlocked candidates only through legitimate, professional means</li>
            <li>Use unlocked contact details only for their own hiring purposes</li>
            <li>
              Never resell, publish, bulk-export, or otherwise share unlocked contact data with
              any third party
            </li>
          </ul>
          <p>
            Unlocking a candidate does not transfer ownership of their personal data — it grants
            access for recruiting purposes only, under this policy and our{' '}
            <Link to="/privacy" className="font-semibold text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="5. Payments">
          <p>
            Subscriptions, candidate unlocks, and profile boosts are paid features processed
            through Razorpay. Except where required by applicable law, payments for these
            features are non-refundable once the corresponding action (an unlock, a boost, or a
            billing cycle) has taken effect.
          </p>
        </Section>

        <Section title="6. Suspension and termination">
          <p>
            We may suspend or terminate any account that violates these terms — including fraud,
            fake credentials, misuse of unlocked contact data, or abusive behaviour toward other
            users. This is enforced through the same admin tooling already used to review,
            suspend, and ban accounts on the platform. We aim to act proportionately, but serious
            or repeated violations can result in immediate suspension without prior notice.
          </p>
        </Section>

        <Section title="7. Verification is a safeguard, not a guarantee">
          <p>
            Every profile claim — coding badges, projects, employment history — is checked by a
            human verifier before it is marked verified. This substantially reduces, but does not
            eliminate, the risk that a claim later turns out to be inaccurate or outdated. Both
            candidates and companies should exercise their own judgement alongside verification
            status.
          </p>
        </Section>

        <Section title="8. Changes to these terms">
          <p>
            We may update these terms from time to time. Material changes will be reflected by an
            updated "Last updated" date above. Continuing to use {APP_NAME} after a change takes
            effect means you accept the revised terms.
          </p>
        </Section>

        <Section title="9. Contact us">
          <p>
            Questions about these terms can be sent to{' '}
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
          <Link to="/privacy" className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Card>
    </div>
  )
}
