import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { APP_NAME } from '@/lib/config'
import { useAuth } from '@/lib/authStore'
import { homePathFor } from '@/lib/roleHome'
import Button from '@/components/ui/Button'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import NotificationBell from '@/components/layout/NotificationBell'
import ProfileMenu from '@/components/layout/ProfileMenu'
import SideNav from '@/components/layout/SideNav'
import NavIcon from './NavIcon'
import { icons, navItemsFor } from './navConfig'

/**
 * How many of the role's destinations the desktop bar shows before the rest
 * are left to the drawer. Home plus the two shared feeds plus the role's own
 * first destination is as much as fits without the bar wrapping.
 */
const DESKTOP_NAV_LIMIT = 4

export default function Header() {
  const { user } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  // The brand lockup goes to the landing page only when nobody is signed in.
  // It used to be a hard-coded `/` for everyone, so clicking it mid-session
  // threw the user out to the marketing page — their avatar still sitting in
  // the corner, but nothing else on screen belonging to them.
  const homePath = homePathFor(user?.role)
  const navItems = user ? navItemsFor(user.role).slice(0, DESKTOP_NAV_LIMIT) : []

  return (
    <>
      <header
        className={[
          'sticky top-0 z-40 transition-all duration-300',
          // bg-card, not bg-white: these were literal white, so in dark mode
          // the header stayed a bright bar glued to the top of every dark
          // page — and the dark `text-ink` on it was near-invisible. bg-card
          // resolves through the theme variables like the rest of the app.
          scrolled
            ? 'border-b border-line bg-card/85 shadow-soft backdrop-blur-md'
            : 'border-b border-transparent bg-card/60 backdrop-blur-sm',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-app items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-1">
            {/* The drawer is the only route to everything the bars have no
                room for, so its handle is present on every viewport rather
                than being a mobile-only hamburger. */}
            {user && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                className="-ml-1 rounded-card p-2 text-ink/70 transition-colors hover:bg-surface hover:text-ink"
              >
                <NavIcon glyph={icons.menu} className="h-6 w-6" />
              </button>
            )}
            <Link to={homePath} className="group flex items-center" aria-label={`${APP_NAME} home`}>
              <Logo size="md" />
            </Link>
          </div>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {user ? (
              navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    [
                      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-card px-3 py-1.5 text-sm font-semibold transition-colors',
                      isActive ? 'bg-primary/10 text-primary' : 'text-ink/70 hover:bg-surface hover:text-ink',
                    ].join(' ')
                  }
                >
                  <NavIcon glyph={item.icon} className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))
            ) : (
              <>
                <Link
                  to="/verifier/login"
                  className="rounded-card px-3 py-1.5 text-sm font-semibold text-ink/60 transition-colors hover:bg-surface hover:text-primary"
                >
                  Verifier login
                </Link>
                {/* Dev convenience — dropped from the production bundle, same
                    gate as the credential hints on the login pages. */}
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
          </nav>

          <div className="flex items-center gap-1">
            {user ? (
              <>
                {/* The desktop counterpart of the bottom bar's raised +. */}
                <Link to="/feed/new" className="hidden md:block">
                  <Button size="sm" className="shadow-lift">
                    <NavIcon glyph={icons.plus} className="h-4 w-4" />
                    Post
                  </Button>
                </Link>
                <NotificationBell />
                <ThemeToggle />
                {/* Identity is the avatar: name, email, role and the
                    role-specific basics all live in its hover card. On touch
                    the drawer's account block covers the same ground, so this
                    is desktop-only. */}
                <div className="hidden md:block">
                  <ProfileMenu />
                </div>
              </>
            ) : (
              <>
                <ThemeToggle />
                <Link to="/login" className="md:hidden">
                  <Button size="sm">Login</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Rendered outside <header> so the sticky header's stacking context
          can't trap the drawer's scrim underneath the page it must cover. */}
      <SideNav open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
