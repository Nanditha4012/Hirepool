import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Combobox from '@/components/ui/Combobox'
import { useAuth, type CandidateCategory } from '@/lib/authStore'
import {
  createEducation,
  listDomains,
  listRoles,
  upsertMyProfile,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_SCORE_LABELS,
  type DomainMaster,
  type EducationLevel,
  type EducationScoreType,
  type RoleMaster,
} from '@/lib/candidateApi'

/**
 * What a new candidate does in their first two minutes.
 *
 * This replaces a single category picker that asked one question and then
 * dropped the candidate into a long, empty profile form with nothing filled
 * in. The drop-off there was structural: the picker felt like a step, and the
 * blank form that followed felt like homework, so the two together read as
 * "you're not done, you've barely started".
 *
 * Three short steps instead, each one thing, each answering a question the
 * candidate already knows the answer to without looking anything up. What
 * they enter here is real profile data — it lands in the same fields the
 * builder edits — so arriving at the builder afterwards it is already
 * part-filled, and the remaining work reads as finishing rather than starting.
 *
 * Every step after the first is skippable. A candidate who wants to get to
 * the app now should be able to; the builder will ask again, and asking twice
 * is cheaper than losing them here.
 */

const CATEGORIES: {
  value: CandidateCategory
  title: string
  blurb: string
  icon: string
  accent: string
  ring: string
}[] = [
  {
    value: 'fresher',
    title: 'Fresher',
    blurb: '0–1 years in. Studying, or just out.',
    icon: '🌱',
    accent: 'from-verified/15 to-transparent',
    ring: 'border-verified',
  },
  {
    value: 'experienced',
    title: 'Experienced',
    blurb: 'A few years in, with a track record to show.',
    icon: '🚀',
    accent: 'from-primary/15 to-transparent',
    ring: 'border-primary',
  },
  {
    value: 'executive',
    title: 'Executive',
    blurb: 'Leading teams, owning outcomes.',
    icon: '👑',
    accent: 'from-boost/15 to-transparent',
    ring: 'border-boost',
  },
]

const LEVEL_OPTIONS = (Object.keys(EDUCATION_LEVEL_LABELS) as EducationLevel[]).map((value) => ({
  value,
  label: EDUCATION_LEVEL_LABELS[value],
}))

const SCORE_OPTIONS = (Object.keys(EDUCATION_SCORE_LABELS) as EducationScoreType[]).map((value) => ({
  value,
  label: EDUCATION_SCORE_LABELS[value],
}))

const STEPS = ['You', 'Basics', 'Education'] as const

