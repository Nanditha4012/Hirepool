import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import ProfileBuilderPage from './ProfileBuilderPage'
import DashboardPage from './DashboardPage'
import SubmissionReportPage from './SubmissionReportPage'
import { getMyProfile, type CandidateProfileResponse } from '@/lib/candidateApi'
import { useAuth, type Profile } from '@/lib/authStore'

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
  const { syncProfile } = useAuth()
  const [profile, setProfile] = useState<CandidateProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getMyProfile()
        if (cancelled) return
        setProfile(result)
        // Hand the freshly-read status to the session. The verification gate
        // (lib/verification.ts) reads it from there to decide which surfaces
        // are open, and the session's copy is otherwise only set at sign-in —
        // so without this a candidate approved mid-session would stay locked
        // out of the app until they signed in again.
        syncProfile(result as unknown as Profile)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [syncProfile])

  // A skeleton in the shape of the dashboard, not a spinner in the middle of
  // an empty page.
  //
  // This gate is the reason clicking "Home" felt like a full page load rather
  // than a tab change: the entire viewport was replaced by a centred loader
  // while it decided which surface to show, so every visit flashed blank.
  // Holding the layout means the only thing that changes on arrival is the
  // content filling in.
  if (loading) {
    return <CandidateHomeSkeleton />
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

  // Handed down so the dashboard doesn't refetch what this gate just read —
  // see DashboardPage's initialProfile.
  if (profile.status === 'approved') {
    return <DashboardPage initialProfile={profile} />
  }

  if (profile.status === 'draft') {
    return <ProfileBuilderPage />
  }

  return <SubmissionReportPage />
}

/**
 * Roughly the shape of whichever surface is about to render — a banner, a
 * stat row, and a two-column body. It cannot match all three destinations
 * exactly, and does not try to: the job is to keep the page from collapsing
 * to nothing and back, which is what registered as a page load.
 */
function CandidateHomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-app px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
      <Skeleton className="h-44 w-full rounded-card" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-72 w-full rounded-card" />
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-52 w-full rounded-card" />
        </div>
      </div>
    </div>
  )
}
