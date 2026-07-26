import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import { useAuth } from '@/lib/authStore'
import { apiFetch } from '@/lib/apiClient'

interface PingResponse {
  message: string
  userId: string
}

// Phase-1 placeholder proving auth + role-gating works end to end.
// The real company portal ships in Phases 2-5.
export default function CompanyStub() {
  const { user } = useAuth()
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await apiFetch<PingResponse>('/companies/ping')
        if (!cancelled) setPing(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ping failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <Card>
        <p className="mb-2 inline-block rounded-full bg-boost/10 px-2.5 py-0.5 text-xs font-semibold text-boost">
          Placeholder — real company portal ships in Phases 2-5
        </p>
        <h1 className="text-2xl font-bold text-ink">Company area</h1>
        <p className="mt-2 text-ink/60">Signed in as {user?.email}</p>
        {ping && <p className="mt-4 text-ink">Backend says: &ldquo;{ping.message}&rdquo; (userId: {ping.userId})</p>}
        {error && <p className="mt-4 text-danger">{error}</p>}
      </Card>
    </div>
  )
}
