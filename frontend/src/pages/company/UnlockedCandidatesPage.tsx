import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ProfileCard, { type ProfileCardData } from '@/components/candidate/ProfileCard'
import { listMyUnlocked, updateUnlockNote, type UnlockedCandidate } from '@/lib/companyApi'
import PageLoader from '@/components/ui/PageLoader'

function mapToProfileCardData(candidate: UnlockedCandidate): ProfileCardData {
  return {
    id: candidate.candidateId,
    fullName: candidate.fullName,
    status: 'approved',
    category: (candidate.category as ProfileCardData['category']) || null,
    primaryRole: candidate.primaryRole,
    yearsOfExperience: null,
    secondaryRoles: [],
    skills: [],
    domain: null,
    resumeLink: null,
    portfolioLink: null,
    isMncAlumni: false,
    isFaangMaangAlumni: false,
    isStartupAlumni: false,
    platformBadges: candidate.platformBadges.map((b) => ({
      id: b.id,
      platformName: b.platformName,
      badgeSelected: b.badgeSelected,
      platformProfileLink: b.platformProfileLink,
      verificationStatus: b.verificationStatus as 'pending' | 'verified' | 'rejected',
    })),
    verifiedAchievementCounts: candidate.verifiedAchievementCounts,
    phone: candidate.phone,
    email: candidate.email,
    whatsappLink: candidate.whatsappLink,
  }
}

export default function UnlockedCandidatesPage() {
  const [candidates, setCandidates] = useState<UnlockedCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [savingNoteFor, setSavingNoteFor] = useState<string | null>(null)
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listMyUnlocked()
        if (cancelled) return
        setCandidates(result)
        setNoteDrafts(
          Object.fromEntries(result.map((c) => [c.candidateId, c.note || ''])),
        )
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load unlocked candidates')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSaveNote = async (candidateId: string) => {
    setSavingNoteFor(candidateId)
    setNoteErrors((prev) => ({ ...prev, [candidateId]: '' }))
    try {
      const updated = await updateUnlockNote(candidateId, noteDrafts[candidateId] || '')
      setCandidates((prev) =>
        prev.map((c) => (c.candidateId === candidateId ? { ...c, note: updated.note } : c)),
      )
    } catch (err) {
      setNoteErrors((prev) => ({
        ...prev,
        [candidateId]: err instanceof Error ? err.message : 'Failed to save note',
      }))
    } finally {
      setSavingNoteFor(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 text-center sm:px-6 lg:px-10">
        <PageLoader label="Loading your unlocked candidates…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-app px-4 py-16 sm:px-6 lg:px-10">
        <Card>
          <p className="text-danger">{error}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-app px-4 py-10 sm:px-6 lg:px-10">
      <h1 className="text-2xl font-bold text-ink">My unlocked candidates</h1>
      <p className="mt-1 text-ink/60">Candidates whose contact details you&apos;ve unlocked.</p>

      {candidates.length === 0 ? (
        <Card className="mt-8">
          <p className="text-ink/60">You haven&apos;t unlocked any candidates yet.</p>
        </Card>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {candidates.map((candidate) => (
            <div key={candidate.candidateId} className="flex flex-col gap-3">
              <ProfileCard profile={mapToProfileCardData(candidate)} />
              <Card className="flex flex-col gap-2 p-4">
                <label className="text-sm font-medium text-ink" htmlFor={`note-${candidate.candidateId}`}>
                  Private note
                </label>
                <textarea
                  id={`note-${candidate.candidateId}`}
                  rows={3}
                  value={noteDrafts[candidate.candidateId] || ''}
                  onChange={(e) =>
                    setNoteDrafts((prev) => ({ ...prev, [candidate.candidateId]: e.target.value }))
                  }
                  className={[
                    'rounded-card border border-line px-3 py-2 text-ink placeholder:text-ink/40',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
                  ].join(' ')}
                  placeholder="Add a private note about this candidate…"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    loading={savingNoteFor === candidate.candidateId}
                    onClick={() => handleSaveNote(candidate.candidateId)}
                  >
                    Save note
                  </Button>
                  <p className="text-xs text-ink/40">
                    Unlocked {new Date(candidate.unlockedAt).toLocaleDateString()}
                  </p>
                </div>
                {noteErrors[candidate.candidateId] && (
                  <p className="text-sm text-danger">{noteErrors[candidate.candidateId]}</p>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
