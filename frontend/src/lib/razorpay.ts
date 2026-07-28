/**
 * Thin wrapper around Razorpay's Checkout.js.
 *
 * Mirrors googleIdentity.ts's lazy-load-once pattern: the script is loaded
 * from Razorpay's CDN the first time a checkout is actually opened, rather
 * than with a <script> tag in index.html, so it stays off the critical path
 * for the majority of visits that never touch payments.
 *
 * Unlike GIS, there's no server-side verification step needed here for the
 * frontend to react to — the backend's Razorpay webhook (paymentController.
 * razorpayWebhook) is the actual trust boundary that confirms a payment and
 * applies its effect (plan upgrade / unlock credit / boost). The `onSuccess`
 * handler below fires as soon as Checkout's own popup reports success,
 * strictly before that webhook has necessarily been processed — callers
 * must treat it as "payment submitted", not "payment applied".
 */

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

export interface RazorpayCheckoutResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  order_id: string
  name: string
  description?: string
  handler: (response: RazorpayCheckoutResponse) => void
  modal?: { ondismiss?: () => void }
  theme?: { color?: string }
}

export type RazorpayCheckoutConstructor = new (options: RazorpayOptions) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayCheckoutConstructor
  }
}

let loadPromise: Promise<RazorpayCheckoutConstructor> | null = null

/** Loads Checkout.js once and resolves with the `window.Razorpay` constructor. */
export function loadRazorpayCheckout(): Promise<RazorpayCheckoutConstructor> {
  if (loadPromise) return loadPromise

  loadPromise = new Promise<RazorpayCheckoutConstructor>((resolve, reject) => {
    if (window.Razorpay) {
      resolve(window.Razorpay)
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SRC}"]`)
    const script = existing ?? document.createElement('script')

    const onLoad = () => {
      if (window.Razorpay) {
        resolve(window.Razorpay)
      } else {
        loadPromise = null
        reject(new Error('Razorpay Checkout loaded but did not initialise'))
      }
    }
    const onError = () => {
      // Reset so a later retry (e.g. after the network comes back) can re-attempt.
      loadPromise = null
      reject(new Error('Could not load Razorpay Checkout'))
    }

    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)

    if (!existing) {
      script.src = RAZORPAY_SRC
      script.async = true
      document.head.appendChild(script)
    }
  })

  return loadPromise
}

export interface OpenRazorpayCheckoutOptions {
  keyId: string
  /**
   * Rupees, not paise — this is what every payments endpoint's
   * order-creation response returns (matches plans_master.price's
   * convention). Converted to integer paise below for Razorpay's own
   * `amount` option.
   */
  amount: number
  currency: string
  orderId: string
  name: string
  description: string
  onSuccess: (response: RazorpayCheckoutResponse) => void
  onDismiss?: () => void
}

/** Loads Checkout.js (if needed) and opens the payment popup. */
export async function openRazorpayCheckout(opts: OpenRazorpayCheckoutOptions): Promise<void> {
  const Razorpay = await loadRazorpayCheckout()

  const instance = new Razorpay({
    key: opts.keyId,
    amount: Math.round(opts.amount * 100),
    currency: opts.currency,
    order_id: opts.orderId,
    name: opts.name,
    description: opts.description,
    handler: opts.onSuccess,
    modal: opts.onDismiss ? { ondismiss: opts.onDismiss } : undefined,
    theme: { color: '#0A66C2' },
  })

  instance.open()
}
