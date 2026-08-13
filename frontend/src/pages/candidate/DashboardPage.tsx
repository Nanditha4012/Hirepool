import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import ProfileCard, { type ProfileCardData } from '@/components/candidate/ProfileCard'
import PageLoader from '@/components/ui/PageLoader'
import PageHero, { HeroStat } from '@/components/ui/PageHero'
import Badge from '@/components/ui/Badge'
import SupportNote from '@/components/ui/SupportNote'
import BoostPurchaseCard from '@/components/candidate/BoostPurchaseCard'
import { useSiteSettings } from '@/lib/siteSettings'
import {
  getMyProfile,
  listAchievements,
  listCompanies,
  listMyThreads,
  listPlatformBadges,
  listWhoUnlockedMe,
  requestReverification,
  setLookingStatus,
  type CandidateProfileResponse,
  type CompanyMaster,
  type MessageThread,
  type PlatformBadgeRow,
  type UnlockedByCompany,
} from '@/lib/candidateApi'

interface DashboardPageProps {
  /**
   * The profile CandidateEntryPoint has already fetched to decide that this
   * page is the right one to show.
   *
   * Passing it down removes the second full-page spinner: the gate fetched
   * the profile, then this page threw that work away and fetched the same
   * record again behind its own `<PageLoader/>`, so opening Home meant two
   * sequential blank screens for one destination. With it in hand the hero
   * and the profile card render on the first frame and only the secondary
   * panels (threads, unlocks, badge counts) are still arriving.
   */
  initialProfile?: CandidateProfileResponse
}

