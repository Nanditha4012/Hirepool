import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import CompanySetupPage from './CompanySetupPage'
import { getMyCompanyProfile, type CompanyProfileResponse } from '@/lib/companyApi'
import { useAuth, type Profile } from '@/lib/authStore'
import Skeleton from '@/components/ui/Skeleton'

/**
 * Routing gate for `/company`.
 *
 * Verification is the only thing this asks about:
 *
 *   verified     → straight to the dashboard
 *   not verified → the profile summary, which explains what is being reviewed
 *                  (and opens as the setup form when there is nothing on file
 *                  to summarise yet)
 *
 * Approval used to make no difference to where a company landed on their next
 * sign-in — they were still shown the same read-only "here's what we have on
 * file" screen and had to find their own way onwards, so nothing about the
 * account visibly changed when an admin approved it. Now approval *is* the
 * hop: the summary is the waiting room, and passing verification is what
 * replaces it with the dashboard.
 *
 * Deliberately not gated on profile completeness any more. An admin can
 * approve a company whose optional fields (industry, size) are still blank,
 * and the old check sent exactly that company back to the setup screen —
 * approved, but still stuck in the waiting room.
 */

export default function CompanyEntryPoint() {
  const { syncProfile } = useAuth()
  const [profile, setProfile] = useState<CompanyProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getMyCompanyProfile()
        if (cancelled) return
        setProfile(result)
        // Same reason as CandidateEntryPoint: the verification gate reads
        // `verified` off the session's cached profile, which is otherwise
        // only written at sign-in, so an admin approving this company
        // mid-session would have no effect until the next login.
        syncProfile(result as unknown as Profile)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your company profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [syncProfile])

  // Same reasoning as CandidateEntryPoint: a gate that blanks the viewport
  // while it decides where to send you turns every visit to Home into a
  // visible page load.
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-app-narrow px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="mt-6 h-24 w-full rounded-card" />
        <Skeleton className="mt-6 h-80 w-full rounded-card" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Card>
          <p className="text-danger">{error || 'Something went wrong loading your company profile.'}</p>
        </Card>
      </div>
    )
  }

  // `replace`: /company is a gate, not a destination, so it must not sit in
  // the history stack for Back to land on and immediately re-redirect.
  if (profile.verified) {
    return <Navigate to="/company/dashboard" replace />
  }

  return <CompanySetupPage />
}
