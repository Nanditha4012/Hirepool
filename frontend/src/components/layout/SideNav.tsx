import { useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Logo from '@/components/ui/Logo'
import { useAuth } from '@/lib/authStore'
import { useTheme } from '@/lib/themeStore'
import { displayNameFor } from '@/lib/displayName'
import { SUPPORT_EMAIL } from '@/lib/config'
import NavIcon from './NavIcon'
import { icons, navItemsFor } from './navConfig'

interface SideNavProps {
  open: boolean
  onClose: () => void
}

/**
 * The slide-out navigation drawer.
 *
 * Carries every destination the role has — the same list as the bottom bar,
 * plus the ones that bar has no room for — along with the theme setting and
 * the account block. It is the one place where "everything" is reachable, on
 * every viewport: the bottom bar is deliberately five slots, and the desktop
 * top bar only shows the primary three, so both need somewhere to send you
 * for the rest.
 */
export default function SideNav({ open, onClose }: SideNavProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  // Navigating must close the drawer, otherwise a tap loads the new page
  // behind a panel that stays open on top of it.
  useEffect(() => {
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Escape closes; the page behind must not scroll under the open panel.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!user) return null

  const name = displayNameFor(user)
  const items = navItemsFor(user.role)

  const handleLogout = async () => {
    onClose()
    await logout()
    navigate('/')
  }

  return (
    <>
      {/* Scrim. Rendered only when open so it can never swallow clicks. */}
      {open && (
        <div
          className="fixed inset-0 z-50 animate-fade-in bg-ink/40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* The panel itself stays mounted and slides, rather than being
          unmounted — a remounted panel would pop in with no transition. */}
      <aside
        aria-label="Main navigation"
        aria-hidden={!open}
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-[19rem] max-w-[85vw] flex-col border-r border-line bg-card shadow-lift',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          <Logo size="sm" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-card p-2 text-ink/60 transition-colors hover:bg-surface hover:text-ink"
          >
            <NavIcon glyph={icons.close} className="h-5 w-5" />
          </button>
        </div>

        {/* Account */}
        <Link
          to={items[0].to}
          className="flex items-center gap-3 border-b border-line px-4 py-4 transition-colors hover:bg-surface"
        >
          <Avatar name={name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-ink/50">{user.email}</p>
            <div className="mt-1">
              <Badge tone="neutral">
                <span className="capitalize">{user.role}</span>
              </Badge>
            </div>
          </div>
        </Link>

        {/* Destinations. Scrolls independently so the settings block below
            stays reachable on a short screen. */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-card px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-ink/70 hover:bg-surface hover:text-ink',
                ].join(' ')
              }
            >
              <NavIcon glyph={item.icon} className="h-5 w-5 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Settings */}
        <div className="border-t border-line px-4 py-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-ink/40">
            <NavIcon glyph={icons.settings} className="h-4 w-4" />
            Settings
          </p>

          <div className="mt-3">
            <p className="text-sm font-medium text-ink">Theme</p>
            {/* An explicit two-way choice rather than the header's single
                toggle: in a settings list, "which theme am I on" should be
                readable at a glance, not inferred from which icon is showing. */}
            <div className="mt-2 flex gap-1 rounded-card border border-line bg-surface p-1">
              {(['light', 'dark'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  aria-pressed={theme === option}
                  className={[
                    'flex-1 rounded-card px-3 py-1.5 text-sm font-semibold capitalize transition-colors',
                    theme === option ? 'bg-primary text-white shadow-soft' : 'text-ink/60 hover:text-ink',
                  ].join(' ')}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={handleLogout}>
            <NavIcon glyph={icons.logout} className="h-4 w-4" />
            Log out
          </Button>

          <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
            Need help?{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </aside>
    </>
  )
}