export default function DashboardPage({ initialProfile }: DashboardPageProps = {}) {
  const navigate = useNavigate()
  const { settings: siteSettings } = useSiteSettings()

  const [profile, setProfile] = useState<CandidateProfileResponse | null>(initialProfile ?? null)
  const [companies, setCompanies] = useState<CompanyMaster[]>([])
  const [platformBadges, setPlatformBadges] = useState<PlatformBadgeRow[]>([])
  const [verifiedCounts, setVerifiedCounts] = useState({ projects: 0, research: 0, achievements: 0 })
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [unlockedBy, setUnlockedBy] = useState<UnlockedByCompany[]>([])

  /**
   * Covers the secondary panels only. When the profile arrived as a prop the
   * page is already renderable, so this drives skeletons inside the layout
   * rather than a spinner instead of it.
   */
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [togglingLooking, setTogglingLooking] = useState(false)
  const [requestingReverify, setRequestingReverify] = useState(false)
  const [reverifyError, setReverifyError] = useState<string | null>(null)

  // Replying and blocking moved to /candidate/messages with the rest of the
  // conversation UI — the dashboard only previews threads now, so it no
  // longer carries draft, send or block state.
  const unreadTotal = threads.reduce((sum, thread) => sum + thread.unreadCount, 0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [
          profileResult,
          companiesResult,
          badgesResult,
          projects,
          research,
          achievements,
          threadsResult,
          unlockedByResult,
        ] = await Promise.all([
          getMyProfile(),
          listCompanies(),
          listPlatformBadges(),
          listAchievements('project'),
          listAchievements('research'),
          listAchievements('achievement'),
          listMyThreads(),
          listWhoUnlockedMe(),
        ])
        if (cancelled) return
        setProfile(profileResult)
        setCompanies(companiesResult)
        setPlatformBadges(badgesResult)
        setVerifiedCounts({
          projects: projects.filter((p) => p.verificationStatus === 'verified').length,
          research: research.filter((p) => p.verificationStatus === 'verified').length,
          achievements: achievements.filter((p) => p.verificationStatus === 'verified').length,
        })
        setThreads(threadsResult)
        setUnlockedBy(unlockedByResult)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const cardData: ProfileCardData | null = useMemo(() => {
    if (!profile) return null
    const company = profile.currentCompany
      ? companies.find((c) => c.id === profile.currentCompany?.id) || null
      : null
    return {
      id: profile.id,
      fullName: profile.fullName,
      status: profile.status,
      category: profile.category,
      primaryRole: profile.primaryRole,
      yearsOfExperience: profile.yearsOfExperience,
      secondaryRoles: profile.secondaryRoles,
      skills: profile.skills,
      domain: profile.domain,
      // The candidate's own view shows every qualification, whatever its
      // verdict — including the ones still pending — because this is the
      // screen where they check what they submitted. The company-facing
      // payload filters to verified only; see utils/companyVisibleProfile.ts.
      education: profile.education ?? [],
      resumeLink: profile.resumeLink,
      portfolioLink: profile.portfolioLink,
      location: profile.location,
      isMncAlumni: Boolean(company?.isMnc),
      isFaangMaangAlumni: Boolean(company?.isFaangMaang),
      isStartupAlumni: profile.companyType === 'startup',
      platformBadges: platformBadges.map((b) => ({
        id: b.id,
        platformName: b.platformName,
        badgeSelected: b.badgeSelected,
        platformProfileLink: b.platformProfileLink,
        verificationStatus: b.verificationStatus,
      })),
      verifiedAchievementCounts: verifiedCounts,
    }
  }, [profile, companies, platformBadges, verifiedCounts])

  const handleToggleLooking = async () => {
    if (!profile) return
    setTogglingLooking(true)
    try {
      const updated = await setLookingStatus(!profile.isActivelyLooking)
      setProfile((prev) => (prev ? { ...prev, isActivelyLooking: Boolean(updated.isActivelyLooking) } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setTogglingLooking(false)
    }
  }

  const handleRequestReverification = async () => {
    setRequestingReverify(true)
    setReverifyError(null)
    try {
      setProfile(await requestReverification())
    } catch (err) {
      setReverifyError(err instanceof Error ? err.message : 'Failed to submit the request')
    } finally {
      setRequestingReverify(false)
    }
  }

  // Only a cold load — no profile in hand at all — is allowed to take the
  // whole screen. Arriving from the entry point, `profile` is already set, so
  // this is skipped and the page renders straight away.
  if (loading && !profile) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 text-center sm:px-6 lg:px-10">
        <PageLoader label="Loading your dashboard…" />
      </div>
    )
  }

  if (error || !profile || !cardData) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10">
        <Card>
          <p className="text-danger">{error || 'Something went wrong loading your dashboard.'}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <PageHero
        eyebrow="Candidate"
        title={profile.fullName || 'Your dashboard'}
        subtitle="Your profile is verified and visible to hiring companies."
        meta={
          <>
            <Badge tone="verified">✓ Verified</Badge>
            {profile.category && <Badge tone="neutral">{profile.category}</Badge>}
            {profile.isBoosted && <Badge tone="boost">Boosted</Badge>}
          </>
        }
        actions={
          <Button type="button" variant="inverse" size="sm" onClick={() => navigate('/candidate/edit')}>
            Edit profile
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat label="Companies" value={unlockedBy.length} hint="unlocked your contact" />
          <HeroStat label="Conversations" value={threads.length} hint="in your inbox" />
          <HeroStat
            label="Verified work"
            value={verifiedCounts.projects + verifiedCounts.research + verifiedCounts.achievements}
            hint="projects, papers, wins"
          />
          <HeroStat
            label="Visibility"
            value={profile.isActivelyLooking ? 'On' : 'Paused'}
            hint={profile.isActivelyLooking ? 'discoverable' : 'hidden from search'}
          />
        </div>
      </PageHero>

      {/* Re-verification prompt. An approved candidate who adds a project
          stays live on the portal — only the new item is unverified — but
          they have to explicitly ask for it to be looked at, otherwise a
          verifier has no signal that the additions are ready. */}
      {profile.pendingReverification && (
        <div className="mt-6 animate-fade-up rounded-card border border-boost/30 bg-boost/10 px-5 py-4">
          {profile.reverificationRequestedAt ? (
            <>
              <p className="font-semibold text-boost">Re-verification requested</p>
              <p className="mt-1 text-sm text-ink/70">
                You asked for your new items to be checked on{' '}
                {new Date(profile.reverificationRequestedAt).toLocaleDateString()}. Your profile stays
                live in the meantime — only the new items show as unverified.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-boost">You have unverified changes</p>
              <p className="mt-1 text-sm text-ink/70">
                New or edited work needs a verifier to check it before it shows as verified to
                companies. Your profile stays live either way.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  loading={requestingReverify}
                  onClick={handleRequestReverification}
                >
                  Submit verification request
                </Button>
                {reverifyError && <p className="text-sm text-danger">{reverifyError}</p>}
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  Actively looking · {profile.isActivelyLooking ? 'On' : 'Paused'}
                </p>
                {/* States what the switch actually does *right now*, rather
                    than always describing the off position — the old copy read
                    identically whether you were visible or hidden, which is
                    why it never looked like it had worked. */}
                <p className="text-sm text-ink/60">
                  {profile.isActivelyLooking
                    ? 'Companies can find you in candidate search. Switch off to pause.'
                    : "You're hidden from candidate search. Switch on to be discoverable again."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={profile.isActivelyLooking}
                onClick={handleToggleLooking}
                disabled={togglingLooking}
                className={[
                  'relative h-7 w-12 flex-shrink-0 rounded-full transition-all duration-300 active:scale-95 disabled:opacity-50',
                  // The halo (shadow-glow, defined in tailwind.config.js) is
                  // what makes "on" read as active/live rather than just a
                  // different flat colour — same trick a status light uses.
                  profile.isActivelyLooking ? 'bg-primary shadow-glow' : 'bg-line',
                ].join(' ')}
              >
                <span
                  className={[
                    // Literal white, not bg-card: this thumb sits on a
                    // coloured track, so it must stay light in dark mode too.
                    //
                    // `left-1` is load-bearing, not tidying. Without an
                    // explicit inset an absolutely-positioned box falls back
                    // to its *static* position — and a <button> is
                    // text-align: center in the UA stylesheet, so that static
                    // position was the middle of the 48px track, not its left
                    // edge. Every offset was then measured from the centre:
                    // "off" (+4px) sat mid-track and read as on, and "on"
                    // (+24px) pushed the knob clean off the right-hand end.
                    // The switch was showing the opposite of its own state.
                    //
                    // Anchored at left-1, the travel is the track minus the
                    // thumb minus both insets: 48 - 20 - 4 - 4 = 20px, which
                    // is translate-x-5.
                    'absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow-soft transition-transform duration-200',
                    profile.isActivelyLooking ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                >
                  {/* A glanceable eye / eye-off inside the thumb — the
                      track colour alone read as "just a blue dot" with no
                      sense of what it meant; the icon ties it back to
                      "visible in search" vs "hidden" at a glance. */}
                  {profile.isActivelyLooking ? (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  ) : (
                    <svg className="h-3 w-3 text-ink/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          </Card>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink/70">Live preview</p>
            <ProfileCard profile={cardData} />
          </div>

          {/* A preview, not the inbox. Conversations live at
              /candidate/messages now — the dashboard shows the three most
              recent so you know there is something waiting, and hands off. */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
                Inbox
                {unreadTotal > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                    {unreadTotal}
                  </span>
                )}
              </h2>
              <Link
                to="/candidate/messages"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Open messages →
              </Link>
            </div>

            {threads.length === 0 ? (
              <p className="mt-2 text-sm text-ink/40">
                No messages yet — companies can reach you here once they unlock your contact.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-1">
                {threads.slice(0, 3).map((thread) => {
                  const lastMessage = thread.messages[thread.messages.length - 1]
                  return (
                    <Link
                      key={thread.companyId}
                      to="/candidate/messages"
                      className="flex items-center gap-3 rounded-card px-2 py-2 transition-colors hover:bg-surface"
                    >
                      <Avatar name={thread.companyName} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-ink">{thread.companyName}</span>
                          {thread.unreadCount > 0 && (
                            <span className="flex h-5 min-w-[1.25rem] flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                              {thread.unreadCount}
                            </span>
                          )}
                        </span>
                        {lastMessage && (
                          <span className="mt-0.5 block truncate text-sm text-ink/55">
                            {lastMessage.senderRole === 'candidate' ? 'You: ' : ''}
                            {lastMessage.body}
                          </span>
                        )}
                      </span>
                    </Link>
                  )
                })}
                {threads.length > 3 && (
                  <Link
                    to="/candidate/messages"
                    className="mt-1 px-2 text-sm text-ink/50 hover:text-primary"
                  >
                    +{threads.length - 3} more conversation
                    {threads.length - 3 === 1 ? '' : 's'}
                  </Link>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <BoostPurchaseCard
            isBoosted={profile.isBoosted}
            boostExpiresAt={profile.boostExpiresAt}
            siteSettings={siteSettings}
          />
          <Link to="/candidate/payments" className="-mt-4 self-end text-xs font-semibold text-primary hover:underline">
            View payment history
          </Link>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Companies who unlocked your contact</h2>
            {unlockedBy.length === 0 ? (
              <p className="mt-2 text-sm text-ink/40">No companies have unlocked your profile yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {unlockedBy.map((entry) => (
                  <div key={entry.companyId} className="border-b border-line pb-2 last:border-0 last:pb-0">
                    <p className="font-medium text-ink">{entry.companyName || 'Unknown company'}</p>
                    {entry.industry && <p className="text-sm text-ink/60">{entry.industry}</p>}
                    <p className="text-xs text-ink/40">
                      Unlocked {new Date(entry.unlockedAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <SupportNote className="mt-10" />
    </div>
  )
}