export default function OnboardingWizard() {
  const { setCategory, user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [category, setSelectedCategory] = useState<CandidateCategory | null>(null)

  // Step 2
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [primaryRoleId, setPrimaryRoleId] = useState<string | null>(null)
  const [domainId, setDomainId] = useState<string | null>(null)
  const [location, setLocation] = useState('')

  // Step 3
  const [level, setLevel] = useState<EducationLevel>('undergraduate')
  const [institution, setInstitution] = useState('')
  const [boardOrUniversity, setBoardOrUniversity] = useState('')
  const [degree, setDegree] = useState('')
  const [branch, setBranch] = useState('')
  const [endYear, setEndYear] = useState('')
  const [scoreValue, setScoreValue] = useState('')
  const [scoreType, setScoreType] = useState<EducationScoreType>('percentage')

  const [roles, setRoles] = useState<RoleMaster[]>([])
  const [domains, setDomains] = useState<DomainMaster[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [roleResult, domainResult] = await Promise.all([listRoles(), listDomains()])
        if (cancelled) return
        setRoles(roleResult)
        setDomains(domainResult)
      } catch {
        // The comboboxes degrade to empty rather than blocking onboarding —
        // both fields are re-asked in the builder, which fetches them again.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const roleOptions = useMemo(() => roles.map((r) => ({ value: r.id, label: r.roleName })), [roles])
  const domainOptions = useMemo(
    () => domains.map((d) => ({ value: d.id, label: d.domainName })),
    [domains],
  )

  const isSchool = level === 'tenth' || level === 'twelfth'

  /** Straight to the app, keeping whatever has been entered so far. */
  const finish = () => navigate('/candidate')

  const handleCategory = async (value: CandidateCategory) => {
    setSelectedCategory(value)
    setError(null)
    setBusy(true)
    try {
      // Saved on click rather than on a Continue button: it is the one answer
      // the whole rest of the form depends on, and committing it here means a
      // candidate who closes the tab mid-wizard still comes back to a profile
      // that knows what they are.
      await setCategory(value)
      setStep(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that')
      setSelectedCategory(null)
    } finally {
      setBusy(false)
    }
  }

  const handleBasics = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await upsertMyProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        primaryRoleId,
        domainId,
        location: location.trim(),
      })
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that')
    } finally {
      setBusy(false)
    }
  }

  const handleEducation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!institution.trim()) {
      setError('Add where you studied, or skip this for now.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await createEducation({
        level,
        institution: institution.trim(),
        boardOrUniversity: boardOrUniversity.trim() || null,
        degree: isSchool ? null : degree.trim() || null,
        branch: isSchool ? null : branch.trim() || null,
        endYear: endYear ? Number(endYear) : null,
        scoreValue: scoreValue ? Number(scoreValue) : null,
        scoreType: scoreValue ? scoreType : null,
      })
      finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden">
      {/* Two soft washes behind the card — the page this replaces was a white
          rectangle on a white page, which is a poor first impression of a
          product whose whole pitch is that it is nicer than a job board. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/20 blur-3xl"
      />

      <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-14 sm:px-6">
        <StepRail current={step} />

        {error && (
          <p className="rounded-card bg-danger/10 px-4 py-3 text-center text-sm text-danger">{error}</p>
        )}

        {step === 0 && (
          <section key="step-0" className="animate-fade-up">
            <header className="text-center">
              <h1 className="text-3xl font-extrabold text-ink">Where are you right now?</h1>
              <p className="mt-2 text-ink/60">
                It sets which details we ask for — you can move up later.
              </p>
            </header>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {CATEGORIES.map((option, index) => {
                const selected = category === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={busy}
                    onClick={() => handleCategory(option.value)}
                    style={{ animationDelay: `${index * 80}ms` }}
                    className={[
                      'group animate-fade-up rounded-card border-2 bg-gradient-to-b p-5 text-left transition-all duration-200',
                      option.accent,
                      selected ? option.ring : 'border-line hover:-translate-y-1 hover:shadow-lift',
                      busy && !selected ? 'opacity-50' : '',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden="true"
                      className="block text-3xl transition-transform duration-300 group-hover:scale-110"
                    >
                      {option.icon}
                    </span>
                    <p className="mt-3 font-bold text-ink">{option.title}</p>
                    <p className="mt-1 text-sm text-ink/60">{option.blurb}</p>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {step === 1 && (
          <section key="step-1" className="animate-fade-up">
            <header className="text-center">
              <h1 className="text-3xl font-extrabold text-ink">The basics</h1>
              <p className="mt-2 text-ink/60">Five fields. This is what a company sees first.</p>
            </header>

            <form
              onSubmit={handleBasics}
              className="mt-8 rounded-card border border-line bg-card p-6 shadow-soft"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Full name"
                  placeholder="As it appears on your documents"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <Input
                  label="Phone"
                  placeholder="10-digit mobile"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Combobox
                  label="What do you do?"
                  options={roleOptions}
                  value={primaryRoleId}
                  onChange={setPrimaryRoleId}
                  placeholder="Search roles…"
                />
                <Combobox
                  label="Which domain?"
                  options={domainOptions}
                  value={domainId}
                  onChange={setDomainId}
                  placeholder="Search domains…"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Where are you based?"
                    placeholder="City, State"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button type="submit" loading={busy}>
                  Continue
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep(2)}>
                  Skip for now
                </Button>
              </div>
            </form>
          </section>
        )}

        {step === 2 && (
          <section key="step-2" className="animate-fade-up">
            <header className="text-center">
              <h1 className="text-3xl font-extrabold text-ink">Where did you study?</h1>
              <p className="mt-2 text-ink/60">
                Add your most recent qualification. You can add the rest — and get them verified
                automatically — from your profile.
              </p>
            </header>

            <form
              onSubmit={handleEducation}
              className="mt-8 rounded-card border border-line bg-card p-6 shadow-soft"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Level"
                  options={LEVEL_OPTIONS}
                  value={level}
                  onChange={(e) => setLevel(e.target.value as EducationLevel)}
                />
                <Input
                  label="School / college"
                  placeholder="e.g. RV College of Engineering"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
                <Input
                  label={isSchool ? 'Board' : 'University'}
                  placeholder={isSchool ? 'e.g. CBSE' : 'e.g. VTU'}
                  value={boardOrUniversity}
                  onChange={(e) => setBoardOrUniversity(e.target.value)}
                />
                <Input
                  label="Year of completion"
                  type="number"
                  min={1950}
                  max={2100}
                  placeholder="2023"
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                />

                {!isSchool && (
                  <>
                    <Input
                      label="Degree"
                      placeholder="e.g. B.E."
                      value={degree}
                      onChange={(e) => setDegree(e.target.value)}
                    />
                    <Input
                      label="Branch"
                      placeholder="e.g. Computer Science"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </>
                )}

                <Input
                  label="Score (optional)"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="82.5"
                  value={scoreValue}
                  onChange={(e) => setScoreValue(e.target.value)}
                />
                <Select
                  label="Score type"
                  options={SCORE_OPTIONS}
                  value={scoreType}
                  onChange={(e) => setScoreType(e.target.value as EducationScoreType)}
                />
              </div>

              <p className="mt-4 rounded-card bg-primary/[0.06] px-3 py-2 text-xs text-ink/60">
                ⚡ Once this is in, link your marks card from your profile and we&apos;ll verify it
                automatically — usually in seconds, instead of waiting for a reviewer.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button type="submit" loading={busy}>
                  Finish setup
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={finish}>
                  Skip for now
                </Button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * The three-dot progress rail.
 *
 * Present from the first screen, so the candidate can see this is short
 * before they commit to it — the single most effective thing on a signup
 * flow, and precisely what the old one-question-then-a-wall version lacked.
 */
function StepRail({ current }: { current: number }) {
  return (
    <ol className="flex items-center justify-center gap-2" aria-label="Setup progress">
      {STEPS.map((label, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={[
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all duration-300',
                done
                  ? 'bg-verified text-white'
                  : active
                    ? 'bg-primary text-white shadow-glow'
                    : 'bg-surface text-ink/40',
              ].join(' ')}
              aria-current={active ? 'step' : undefined}
            >
              {done ? '✓' : index + 1}
            </span>
            <span
              className={[
                'text-sm font-medium transition-colors',
                active ? 'text-ink' : 'text-ink/40',
              ].join(' ')}
            >
              {label}
            </span>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={[
                  'mx-1 h-0.5 w-6 rounded-full transition-colors duration-300 sm:w-10',
                  done ? 'bg-verified' : 'bg-line',
                ].join(' ')}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
