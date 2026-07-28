import { useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { buyBoost, listCandidatePaymentHistory } from '@/lib/paymentsApi'
import { usePaymentCheckout } from '@/lib/usePaymentCheckout'
import { getSiteSetting, type SiteSettingsMap } from '@/lib/siteSettings'

const DAY_PRESETS = [3, 7, 14]

interface BoostPurchaseCardProps {
  /** Both undefined until the backend's own-profile response includes them — see the
   * comment on CandidateProfileResponse.isBoosted in candidateApi.ts. */
  isBoosted?: boolean
  boostExpiresAt?: string | null
  siteSettings: SiteSettingsMap
}

export default function BoostPurchaseCard({ isBoosted, boostExpiresAt, siteSettings }: BoostPurchaseCardProps) {
  const [days, setDays] = useState(7)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  const pricePerDay = Number(getSiteSetting(siteSettings, 'boost_price_per_day', '49'))
  const estimatedPrice = days * (Number.isFinite(pricePerDay) ? pricePerDay : 49)

  const { status, error, start, reset } = usePaymentCheckout({
    pollHistory: listCandidatePaymentHistory,
    description: `${days}-day profile boost`,
  })

  const handlePurchase = async () => {
    setPurchaseError(null)
    setPurchasing(true)
    try {
      const order = await buyBoost(days)
      await start(order)
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : 'Failed to start checkout')
    } finally {
      setPurchasing(false)
    }
  }

  // Currently-boosted state — only renders once the backend response
  // actually includes these fields (see the gap noted on the type above).
  if (isBoosted && boostExpiresAt) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">Boost my profile</h2>
          <Badge tone="boost">Boosted</Badge>
        </div>
        <p className="mt-2 text-sm text-ink/60">
          Your profile is boosted until {new Date(boostExpiresAt).toLocaleDateString()}.
        </p>
        <p className="mt-3 text-xs text-ink/40">
          Buying more days below extends this — it stacks on top rather than resetting.
        </p>
        <BoostForm
          days={days}
          setDays={setDays}
          estimatedPrice={estimatedPrice}
          purchasing={purchasing}
          status={status}
          error={error || purchaseError}
          onPurchase={handlePurchase}
          onReset={reset}
        />
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">Boost my profile</h2>
      <p className="mt-1 text-sm text-ink/60">Get more visibility with companies.</p>
      <BoostForm
        days={days}
        setDays={setDays}
        estimatedPrice={estimatedPrice}
        purchasing={purchasing}
        status={status}
        error={error || purchaseError}
        onPurchase={handlePurchase}
        onReset={reset}
      />
    </Card>
  )
}

interface BoostFormProps {
  days: number
  setDays: (days: number) => void
  estimatedPrice: number
  purchasing: boolean
  status: ReturnType<typeof usePaymentCheckout>['status']
  error: string | null
  onPurchase: () => void
  onReset: () => void
}

function BoostForm({ days, setDays, estimatedPrice, purchasing, status, error, onPurchase, onReset }: BoostFormProps) {
  if (status === 'processing') {
    return (
      <div className="mt-4 rounded-card bg-boost/10 px-3 py-3 text-sm text-boost">
        Payment received — confirming and applying your boost. This usually takes a few seconds.
      </div>
    )
  }

  if (status === 'confirmed') {
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-card bg-verified/10 px-3 py-3 text-sm text-verified">
        <p>Boost confirmed — your profile is now boosted.</p>
        <button type="button" className="self-start underline" onClick={onReset}>
          Buy more days
        </button>
      </div>
    )
  }

  if (status === 'timeout') {
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-card bg-surface px-3 py-3 text-sm text-ink/70">
        <p>
          Still confirming your payment — this can take a little longer than usual. It&apos;ll apply
          automatically once done.
        </p>
        <Link to="/candidate/payments" className="self-start text-sm font-semibold text-primary underline">
          Check payment history
        </Link>
        <button type="button" className="self-start text-xs text-ink/50 underline" onClick={onReset}>
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {DAY_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setDays(preset)}
            className={[
              'rounded-full px-3 py-1 text-sm font-semibold transition-colors',
              days === preset ? 'bg-boost text-white' : 'bg-surface text-ink/70 hover:bg-boost/10 hover:text-boost',
            ].join(' ')}
          >
            {preset} days
          </button>
        ))}
      </div>
      <Input
        type="number"
        min={1}
        max={30}
        value={days}
        onChange={(e) => setDays(Math.min(Math.max(Number(e.target.value) || 1, 1), 30))}
        label="Or enter a custom number of days"
        className="max-w-[10rem]"
      />
      <p className="text-sm text-ink/60">
        Estimated cost: <span className="font-semibold text-ink">₹{estimatedPrice.toLocaleString('en-IN')}</span>
      </p>
      <Button type="button" loading={purchasing || status === 'opening'} onClick={onPurchase} className="self-start">
        Boost my profile
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
