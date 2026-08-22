import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { submitUpiPaymentReference, type CreateManualUpiOrderResponse } from '@/lib/paymentsApi'
import { APP_NAME } from '@/lib/config'

/**
 * Manual counterpart to usePaymentCheckout.ts's Razorpay flow — pay a
 * merchant UPI ID directly from your own UPI app, then submit the
 * transaction reference (UTR) for an admin to verify. No webhook, no
 * automatic confirmation: `submitted` just means "awaiting manual review",
 * same idea as usePaymentCheckout's `processing`/`timeout` states but
 * without the short poll, since there is nothing to poll for here.
 */

type Step = 'idle' | 'creating' | 'awaitingUtr' | 'submitting' | 'submitted' | 'error'

interface UpiManualPaymentProps {
  /** Merchant UPI ID, e.g. from useSiteSettings()'s `upi_id` key. */
  upiId: string
  amount: number
  /** Shown in the UPI app's payment note. */
  description: string
  /** Company/candidate-specific order creation — subscribeToPlanUpi / buyBoostUpi. */
  createOrder: () => Promise<CreateManualUpiOrderResponse>
  /** Fires once the UTR has been submitted and accepted. */
  onSubmitted?: () => void
}

export default function UpiManualPayment({ upiId, amount, description, createOrder, onSubmitted }: UpiManualPaymentProps) {
  const [step, setStep] = useState<Step>('idle')
  const [order, setOrder] = useState<CreateManualUpiOrderResponse | null>(null)
  const [utr, setUtr] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    setError(null)
    setStep('creating')
    try {
      const result = await createOrder()
      setOrder(result)
      setStep('awaitingUtr')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start UPI payment')
      setStep('error')
    }
  }

  const handleSubmitUtr = async () => {
    if (!order || !utr.trim()) return
    setError(null)
    setStep('submitting')
    try {
      await submitUpiPaymentReference(order.paymentId, utr.trim())
      setStep('submitted')
      onSubmitted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit payment reference')
      setStep('awaitingUtr')
    }
  }

  if (step === 'submitted') {
    return (
      <div className="mt-3 flex flex-col gap-1 rounded-card bg-boost/10 px-3 py-3 text-sm text-boost">
        <p className="font-medium">Submitted — awaiting verification.</p>
        <p className="text-xs text-boost/80">
          We&apos;ll apply this once an admin confirms your payment reference. Check your payment history for updates.
        </p>
      </div>
    )
  }

  if (step === 'awaitingUtr' && order) {
    const payLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(APP_NAME)}&am=${order.amount}&cu=${order.currency}&tn=${encodeURIComponent(description)}`
    return (
      <div className="mt-3 flex flex-col gap-3 rounded-card border border-line bg-surface px-3 py-3">
        <div>
          <p className="text-sm text-ink/70">
            Pay <span className="font-semibold text-ink">₹{order.amount.toLocaleString('en-IN')}</span> to this UPI
            ID from any UPI app, then enter the transaction reference (UTR) below.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-card px-2 py-1 text-sm font-semibold text-ink">{upiId}</code>
            <button
              type="button"
              className="text-xs font-semibold text-primary underline"
              onClick={() => navigator.clipboard?.writeText(upiId)}
            >
              Copy
            </button>
          </div>
          <a
            href={payLink}
            className="mt-2 inline-block text-sm font-semibold text-primary underline"
          >
            Open in a UPI app
          </a>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            label="UPI transaction reference (UTR)"
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            placeholder="e.g. 123456789012"
            className="max-w-xs"
          />
          <Button type="button" size="sm" loading={step === ('submitting' as Step)} disabled={!utr.trim()} onClick={handleSubmitUtr}>
            Submit
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-sm font-semibold text-primary underline disabled:opacity-50"
        disabled={step === 'creating'}
        onClick={handleStart}
      >
        {step === 'creating' ? 'Starting…' : `Pay via UPI instead (₹${amount.toLocaleString('en-IN')})`}
      </button>
      {step === 'error' && error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}
