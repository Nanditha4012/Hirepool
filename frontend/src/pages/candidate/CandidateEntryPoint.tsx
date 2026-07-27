import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import PageLoader from '@/components/ui/PageLoader'
import ProfileBuilderPage from './ProfileBuilderPage'
import DashboardPage from './DashboardPage'
import SubmissionReportPage from './SubmissionReportPage'
import { getMyProfile, type CandidateProfileResponse } from '@/lib/candidateApi'

/**
 * Routing gate for `/candidate`. Fetches the profile once, then picks the
 * right surface for where the candidate actually is:
 *
 *   no category  → the category picker (a genuinely new candidate)
 *   draft        → the builder, to finish and submit
 *   submitted / under_review / rejected / needs_info → the submission report
 *   approved     → the dashboard
 *
 * The middle case fixes a real bug: previously anything that wasn't
 * `approved` fell through to the builder, so a candidate who had already
 * submitted was shown an editable form asking again for details they had
 * already sent, with no way to see what they submitted or what the verifier
 * said about it.
 *
 * Deliberately local state rather than global — nothing else in the app
 * needs this fetch, and each destination page does its own fetching once
 * mounted.
 */
export default function CandidateEntryPoint() {
  const [profile, setProfile] = useState<CandidateProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getMyProfile()
        if (!cancelled) setProfile(result)
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
    return <PageLoader label="Loading your profile…" />
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error || 'Failed to load your profile.'}</p>
        </Card>
      </div>
    )
  }

  // Only a candidate who has genuinely never picked one gets the picker.
  if (!profile.category) {
    return <Navigate to="/onboarding/category" replace />
  }

  if (profile.status === 'approved') {
    return <DashboardPage />
  }

  if (profile.status === 'draft') {
    return <ProfileBuilderPage />
  }

  return <SubmissionReportPage />
}
