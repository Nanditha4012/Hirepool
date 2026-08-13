import { Link, Navigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import PageLoader from '@/components/ui/PageLoader'
import { APP_NAME } from '@/lib/config'
import { IMAGES, AVATARS } from '@/lib/images'
import { useReveal } from '@/lib/useReveal'
import { useAuth } from '@/lib/authStore'
import { homePathFor } from '@/lib/roleHome'
import { hasSessionHint } from '@/lib/sessionHint'
import HeroScene from '@/components/landing/HeroScene'
import StepScene from '@/components/landing/StepScene'

const steps = [
  {
    number: '01',
    title: 'Register & get verified',
    description:
      'Build your profile once. A human reviewer checks every claim field by field — your resume, your projects, your work history — and tells you exactly what passed.',
    scene: 'verify' as const,
  },
  {
    number: '02',
    title: 'Show up on the platform',
    description:
      'Your verified profile becomes discoverable to companies actively hiring in your category. No applications, no cover letters, no black holes.',
    scene: 'discover' as const,
  },
  {
    number: '03',
    title: 'Companies unlock your contact',
    description:
      'Interested employers pay to reach you — so you only hear from people who mean business. You can pause visibility any time.',
    scene: 'connect' as const,
  },
]

const stats = [
  { value: 'Field by field', label: 'Every claim checked individually' },
  { value: 'Once', label: 'Verified once, not per application' },
  { value: 'Zero', label: 'Spam applications to write' },
  { value: 'You decide', label: 'Pause visibility whenever' },
]

function StepCard({ step, index }: { step: (typeof steps)[number]; index: number }) {
  const ref = useReveal<HTMLDivElement>(index * 120)

  return (
    <div ref={ref} className="reveal group overflow-hidden rounded-card bg-card shadow-soft transition-shadow hover:shadow-lift">
      <div className="relative h-44 overflow-hidden">
        {/* A drawn scene of the step itself, rather than a stock photo of
            someone at a desk — see components/landing/StepScene. */}
        <div className="h-full w-full transition-transform duration-700 group-hover:scale-105">
          <StepScene scene={step.scene} />
        </div>
        <span className="absolute left-4 top-4 rounded-card bg-white/90 px-2.5 py-1 text-sm font-black text-primary backdrop-blur">
          {step.number}
        </span>
      </div>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
        <p className="mt-2 text-ink/60">{step.description}</p>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const statsRef = useReveal<HTMLDivElement>()
  const trustRef = useReveal<HTMLDivElement>()
  const ctaRef = useReveal<HTMLDivElement>()
  const { user, isLoading } = useAuth()

  // `/` is a marketing page, and it is also where every cold start lands:
  // the PWA manifest's start_url is '/', and so is a bookmark, a shared link
  // and the address bar. For someone already signed in that is the wrong
  // screen — reopening the app on a phone showed the "Register & get
  // verified" pitch even though the session was alive and the portal was one
  // tap away. Signed in, home is *their* home.
  //
  // Not a redirect in an effect: rendering the pitch first and navigating
  // afterwards is exactly the flash being removed here.
  if (user) {
    return <Navigate to={homePathFor(user.role)} replace />
  }

  // The session is only knowable after /auth/refresh answers, so during
  // bootstrap `user` is null for members and non-members alike. Holding a
  // loader for everyone would tax first-time visitors — the people this page
  // is actually for — so it is held only when this browser recently had a
  // session and the redirect above is therefore the likely outcome.
  if (isLoading && hasSessionHint()) {
    return <PageLoader label="Welcome back…" />
  }

  return (
    <div>
      {/* Hero.
          The backdrop is now a drawn, animated scene rather than a stock
          photograph behind a pair of scrims — see components/landing/
          HeroScene. It carries its own gradient, depth layers and legibility
          scrim, so nothing else is layered here. */}
      <section className="relative min-h-[38rem] overflow-hidden">
        <HeroScene />

        <div className="relative mx-auto max-w-app px-4 py-24 text-center sm:px-6 lg:px-10 sm:py-32">
          <span className="inline-flex animate-fade-in items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-verified" />
            Verified profiles only
          </span>

          <h1 className="on-photo mx-auto mt-6 max-w-3xl animate-fade-up text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
            Companies find <span className="text-boost">you</span>.
            <br className="hidden sm:block" /> Not the other way around.
          </h1>

          <p
            className="on-photo mx-auto mt-6 max-w-xl animate-fade-up text-lg text-white/90"
            style={{ animationDelay: '120ms' }}
          >
            {APP_NAME} is a reverse job board: get verified once, then let hiring companies come to
            you.
          </p>

          <div
            className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-4 sm:flex-row"
            style={{ animationDelay: '240ms' }}
          >
            <Link to="/signup?role=candidate" className="w-full sm:w-auto">
              <Button variant="inverse" size="lg" className="w-full sm:w-auto">
                I&apos;m looking for a job
              </Button>
            </Link>
            <Link to="/signup?role=company" className="w-full sm:w-auto">
              <Button variant="outlineInverse" size="lg" className="w-full sm:w-auto">
                I&apos;m hiring
              </Button>
            </Link>
          </div>

          {/* Social proof strip */}
          <div
            className="mt-12 flex animate-fade-up items-center justify-center gap-3"
            style={{ animationDelay: '360ms' }}
          >
            <div className="flex -space-x-3">
              {AVATARS.map((src, index) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-10 w-10 rounded-full border-2 border-white/80 bg-primary-light object-cover"
                  style={{ zIndex: AVATARS.length - index }}
                />
              ))}
            </div>
            <p className="on-photo text-left text-sm text-white/85">
              Candidates verified by real reviewers
              <br />
              <span className="text-white/65">— not an automated resume filter.</span>
            </p>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="border-b border-line bg-card">
        <div ref={statsRef} className="reveal mx-auto grid max-w-app grid-cols-2 gap-6 px-4 py-12 sm:px-6 lg:px-10 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-xl font-extrabold text-primary sm:text-2xl">{stat.value}</p>
              <p className="mt-1 text-sm text-ink/50">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10 sm:py-24">
        <h2 className="text-center text-2xl font-bold text-ink sm:text-3xl">How it works</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-ink/60">
          Three steps, and only the first one needs anything from you.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <StepCard key={step.number} step={step} index={index} />
          ))}
        </div>
      </section>

      {/* Verification explainer */}
      <section className="bg-surface">
        <div
          ref={trustRef}
          className="reveal mx-auto grid max-w-app items-center gap-10 px-4 py-16 sm:px-6 lg:px-10 sm:py-24 lg:grid-cols-2"
        >
          <div>
            <span className="text-sm font-bold uppercase tracking-wide text-primary">
              What verification means
            </span>
            <h2 className="mt-3 text-2xl font-bold text-ink sm:text-3xl">
              A person reads your profile. Field by field.
            </h2>
            <p className="mt-4 text-ink/70">
              Every claim is checked on its own and marked yes or no — your resume link, each
              project, your company and title. If something doesn&apos;t hold up, you are told
              exactly which field and why, so you can fix that one thing and resubmit.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {[
                'Every field gets an individual yes or no',
                'Failed checks come back with a written reason',
                'You keep your work — resubmitting is not starting over',
                'A full timeline of every decision on your profile',
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-ink/80">
                  <span className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-verified/15 text-xs font-bold text-verified">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="photo-frame overflow-hidden rounded-card bg-gradient-to-br from-primary to-accent">
            <img
              src={IMAGES.authCandidate}
              alt="A candidate reviewing their verified profile"
              loading="lazy"
              className="h-full max-h-96 w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-dark to-accent" />
        <img
          src={IMAGES.ctaBand}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-15"
        />
        <div className="absolute inset-0 bg-slate-950/35" />
        <div ref={ctaRef} className="reveal relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="on-photo text-2xl font-bold text-white sm:text-3xl">
            Get verified once. Get found repeatedly.
          </h2>
          <p className="on-photo mt-3 text-white/85">
            Verified profiles. Serious employers. No spam applications.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup?role=candidate" className="w-full sm:w-auto">
              <Button variant="inverse" size="lg" className="w-full sm:w-auto">
                Create my profile
              </Button>
            </Link>
            <Link
              to="/login"
              className="on-photo text-sm font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline"
            >
              I already have an account
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
