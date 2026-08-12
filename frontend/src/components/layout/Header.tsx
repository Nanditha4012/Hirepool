import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { APP_NAME } from '@/lib/config'
import { useAuth } from '@/lib/authStore'
import { isAccountVerified } from '@/lib/verification'
import { homePathFor } from '@/lib/roleHome'
import Button from '@/components/ui/Button'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import NotificationBell from '@/components/layout/NotificationBell'
import ProfileMenu from '@/components/layout/ProfileMenu'
import SideNav from '@/components/layout/SideNav'
import NavIcon from './NavIcon'
import { icons, navItemsFor, type NavItem } from './navConfig'

/**
 * How many of the role's destinations the bar shows at each breakpoint before
 * the rest are left to the drawer.
 *
 * This used to be one number for every screen above 768px, which meant the
 * same four links were laid out identically on a 13" laptop and on a 27"
 * monitor — cramped on one, marooned in whitespace on the other. Below 1024px
 * the bar now carries two, and a wide desktop carries five, with the drawer
 * always holding the complete list regardless.
 *
 * Rendered as three overlapping lists with `hidden`/`flex` breakpoints rather
 * than measured in JS: a resize listener re-rendering the header on every
 * frame of a window drag is a lot of machinery for what CSS already answers,
 * and it flashes the wrong count on first paint.
 */
const NAV_LIMIT = { md: 2, lg: 4, xl: 5 } as const

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
  // Gated destinations drop out of this list entirely for an account that
  // hasn't passed verification — see navConfig.NavItem.gated.
  const allNavItems = user ? navItemsFor(user.role, isAccountVerified(user)) : []

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
        {/* A hairline of brand gradient along the very top. Costs nothing,
            and it is what stops a translucent bar over a white page from
            reading as "no header at all" on a large screen. */}
        <div
          className="h-0.5 w-full bg-gradient-to-r from-primary via-accent to-primary-light bg-[length:200%_100%] animate-gradient-pan"
          aria-hidden="true"
        />

        <div className="mx-auto flex max-w-app items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-10">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            {/* The drawer is the only route to everything the bars have no
                room for, so its handle is present on every viewport rather
                than being a mobile-only hamburger. */}
            {user && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                className="-ml-1 rounded-card p-2 text-ink/70 transition-colors hover:bg-surface hover:text-ink active:scale-95"
              >
                <NavIcon glyph={icons.menu} className="h-6 w-6" />
              </button>
            )}
            <Link
              to={homePath}
              className="group flex min-w-0 items-center"
              aria-label={`${APP_NAME} home`}
            >
              {/* Steps up with the viewport rather than staying at one size:
                  a 20px wordmark that looks right on a phone is lost on a
                  1600px bar. */}
              <Logo size="md" className="sm:hidden" />
              <Logo size="lg" className="hidden sm:inline-flex" />
            </Link>
          </div>

          {/* Desktop nav. Three lists, one per breakpoint band — see
              NAV_LIMIT. Exactly one is ever visible. */}
          {user ? (
            <>
              <DesktopNav items={allNavItems.slice(0, NAV_LIMIT.md)} className="hidden md:flex lg:hidden" />
              <DesktopNav items={allNavItems.slice(0, NAV_LIMIT.lg)} className="hidden lg:flex xl:hidden" />
              <DesktopNav items={allNavItems.slice(0, NAV_LIMIT.xl)} className="hidden xl:flex" />
            </>
          ) : (
            <nav className="hidden items-center gap-1 md:flex">
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
            </nav>
          )}

          <div className="flex flex-shrink-0 items-center gap-0.5 sm:gap-1">
            {user ? (
              <>
                {/* The desktop counterpart of the bottom bar's raised +.
                    Collapses to an icon-only circle between md and lg, where
                    the label is what would push the nav into wrapping. */}
                <Link to="/feed/new" className="hidden md:block">
                  <Button size="sm" className="shadow-lift" aria-label="Create a post">
                    <NavIcon glyph={icons.plus} className="h-4 w-4" />
                    <span className="hidden lg:inline">Post</span>
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

/**
 * One band of the responsive nav. Rendered up to three times with different
 * `items` and breakpoint classes; only one is visible at a time.
 *
 * The active pill is a sliding underline rather than a filled background:
 * with five links on a wide bar, five candidate background chips fight the
 * Post button for attention, whereas one moving rule under the current
 * destination reads as position.
 */
function DesktopNav({ items, className }: { items: NavItem[]; className: string }) {
  return (
    // flex-1 + justify-center: the nav takes the whole gap between the brand
    // and the actions and centres itself in it, instead of sitting as a small
    // cluster with dead space either side. That gap is most of a 1600px bar.
    <nav
      className={['min-w-0 flex-1 items-center justify-center gap-1', className].join(' ')}
      aria-label="Primary"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            [
              // Sized up from the old text-sm/px-3/py-2: on a wide bar the
              // links read as small print next to a 30px wordmark, which is
              // the wrong hierarchy for the app's primary navigation.
              'group relative inline-flex items-center gap-2 whitespace-nowrap rounded-card px-4 py-2.5 text-[15px] font-semibold transition-all lg:px-5 lg:text-base',
              isActive ? 'bg-primary/5 text-primary' : 'text-ink/70 hover:bg-surface hover:text-ink',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <NavIcon
                glyph={item.icon}
                className={[
                  'h-5 w-5 transition-transform duration-200',
                  isActive ? 'scale-110' : 'group-hover:scale-110',
                ].join(' ')}
              />
              {item.label}
              {/* scale-x rather than width so the rule grows from its centre
                  and animates without laying the row out again. */}
              <span
                aria-hidden="true"
                className={[
                  'absolute inset-x-4 bottom-1 h-0.5 rounded-full bg-primary transition-transform duration-300',
                  isActive ? 'scale-x-100' : 'scale-x-0',
                ].join(' ')}
              />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
