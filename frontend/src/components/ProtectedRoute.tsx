import React from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth, Role } from '@/lib/authStore'
import { isAccountVerified, lockNoticeFor } from '@/lib/verification'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import PageLoader from '@/components/ui/PageLoader'

interface ProtectedRouteProps {
  allow: Role[]
  /**
   * Also require that the account has passed verification.
   *
   * Set on every surface that is "the product" rather than "your own account":
   * the shared boards, communities, contests, candidate search, unlocks and
   * messaging. Leave it off for the account's own submission, its editor and
   * its billing trail — those are precisely what a pending or rejected account
   * still needs to reach.
   *
   * This mirrors requireVerified on the server. The server is the enforcement;
   * this is what stops the user being walked into a wall of failed requests.
   */
  requireVerified?: boolean
  children: React.ReactNode
}

export default function ProtectedRoute({
  allow,
  requireVerified = false,
  children,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <PageLoader label="Loading…" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!allow.includes(user.role)) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-2 px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-ink">403 — Not authorized</h1>
        <p className="text-ink/60">
          Your account role (<span className="font-semibold">{user.role}</span>) doesn&apos;t have access to this page.
        </p>
      </div>
    )
  }

  if (requireVerified && !isAccountVerified(user)) {
    return <VerificationLocked />
  }

  return <>{children}</>
}

/**
 * What a pending or rejected account sees if it reaches a gated URL directly.
 *
 * An explanation rather than a silent redirect: the nav already hides these
 * destinations, so anyone landing here typed the address, followed an old
 * link or bookmarked the page — and being bounced somewhere else with no
 * reason given reads as the app being broken. This says which state the
 * account is in and puts the one screen they *can* use a click away.
 */
function VerificationLocked() {
  const { user } = useAuth()
  const notice = lockNoticeFor(user)
  if (!notice) return null

  const accent = notice.tone === 'danger' ? 'danger' : 'boost'

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <Card className="animate-scale-in text-center">
        <span
          className={[
            'mx-auto flex h-16 w-16 items-center justify-center rounded-full',
            accent === 'danger' ? 'bg-danger/10 text-danger' : 'bg-boost/10 text-boost',
          ].join(' ')}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
            <path
              d="M7 11V8a5 5 0 019.9-1M5 11h14v10H5zM12 15v3"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h1 className="mt-5 text-xl font-bold text-ink">{notice.title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">{notice.body}</p>

        <Link to={notice.homePath} className="mt-6 inline-block">
          <Button>{notice.homeLabel}</Button>
        </Link>
      </Card>
    </div>
  )
}
