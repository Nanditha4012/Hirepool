import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ProfileCard, { type ProfileCardData } from '@/components/candidate/ProfileCard'
import {
  blockCompany,
  getMyProfile,
  listAchievements,
  listCompanies,
  listMyThreads,
  listPlatformBadges,
  listWhoUnlockedMe,
  replyToThread,
  setLookingStatus,
  type CandidateProfileResponse,
  type CompanyMaster,
  type MessageThread,
  type PlatformBadgeRow,
  type UnlockedByCompany,
} from '@/lib/candidateApi'

export default function DashboardPage() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState<CandidateProfileResponse | null>(null)
  const [companies, setCompanies] = useState<CompanyMaster[]>([])
  const [platformBadges, setPlatformBadges] = useState<PlatformBadgeRow[]>([])
  const [verifiedCounts, setVerifiedCounts] = useState({ projects: 0, research: 0, achievements: 0 })
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [unlockedBy, setUnlockedBy] = useState<UnlockedByCompany[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [togglingLooking, setTogglingLooking] = useState(false)
  const [expandedThread, setExpandedThread] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [blockedCompanyIds, setBlockedCompanyIds] = useState<Set<string>>(new Set())
  const [blockingCompanyId, setBlockingCompanyId] = useState<string | null>(null)

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
      resumeLink: profile.resumeLink,
      portfolioLink: profile.portfolioLink,
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

  const handleReply = async (companyId: string) => {
    if (!replyBody.trim()) return
    setSendingReply(true)
    try {
      const message = await replyToThread(companyId, replyBody.trim())
      setThreads((prev) =>
        prev.map((t) => (t.companyId === companyId ? { ...t, messages: [...t.messages, message] } : t)),
      )
      setReplyBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply')
    } finally {
      setSendingReply(false)
    }
  }

  const handleBlock = async (companyId: string) => {
    if (!window.confirm('Block messages from this company?')) return
    setBlockingCompanyId(companyId)
    try {
      await blockCompany(companyId)
      setBlockedCompanyIds((prev) => new Set(prev).add(companyId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block company')
    } finally {
      setBlockingCompanyId(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <p className="text-ink/60">Loading your dashboard…</p>
      </div>
    )
  }

  if (error || !profile || !cardData) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error || 'Something went wrong loading your dashboard.'}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Your dashboard</h1>
          <p className="mt-1 text-ink/60">Your profile is approved and visible to companies.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => navigate('/candidate/edit')}>
          Edit profile
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">Actively looking</p>
                <p className="text-sm text-ink/60">Toggle this off if you want to pause being seen by companies.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={profile.isActivelyLooking}
                onClick={handleToggleLooking}
                disabled={togglingLooking}
                className={[
                  'relative h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-50',
                  profile.isActivelyLooking ? 'bg-primary' : 'bg-gray-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform',
                    profile.isActivelyLooking ? 'translate-x-6' : 'translate-x-1',
                  ].join(' ')}
                />
              </button>
            </div>
          </Card>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink/70">Live preview</p>
            <ProfileCard profile={cardData} />
          </div>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Inbox</h2>
            {threads.length === 0 ? (
              <p className="mt-2 text-sm text-ink/40">
                No messages yet — companies will be able to reach out once Phase 3 ships.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {threads.map((thread) => {
                  const lastMessage = thread.messages[thread.messages.length - 1]
                  const isExpanded = expandedThread === thread.companyId
                  return (
                    <div key={thread.companyId} className="rounded-card border border-gray-200 p-3">
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-2 text-left"
                        onClick={() => setExpandedThread(isExpanded ? null : thread.companyId)}
                      >
                        <div>
                          <p className="font-medium text-ink">{thread.companyName || 'Unknown company'}</p>
                          {lastMessage && (
                            <p className="mt-0.5 truncate text-sm text-ink/60">{lastMessage.body}</p>
                          )}
                        </div>
                        <span className="text-ink/40" aria-hidden="true">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3">
                          <div className="flex flex-col gap-2">
                            {thread.messages.map((message) => (
                              <div
                                key={message.id}
                                className={[
                                  'max-w-[80%] rounded-card px-3 py-2 text-sm',
                                  message.senderRole === 'candidate'
                                    ? 'self-end bg-primary/10 text-ink'
                                    : 'self-start bg-surface text-ink',
                                ].join(' ')}
                              >
                                {message.body}
                              </div>
                            ))}
                          </div>
                          {blockedCompanyIds.has(thread.companyId) ? (
                            <p className="text-sm text-ink/60">Blocked — they can no longer message you</p>
                          ) : (
                            <>
                              <div className="flex gap-2">
                                <Input
                                  className="flex-1"
                                  placeholder="Write a reply…"
                                  value={expandedThread === thread.companyId ? replyBody : ''}
                                  onChange={(e) => setReplyBody(e.target.value)}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  loading={sendingReply}
                                  onClick={() => handleReply(thread.companyId)}
                                >
                                  Send
                                </Button>
                              </div>
                              <button
                                type="button"
                                className="self-start text-xs text-danger underline disabled:opacity-50"
                                disabled={blockingCompanyId === thread.companyId}
                                onClick={() => handleBlock(thread.companyId)}
                              >
                                Block this company
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-lg font-semibold text-ink">Boost my profile</h2>
            <p className="mt-1 text-sm text-ink/60">Get more visibility with companies.</p>
            <Button type="button" className="mt-3" disabled>
              Boost my profile
            </Button>
            <p className="mt-2 text-xs text-ink/40">Available once payments ship (Phase 6).</p>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-ink">Companies who unlocked your contact</h2>
            {unlockedBy.length === 0 ? (
              <p className="mt-2 text-sm text-ink/40">No companies have unlocked your profile yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {unlockedBy.map((entry) => (
                  <div key={entry.companyId} className="border-b border-gray-100 pb-2 last:border-0 last:pb-0">
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
    </div>
  )
}
