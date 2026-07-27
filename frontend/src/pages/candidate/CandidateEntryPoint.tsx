import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import ProfileBuilderPage from './ProfileBuilderPage'
import DashboardPage from './DashboardPage'
import { getMyProfile, type CandidateProfileResponse } from '@/lib/candidateApi'

// Thin routing gate for `/candidate`: fetch the profile once, then render the
// dashboard for approved candidates and the builder form for everyone else.
// Deliberately local state rather than global — nothing else in the app needs
// this profile fetch, and ProfileBuilderPage/DashboardPage each do their own
// fetching anyway once mounted.
export default function CandidateEntryPoint() {
  const [status, setStatus] = useState<CandidateProfileResponse['status'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const profile = await getMyProfile()
        if (!cancelled) setStatus(profile.status)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="text-ink/60">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error}</p>
        </Card>
      </div>
    )
  }

  return status === 'approved' ? <DashboardPage /> : <ProfileBuilderPage />
}
