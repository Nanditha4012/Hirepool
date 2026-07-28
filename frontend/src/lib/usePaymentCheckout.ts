import { useCallback, useState } from 'react'
import { openRazorpayCheckout } from './razorpay'
import { APP_NAME } from './config'
import type { CreateOrderResponse, PaymentHistoryResponse } from './paymentsApi'

/**
 * `idle` → `opening` (Checkout popup requested) → either `dismissed` (user
 * closed it without paying) or `processing` (Checkout's own success
 * callback fired) → `confirmed` (a short poll of payment history found the
 * matching order as `status: 'paid'`) or `timeout` (poll gave up — the
 * webhook may still land shortly, just not within our short window) or
 * `error` (checkout failed to open, or the order was marked `failed`).
 */
export type CheckoutStatus = 'idle' | 'opening' | 'processing' | 'confirmed' | 'timeout' | 'error' | 'dismissed'

const POLL_ATTEMPTS = 5
const POLL_INTERVAL_MS = 2000

interface UsePaymentCheckoutOptions {
  /** Same shape as paymentsApi's listCompanyPaymentHistory/listCandidatePaymentHistory. */
  pollHistory: (params: { page: number; limit: number }) => Promise<PaymentHistoryResponse>
  /** Shown in the Razorpay Checkout modal's description line. */
  description: string
}

/**
 * Drives a single Razorpay checkout from a freshly-created order through to
 * a best-effort confirmation.
 *
 * Important: Checkout's own success callback only means the popup collected
 * a payment method and Razorpay accepted it client-side — the actual
 * confirmation (and the purchase's effect: plan upgrade / unlock credit /
 * boost) happens asynchronously via the backend's Razorpay webhook. This
 * hook never applies that effect itself; it just polls the read-only
 * history endpoint briefly to flip the UI from "processing" to "confirmed"
 * once the webhook has (probably) landed, and gives up gracefully with a
 * "check back shortly" state if it hasn't within ~10s.
 */
export function usePaymentCheckout({ pollHistory, description }: UsePaymentCheckoutOptions) {
  const [status, setStatus] = useState<CheckoutStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const pollForConfirmation = useCallback(
    async (razorpayOrderId: string) => {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        try {
          const result = await pollHistory({ page: 1, limit: 5 })
          const match = result.results.find((row) => row.razorpayOrderId === razorpayOrderId)
          if (match?.status === 'paid') {
            setStatus('confirmed')
            return
          }
          if (match?.status === 'failed') {
            setError('Payment failed. Please try again.')
            setStatus('error')
            return
          }
        } catch {
          // Transient network error while polling — keep trying, the poll
          // itself is best-effort and not the source of truth.
        }
      }
      setStatus('timeout')
    },
    [pollHistory],
  )

  const start = useCallback(
    async (order: CreateOrderResponse) => {
      setError(null)
      setStatus('opening')
      try {
        await openRazorpayCheckout({
          keyId: order.razorpayKeyId,
          amount: order.amount,
          currency: order.currency,
          orderId: order.razorpayOrderId,
          name: APP_NAME,
          description,
          onSuccess: () => {
            setStatus('processing')
            void pollForConfirmation(order.razorpayOrderId)
          },
          onDismiss: () => {
            setStatus((prev) => (prev === 'opening' ? 'dismissed' : prev))
          },
        })
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Could not open checkout')
      }
    },
    [description, pollForConfirmation],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  return { status, error, start, reset }
}
