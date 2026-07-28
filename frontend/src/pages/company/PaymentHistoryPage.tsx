import { Link } from 'react-router-dom'
import PaymentHistoryList from '@/components/payments/PaymentHistoryList'
import { listCompanyPaymentHistory } from '@/lib/paymentsApi'

export default function PaymentHistoryPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Payment history</h1>
          <p className="mt-1 text-ink/60">Plan subscriptions and unlock top-ups on your account.</p>
        </div>
        <Link to="/company" className="text-sm font-semibold text-primary">
          Back to dashboard
        </Link>
      </div>

      <div className="mt-6">
        <PaymentHistoryList fetchHistory={listCompanyPaymentHistory} />
      </div>
    </div>
  )
}
