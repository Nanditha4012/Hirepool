import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import CompanySetupPage from './CompanySetupPage'
import { getMyCompanyProfile, type CompanyProfileResponse } from '@/lib/companyApi'
import PageLoader from '@/components/ui/PageLoader'

/**
 * Routing gate for `/company`.
 *
 *   profile still a placeholder → the setup form
 *   filled in, not yet verified → the dashboard (which explains the wait)
 *   filled in AND verified      → the candidate portal
 *
 * That last hop is the point. This used to land every complete profile on the
 * dashboard, so a company that had just been verified by an admin still had to
 * find their own way to the candidate search — the thing they signed up for.
 * The whole product for a verified company is the candidate portal, so that is
 * now what `/company` means for them; the dashboard stays reachable at
 * `/company/dashboard` for billing and quota.
 */
function isProfileCompleteEnough(profile: CompanyProfileResponse): boolean {
  return !profile.companyName.includes('@') && Boolean(profile.industry)
}

export default function CompanyEntryPoint() {
  const [profile, setProfile] = useState<CompanyProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await getMyCompanyProfile()
        if (!cancelled) setProfile(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your company profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <PageLoader label="Loading…" />
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

  if (!isProfileCompleteEnough(profile)) {
    return <CompanySetupPage />
  }

  // `replace` on both: /company is a gate, not a destination, so it must not
  // sit in the history stack for Back to land on and immediately re-redirect.
  return <Navigate to={profile.verified ? '/company/search' : '/company/dashboard'} replace />
}
