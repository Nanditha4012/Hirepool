import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { APP_NAME } from '@/lib/config'

const steps = [
  {
    number: '01',
    title: 'Register & get verified',
    description: 'Create your profile and get verified once by our team — no repeat screening for every application.',
  },
  {
    number: '02',
    title: 'Show up on the platform',
    description: 'Your verified profile becomes discoverable to companies actively hiring in your category.',
  },
  {
    number: '03',
    title: 'Companies unlock your contact',
    description: 'Interested employers pay to unlock your contact info — you only hear from people who mean business.',
  },
]

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight text-ink sm:text-5xl lg:text-6xl">
            Companies find <span className="text-primary">you</span>. Not the other way around.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-ink/70">
            {APP_NAME} is a reverse job board: get verified once, then let hiring companies come to you.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/signup?role=candidate" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                I&apos;m looking for a job
              </Button>
            </Link>
            <Link to="/signup?role=company" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                I&apos;m hiring
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-center text-2xl font-bold text-ink sm:text-3xl">How it works</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.number} className="flex flex-col gap-3">
              <span className="text-sm font-bold text-primary">{step.number}</span>
              <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
              <p className="text-ink/60">{step.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink/40">
            Verified profiles. Serious employers. No spam applications.
          </p>
        </div>
      </section>
    </div>
  )
}
