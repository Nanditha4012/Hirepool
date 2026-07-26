import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, Role } from '@/lib/authStore'

interface ProtectedRouteProps {
  allow: Role[]
  children: React.ReactNode
}

export default function ProtectedRoute({ allow, children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-ink/60">Loading…</p>
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

  return <>{children}</>
}
