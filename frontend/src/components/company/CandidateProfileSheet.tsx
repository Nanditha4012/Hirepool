import { useEffect } from 'react'
import Button from '@/components/ui/Button'
import type { CandidateEducationSummary, CandidateSearchResult } from '@/lib/companyApi'

/**
 * The verified profile sheet — what a company reads instead of the
 * candidate's resume file.
 *
 * Companies used to get `resumeLink` and open the candidate's own PDF. That
 * looked like a feature and was a leak: a resume carries a personal phone
 * number, a home address, every project URL and often a second email, none of
 * which a company should have before it has paid to unlock the candidate —
 * and none of which the platform can strip out of a file it does not own.
 *
 * So the sheet is generated from the five things a company is entitled to see
 * (name, role, skills, experience, education), all of them already verified.
 * It is also strictly better as a hiring document than most resumes: nothing
 * on it is a claim, everything on it has been checked.
 *
 * Printable, because the first thing a recruiter does with a shortlist is
 * share it with a hiring manager who does not have a login.
 */

const LEVEL_LABELS: Record<CandidateEducationSummary['level'], string> = {
  tenth: '10th',
  twelfth: '12th',
  diploma: 'Diploma',
  undergraduate: 'Undergraduate',
  postgraduate: 'Postgraduate',
  doctorate: 'Doctorate',
}

function formatScore(entry: CandidateEducationSummary): string | null {
  if (entry.scoreValue == null) return null
  if (entry.scoreType === 'percentage') return `${entry.scoreValue}%`
  return `${entry.scoreValue} ${entry.scoreType?.startsWith('cgpa') ? 'CGPA' : 'GPA'}`
}

function formatPeriod(entry: CandidateEducationSummary): string | null {
  if (entry.isOngoing) return `${entry.startYear ?? '…'} – present`
  if (entry.startYear && entry.endYear) return `${entry.startYear} – ${entry.endYear}`
  return entry.endYear ? String(entry.endYear) : null
}

interface CandidateProfileSheetProps {
  candidate: CandidateSearchResult
  onClose: () => void
}

export default function CandidateProfileSheet({ candidate, onClose }: CandidateProfileSheetProps) {
  // Escape closes. A modal that can only be dismissed by finding a small ×
  // is the kind of thing people complain about without being able to say why.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const experience =
    candidate.yearsOfExperience != null
      ? `${candidate.yearsOfExperience} ${candidate.yearsOfExperience === 1 ? 'year' : 'years'}`
      : candidate.category === 'fresher'
        ? 'Fresher'
        : null

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm print:static print:bg-transparent print:p-0 print:backdrop-blur-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Verified profile for ${candidate.fullName ?? 'candidate'}`}
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl animate-scale-in rounded-card bg-card shadow-lift print:my-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header. Prints too — a sheet handed on without the branding is
            just an anonymous list of claims. */}
        <div className="rounded-t-card bg-gradient-to-br from-primary to-accent px-7 py-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                Verified profile
              </p>
              <h2 className="mt-1 truncate text-2xl font-extrabold">
                {candidate.fullName ?? 'Candidate'}
              </h2>
              <p className="mt-0.5 text-white/85">
                {[candidate.primaryRole?.roleName, candidate.domain?.domainName]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-lg leading-none text-white transition-colors hover:bg-white/25 print:hidden"
            >
              ×
            </button>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat label="Experience" value={experience ?? '—'} />
            <HeroStat label="Location" value={candidate.location ?? '—'} />
            <HeroStat
              label="Notice"
              value={candidate.noticePeriod ? candidate.noticePeriod.replace(/_/g, ' ') : '—'}
            />
            <HeroStat label="Level" value={candidate.category ?? '—'} />
          </dl>
        </div>

        <div className="flex flex-col gap-6 px-7 py-6">
          <Block title="Skills">
            {candidate.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {candidate.skills.map((skill) => (
                  <span
                    key={skill.id}
                    className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
                  >
                    {skill.skillName}
                  </span>
                ))}
              </div>
            ) : (
              <Empty>No skills listed.</Empty>
            )}
          </Block>

          {candidate.secondaryRoles.length > 0 && (
            <Block title="Also open to">
              <div className="flex flex-wrap gap-1.5">
                {candidate.secondaryRoles.map((role) => (
                  <span
                    key={role.id}
                    className="rounded-full bg-surface px-2.5 py-1 text-sm text-ink/70"
                  >
                    {role.roleName}
                  </span>
                ))}
              </div>
            </Block>
          )}

          <Block title="Education">
            {candidate.education.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {candidate.education.map((entry) => {
                  const score = formatScore(entry)
                  const period = formatPeriod(entry)
                  return (
                    <li
                      key={entry.id}
                      className="rounded-card border border-line px-4 py-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-ink">{entry.institution}</p>
                        <span
                          className={[
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                            entry.humanVerified
                              ? 'bg-verified/12 text-verified'
                              : 'bg-primary/10 text-primary',
                          ].join(' ')}
                          // The distinction is stated rather than hidden: a
                          // company deciding on this should know whether a
                          // person or a document reader confirmed it.
                          title={
                            entry.humanVerified
                              ? 'Checked by a Hirepool verifier'
                              : 'Matched automatically against the official marks card'
                          }
                        >
                          ✓ {entry.humanVerified ? 'Verified' : 'Document-matched'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink/65">
                        {[
                          LEVEL_LABELS[entry.level],
                          entry.degree,
                          entry.branch,
                          entry.boardOrUniversity,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink/50">
                        {period && <span>{period}</span>}
                        {score && <span className="font-medium text-ink/70">{score}</span>}
                      </p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty>No verified education on file yet.</Empty>
            )}
          </Block>

          {candidate.isUnlockedByMe && (
            <Block title="Contact">
              <div className="flex flex-col gap-1 text-sm">
                {candidate.email && (
                  <a href={`mailto:${candidate.email}`} className="text-primary hover:underline">
                    {candidate.email}
                  </a>
                )}
                {candidate.phone && <span className="text-ink/75">{candidate.phone}</span>}
              </div>
            </Block>
          )}

          <p className="rounded-card bg-surface px-4 py-3 text-xs text-ink/55">
            Every line on this sheet has been checked — by a Hirepool verifier, or against an
            official document. Projects, portfolio and coding-platform profiles are the
            candidate&apos;s own and are not shared.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-7 py-4 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            Print / save as PDF
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-white/15 bg-white/10 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-white/65">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold capitalize">{value}</dd>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink/45">{title}</h3>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink/45">{children}</p>
}
