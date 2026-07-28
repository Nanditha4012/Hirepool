import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { APP_NAME } from '@/lib/config'
import { useAuth, type Role } from '@/lib/authStore'
import Button from '@/components/ui/Button'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import NotificationBell from '@/components/layout/NotificationBell'

/** Where each signed-in role's "home" link points, and what to call it. */
const roleHome: Record<Role, { to: string; label: string }> = {
  candidate: { to: '/candidate', label: 'My profile' },
  company: { to: '/company', label: 'Dashboard' },
  verifier: { to: '/verify/queue', label: 'Review queue' },
  admin: { to: '/admin', label: 'Admin' },
}

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // The header is transparent-ish at the top of the landing hero and gains a
  // solid background + shadow once the page scrolls, so it stays readable
  // over the hero photo without permanently sitting on a hard white bar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Route changes must close the mobile menu — otherwise tapping a link
  // navigates behind a menu that stays open covering the new page.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    setMenuOpen(false)
    navigate('/')
  }

  const home = user ? roleHome[user.role] : null

  return (
    <header
      className={[
        'sticky top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-line bg-white/85 shadow-soft backdrop-blur-md'
          : 'border-b border-transparent bg-white/60 backdrop-blur-sm',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="group flex items-center" aria-label={`${APP_NAME} home`}>
          <Logo size="md" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-2 md:flex">
          {user && home ? (
            <>
              <NavLink
                to={home.to}
                className={({ isActive }) =>
                  [
                    'rounded-card px-3 py-1.5 text-sm font-semibold transition-colors',
                    isActive ? 'bg-primary/10 text-primary' : 'text-ink/70 hover:bg-surface hover:text-ink',
                  ].join(' ')
                }
              >
                {home.label}
              </NavLink>
              <span className="ml-2 hidden text-sm text-ink/50 lg:inline">
                {user.fullName || user.username || user.email}
              </span>
              <NotificationBell />
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link
                to="/verifier/login"
                className="rounded-card px-3 py-1.5 text-sm font-semibold text-ink/60 transition-colors hover:bg-surface hover:text-primary"
              >
                Verifier login
              </Link>
              {/* Dev convenience — dropped from the production bundle, same
                  gate as the credential hints on the login pages. Temporary
                  until there's a real internal-tools nav. */}
              {import.meta.env.DEV && (
                <Link
                  to="/admin/login"
                  className="rounded-card px-3 py-1.5 text-sm font-semibold text-ink/60 transition-colors hover:bg-surface hover:text-primary"
                >
                  Admin login
                </Link>
              )}
              <Link
                to="/login"
                className="rounded-card px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface hover:text-primary"
              >
                Login
              </Link>
              <Link to="/signup">
                <Button size="sm" className="shadow-lift">
                  Get started
                </Button>
              </Link>
            </>
          )}
          <ThemeToggle className="ml-1" />
        </nav>

        {/* Mobile: the theme switch stays outside the collapsed menu, so it
            is reachable in one tap rather than two. */}
        <div className="flex items-center gap-1 md:hidden">
          {user && <NotificationBell />}
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-card p-2 text-ink transition-colors hover:bg-surface"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="animate-fade-in border-t border-line bg-card px-4 pb-4 md:hidden">
          {user && home ? (
            <div className="flex flex-col gap-3 pt-3">
              <span className="text-sm text-ink/70">
                Signed in as <span className="font-semibold text-ink">{user.fullName || user.username || user.email}</span>
              </span>
              <Link to={home.to} className="text-sm font-semibold text-primary">
                {home.label}
              </Link>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Log out
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pt-3">
              <Link to="/login" className="text-sm font-medium text-ink hover:text-primary">
                Login
              </Link>
              <Link to="/verifier/login" className="text-sm font-medium text-ink/60 hover:text-primary">
                Verifier login
              </Link>
              {import.meta.env.DEV && (
                <Link to="/admin/login" className="text-sm font-medium text-ink/60 hover:text-primary">
                  Admin login
                </Link>
              )}
              <Link to="/signup">
                <Button size="sm" className="w-full">
                  Get started
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
