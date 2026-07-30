import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/authStore'

/**
 * Icons are inline SVG in the same stroke style as the existing header/menu
 * glyphs (24×24, `stroke="currentColor"`, strokeWidth 2) rather than an icon
 * package, so this matches what's already in the app without adding a
 * dependency.
 */
const icons: Record<string, JSX.Element> = {
  profile: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  ),
  // Trophy — the contest module's mark, used here and on the hub cards.
  trophy: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 4h8v5a4 4 0 11-8 0V4zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4m-3 3h6"
    />
  ),
  leaderboard: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 20V10m7 10V4m7 16v-6"
    />
  ),
  payments: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z"
    />
  ),
}

const items = [
  { to: '/candidate', label: 'Profile', icon: 'profile', end: true },
  { to: '/contests', label: 'Contests', icon: 'trophy', end: false },
  { to: '/contests/leaderboard', label: 'Ranks', icon: 'leaderboard', end: false },
  { to: '/candidate/payments', label: 'Payments', icon: 'payments', end: true },
]

/**
 * Mobile-only bottom navigation for candidates.
 *
 * Only candidates get it (companies/verifiers/admins each have their own
 * single-destination or pill-nav chrome), and it is hidden on md+ where the
 * header nav already carries the same links.
 *
 * Deliberately absent inside a running test: the test-taking screen is
 * full-screen and distraction-free by design, so this checks the pathname and
 * removes itself rather than floating a nav bar over a timed exam.
 */
export default function CandidateBottomNav() {
  const { user } = useAuth()
  const location = useLocation()

  if (user?.role !== 'candidate') return null
  if (/^\/contests\/attempt\//.test(location.pathname)) return null

  return (
    <>
      {/* Spacer so the last of a page's content can still be scrolled clear of
          the fixed bar, instead of sitting permanently underneath it. */}
      <div className="h-16 md:hidden" aria-hidden="true" />

      <nav
        aria-label="Candidate navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur-md md:hidden"
        // Keeps the bar clear of the iOS home indicator.
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {items.map((item) => (
            <NavLink
              key={item.to}
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
                  <svg
                    className={['h-6 w-6 transition-transform', isActive ? 'scale-110' : ''].join(' ')}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    {icons[item.icon]}
                  </svg>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
