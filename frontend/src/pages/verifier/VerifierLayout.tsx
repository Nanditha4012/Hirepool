import { NavLink, Outlet } from 'react-router-dom'

const navLinks = [
  { to: '/verify/queue', label: 'Catalogs' },
  { to: '/verify/profiles', label: 'Profile management' },
  { to: '/verify/badges', label: 'Badges' },
  { to: '/verify/achievements', label: 'Achievements' },
  { to: '/verify/analytics', label: 'Analytics' },
  { to: '/verify/account', label: 'My account' },
]

/**
 * Shared chrome for the verifier portal. Kept here rather than in the app
 * Header because the Header has no role-specific nav — every other role is a
 * single destination, while a reviewer moves between six.
 */
export default function VerifierLayout() {
  return (
    <div className="flex min-h-[60vh] flex-col bg-surface/40">
      <div className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-app flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-6 lg:px-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/40">
            Verification portal
          </p>
          {/* The signed-in name used to be repeated here, directly under the
              same name in the app header. Identity now lives in exactly one
              place: the header avatar and its hover card. */}
        </div>
        <nav className="mx-auto flex max-w-app gap-1 overflow-x-auto px-4 py-3 sm:px-6 lg:px-10">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              // No `end` prop: NavLink's default prefix matching is what we
              // want here, so "Profile management" stays highlighted while a
              // profile opened from it (/verify/profiles/:id) is on screen.
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-ink/60 hover:bg-surface hover:text-ink',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  )
}
