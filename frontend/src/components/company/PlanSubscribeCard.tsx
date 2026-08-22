import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import UpiManualPayment from '@/components/payments/UpiManualPayment'
import { subscribeToPlan, subscribeToPlanUpi, listCompanyPaymentHistory } from '@/lib/paymentsApi'
import { usePaymentCheckout } from '@/lib/usePaymentCheckout'
import { listPlanCatalog, type CompanyPlan, type PlanCatalogEntry } from '@/lib/companyApi'
import { getSiteSetting, type SiteSettingsMap } from '@/lib/siteSettings'

interface PlanSubscribeCardProps {
  plan: CompanyPlan | null
  siteSettings: SiteSettingsMap
}

/**
 * Subscribe to (or switch to, or renew) an active plan. Backed by the public
 * GET /masters/plans catalog added alongside Phase 6 — before that endpoint
 * existed, this card could only re-charge the company's *current* plan since
 * there was no way to see what else was available.
 *
 * Razorpay stays the default; `razorpay_enabled` (site setting, defaults to
 * "true" when unset) lets an admin hide it and fall back to UPI-only
 * without touching any code — see UpiManualPayment.tsx.
 */
export default function PlanSubscribeCard({ plan, siteSettings }: PlanSubscribeCardProps) {
  const razorpayEnabled = getSiteSetting(siteSettings, 'razorpay_enabled', 'true') !== 'false'
  const upiId = getSiteSetting(siteSettings, 'upi_id', '')
  const [catalog, setCatalog] = useState<PlanCatalogEntry[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState('')

  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  useEffect(() => {
    listPlanCatalog()
      .then((plans) => {
        setCatalog(plans)
        setSelectedPlanId((current) => current || plan?.id || plans[0]?.id || '')
      })
      .catch((err) => setCatalogError(err instanceof Error ? err.message : 'Failed to load plans'))
      .finally(() => setLoadingCatalog(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedPlan = catalog.find((p) => p.id === selectedPlanId) ?? null

  const { status, error, start, reset } = usePaymentCheckout({
    pollHistory: listCompanyPaymentHistory,
    description: selectedPlan ? `${selectedPlan.name} plan subscription` : 'Plan subscription',
  })

  const handleSubscribe = async () => {
    if (!selectedPlanId) return
    setSubscribeError(null)
    setSubscribing(true)
    try {
      const order = await subscribeToPlan(selectedPlanId)
      await start(order)
    } catch (err) {
      setSubscribeError(err instanceof Error ? err.message : 'Failed to start checkout')
    } finally {
      setSubscribing(false)
    }
  }

  if (status === 'processing') {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-ink">Plan</h2>
        <div className="mt-4 rounded-card bg-boost/10 px-3 py-3 text-sm text-boost">
          Payment received — confirming and applying your plan. This usually takes a few seconds.
        </div>
      </Card>
    )
  }

  if (status === 'confirmed') {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-ink">Plan</h2>
        <div className="mt-4 flex flex-col gap-2 rounded-card bg-verified/10 px-3 py-3 text-sm text-verified">
          <p>Confirmed — your plan is now active for another period.</p>
          <button type="button" className="self-start underline" onClick={reset}>
            Back
          </button>
        </div>
      </Card>
    )
  }

  if (status === 'timeout') {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-ink">Plan</h2>
        <div className="mt-4 flex flex-col gap-2 rounded-card bg-surface px-3 py-3 text-sm text-ink/70">
          <p>Still confirming — this can take a little longer than usual. It&apos;ll apply automatically once done.</p>
          <Link to="/company/payments" className="self-start text-sm font-semibold text-primary underline">
            Check payment history
          </Link>
          <button type="button" className="self-start text-xs text-ink/50 underline" onClick={reset}>
            Dismiss
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">Plan</h2>
      {plan && (
        <p className="mt-1 text-sm text-ink/60">
          Currently on <span className="font-semibold text-ink">{plan.name}</span> —{' '}
          {plan.monthlyUnlocks} unlocks/month, {plan.monthlyMessageCap === null ? 'unlimited' : plan.monthlyMessageCap}{' '}
          new conversations/month.
        </p>
      )}
      {!plan && <p className="mt-1 text-sm text-ink/60">You&apos;re not on a plan yet.</p>}

      {catalogError && <p className="mt-2 text-sm text-danger">{catalogError}</p>}

      {!loadingCatalog && catalog.length > 0 && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select
            label="Choose a plan"
            options={catalog.map((p) => ({
              value: p.id,
              label: `${p.name} — ₹${p.price}/mo (${p.monthlyUnlocks} unlocks)`,
            }))}
            value={selectedPlanId}
            onChange={(e) => setSelectedPlanId(e.target.value)}
          />
          {razorpayEnabled && (
            <Button
              type="button"
              loading={subscribing || status === 'opening'}
              disabled={!selectedPlanId}
              onClick={handleSubscribe}
            >
              {selectedPlanId === plan?.id ? 'Renew' : 'Switch plan'}
            </Button>
          )}
        </div>
      )}

      {!loadingCatalog && selectedPlanId && upiId && (
        <UpiManualPayment
          upiId={upiId}
          amount={selectedPlan ? Number(selectedPlan.price) : 0}
          description={selectedPlan ? `${selectedPlan.name} plan subscription` : 'Plan subscription'}
          createOrder={() => subscribeToPlanUpi(selectedPlanId)}
        />
      )}

      {(error || subscribeError) && <p className="mt-2 text-sm text-danger">{error || subscribeError}</p>}
    </Card>
  )
}
