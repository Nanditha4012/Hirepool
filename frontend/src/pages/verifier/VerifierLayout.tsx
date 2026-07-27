import { NavLink, Outlet } from 'react-router-dom'

const navLinks = [
  { to: '/verify/queue', label: 'Queue' },
  { to: '/verify/badges', label: 'Badges' },
  { to: '/verify/achievements', label: 'Achievements' },
  { to: '/verify/analytics', label: 'Analytics' },
]

// Small shared sub-nav for the verifier portal. Kept self-contained here
// rather than in the app Header since Header has no role-specific nav today.
export default function VerifierLayout() {
  return (
    <div className="flex flex-col">
      <div className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 py-3 sm:px-6">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                [
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-white' : 'text-ink/70 hover:bg-surface hover:text-ink',
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
