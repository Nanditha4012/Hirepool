import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authStore'
import NavIcon from './NavIcon'
import { bottomNavItemsFor, icons, type NavItem } from './navConfig'

/** What the raised + button offers. */
const composeOptions = [
  {
    to: '/feed/new?kind=walkin',
    icon: '📍',
    title: 'Post a walk-in drive',
    hint: 'Date, venue, role and who to contact',
  },
  {
    to: '/feed/new?kind=job',
    icon: '💼',
    title: 'Post to the Job Book',
    hint: 'An opening with a link or contact to apply',
  },
  {
    to: '/feed/new?kind=community',
    icon: '💬',
    title: 'Post in a community',
    hint: 'A question, an experience or a meme',
  },
]

function BottomTab({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        [
          'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors',
          isActive ? 'text-primary' : 'text-ink/50 hover:text-ink',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <NavIcon
            glyph={item.icon}
            className={['h-6 w-6 transition-transform', isActive ? 'scale-110' : ''].join(' ')}
          />
          <span className="max-w-full truncate">{item.short ?? item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/**
 * Mobile bottom navigation: Home, the job feeds, a raised compose button,
 * Community, and Contests (or candidate search, for a company).
 *
 * Only candidates and companies get it. Verifiers and admins work inside
 * their own portals, which already carry a pill nav of their own — a second,
 * differently-shaped nav bar pinned under it would be two navigations
 * competing on one screen.
 *
 * Deliberately absent inside a running test: that screen is full-screen and
 * distraction-free by design, so this checks the pathname and removes itself
 * rather than floating a nav bar over a timed exam.
 */
export default function BottomNav() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [composeOpen, setComposeOpen] = useState(false)

  // A route change means the sheet's job is done.
  useEffect(() => {
    setComposeOpen(false)
  }, [location.pathname])

  const isTestRunner = /^\/contests\/attempt\//.test(location.pathname)
  const role = user?.role === 'candidate' || user?.role === 'company' ? user.role : null

  // Hooks above this line so the early return can't change hook order
  // between renders.
  if (!role || isTestRunner) return null

  const [left, right] = bottomNavItemsFor(role)

  return (
    <>
      {/* Spacer so the last of a page's content can be scrolled clear of the
          fixed bar instead of sitting permanently underneath it. */}
      <div className="h-20 md:hidden" aria-hidden="true" />

      {composeOpen && (
        <>
          <div
            className="fixed inset-0 z-40 animate-fade-in bg-ink/40 backdrop-blur-sm md:hidden"
            onClick={() => setComposeOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="What would you like to post?"
            className="fixed inset-x-3 bottom-24 z-50 animate-scale-in rounded-card border border-line bg-card p-2 shadow-lift md:hidden"
          >
            {composeOptions.map((option) => (
              <button
                key={option.to}
                type="button"
                onClick={() => {
                  setComposeOpen(false)
                  navigate(option.to)
                }}
                className="flex w-full items-center gap-3 rounded-card px-3 py-3 text-left transition-colors hover:bg-surface"
              >
                <span className="text-xl" aria-hidden="true">
                  {option.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{option.title}</span>
                  <span className="block text-xs text-ink/50">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur-md md:hidden"
        // Keeps the bar clear of the iOS home indicator.
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {left.map((item) => (
            <BottomTab key={item.to} item={item} />
          ))}

          {/* The compose button sits in the middle slot but is lifted out of
              the bar, so it reads as the primary action rather than a fifth
              tab. The slot below it keeps its width, which is what stops the
              four real tabs from shuffling sideways. */}
          <div className="relative flex w-16 flex-shrink-0 justify-center">
            <button
              type="button"
              onClick={() => setComposeOpen((prev) => !prev)}
              aria-label="Create a post"
              aria-expanded={composeOpen}
              className={[
                'absolute -top-5 inline-flex h-14 w-14 items-center justify-center rounded-full',
                'bg-primary text-white shadow-lift transition-transform duration-200 active:scale-95',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                composeOpen ? 'rotate-45' : '',
              ].join(' ')}
            >
              <NavIcon glyph={icons.plus} className="h-7 w-7" />
            </button>
          </div>

          {right.map((item) => (
            <BottomTab key={item.to} item={item} />
          ))}
        </div>
      </nav>
    </>
  )
}
