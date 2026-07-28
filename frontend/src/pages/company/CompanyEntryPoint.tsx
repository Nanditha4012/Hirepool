import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import CompanySetupPage from './CompanySetupPage'
import DashboardPage from './DashboardPage'
import { getMyCompanyProfile, type CompanyProfileResponse } from '@/lib/companyApi'
import PageLoader from '@/components/ui/PageLoader'

// Thin routing gate for `/company`, mirroring CandidateEntryPoint: fetch the
// profile once, then render the dashboard once the company has filled in
// enough to be useful, and the setup form otherwise. Local state only —
// DashboardPage/CompanySetupPage each do their own fetching once mounted.
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
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <PageLoader label="Loading…" />
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

  return isProfileCompleteEnough(profile) ? <DashboardPage /> : <CompanySetupPage />
}
