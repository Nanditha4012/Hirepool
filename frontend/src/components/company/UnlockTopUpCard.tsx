import { useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { buyUnlockTopup, listCompanyPaymentHistory } from '@/lib/paymentsApi'
import { usePaymentCheckout } from '@/lib/usePaymentCheckout'
import { getSiteSetting, type SiteSettingsMap } from '@/lib/siteSettings'

interface UnlockTopUpCardProps {
  siteSettings: SiteSettingsMap
}

export default function UnlockTopUpCard({ siteSettings }: UnlockTopUpCardProps) {
  const [quantity, setQuantity] = useState(5)
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  const pricePerUnlock = Number(getSiteSetting(siteSettings, 'price_per_unlock', '20'))
  const estimatedPrice = quantity * (Number.isFinite(pricePerUnlock) ? pricePerUnlock : 20)

  const { status, error, start, reset } = usePaymentCheckout({
    pollHistory: listCompanyPaymentHistory,
    description: `${quantity} unlock credit${quantity === 1 ? '' : 's'}`,
  })

  const handlePurchase = async () => {
    setPurchaseError(null)
    setPurchasing(true)
    try {
      const order = await buyUnlockTopup(quantity)
      await start(order)
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : 'Failed to start checkout')
    } finally {
      setPurchasing(false)
    }
  }

  if (status === 'processing') {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-ink">Buy more unlocks</h2>
        <div className="mt-4 rounded-card bg-boost/10 px-3 py-3 text-sm text-boost">
          Payment received — confirming and adding your unlock credits. This usually takes a few seconds.
        </div>
      </Card>
    )
  }

  if (status === 'confirmed') {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-ink">Buy more unlocks</h2>
        <div className="mt-4 flex flex-col gap-2 rounded-card bg-verified/10 px-3 py-3 text-sm text-verified">
          <p>Confirmed — your unlock credits have been added.</p>
          <button type="button" className="self-start underline" onClick={reset}>
            Buy more
          </button>
        </div>
      </Card>
    )
  }

  if (status === 'timeout') {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-ink">Buy more unlocks</h2>
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
      <h2 className="text-lg font-semibold text-ink">Buy more unlocks</h2>
      <p className="mt-1 text-sm text-ink/60">Top up your unlock balance any time — credits never expire.</p>
      <div className="mt-4 flex flex-col gap-3">
        <Input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(Number(e.target.value) || 1, 1))}
          label="Number of unlocks"
          className="max-w-[10rem]"
        />
        <p className="text-sm text-ink/60">
          Estimated cost: <span className="font-semibold text-ink">₹{estimatedPrice.toLocaleString('en-IN')}</span>
        </p>
        <Button type="button" loading={purchasing || status === 'opening'} onClick={handlePurchase} className="self-start">
          Buy unlocks
        </Button>
        {(error || purchaseError) && <p className="text-sm text-danger">{error || purchaseError}</p>}
      </div>
    </Card>
  )
}
