import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { SUPPORT_EMAIL } from '@/lib/config'
import { useAuth, type AuthUser, type Role } from '@/lib/authStore'
import { roleHome } from '@/lib/roleHome'
import { displayNameFor } from '@/lib/displayName'

const roleLabel: Record<Role, string> = {
  candidate: 'Candidate',
  company: 'Company',
  verifier: 'Verifier',
  admin: 'Admin',
}

/**
 * Pulls the two or three facts worth showing on hover out of the role-shaped
 * `profile` blob. `profile` is typed as an open record (it's whatever the
 * candidate/company profile endpoint returned), so each read is guarded
 * rather than trusted.
 */
function profileFacts(user: AuthUser): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = []
  const profile = user.profile as Record<string, unknown> | null

  if (user.role === 'candidate' && profile) {
    if (typeof profile.category === 'string') {
      facts.push({ label: 'Track', value: profile.category })
    }
    if (typeof profile.status === 'string') {
      facts.push({ label: 'Status', value: profile.status.replace(/_/g, ' ') })
    }
  }

  if (user.role === 'company' && profile) {
    if (typeof profile.companyName === 'string' && !profile.companyName.includes('@')) {
      facts.push({ label: 'Company', value: profile.companyName })
    }
    facts.push({ label: 'Verification', value: profile.verified ? 'Verified' : 'Pending' })
  }

  return facts
}

/**
 * Avatar-only account control for the header.
 *
 * Replaces what used to be the name printed as plain text in the header *and*
 * again in the verifier/admin portal bars — the same identity stated two or
 * three times on one screen. Now the identity is the avatar; everything else
 * (full name, email, role, and the role-specific basics) lives in a card that
 * appears on hover.
 *
 * Opens on hover for pointer users and on click/Enter for everyone else,
 * because hover isn't reachable by keyboard or touch. The close-on-leave is
 * delayed slightly so the diagonal cursor path from the avatar down into the
 * card doesn't dismiss the thing you're travelling towards.
 */
export default function ProfileMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 180)
  }

  useEffect(() => cancelClose, [])

  // A tap outside is the only way to dismiss this on touch, where there is no
  // "mouse leave" to rely on.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user) return null

  const name = displayNameFor(user)
  const home = roleHome[user.role]
  const facts = profileFacts(user)

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/')
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose()
        setOpen(true)
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((prev) => !prev)}
        onFocus={() => setOpen(true)}
        className="rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Avatar name={name} size="md" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Account details"
          className="absolute right-0 top-full z-50 mt-2 w-72 animate-scale-in rounded-card border border-line bg-card p-4 shadow-lift"
        >
          <div className="flex items-center gap-3">
            <Avatar name={name} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{name}</p>
              <p className="truncate text-xs text-ink/50">{user.email}</p>
              <div className="mt-1.5">
                <Badge tone="neutral">{roleLabel[user.role]}</Badge>
              </div>
            </div>
          </div>

          {facts.length > 0 && (
            <dl className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3">
              {facts.map((fact) => (
                <div key={fact.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-ink/50">{fact.label}</dt>
                  <dd className="truncate text-xs font-semibold capitalize text-ink">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
            <Link
              to={home.to}
              onClick={() => setOpen(false)}
              className="rounded-card px-2 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
            >
              {home.label}
            </Link>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
            Need help urgently?{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
