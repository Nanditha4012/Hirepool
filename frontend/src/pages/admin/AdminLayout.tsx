import { NavLink, Outlet } from 'react-router-dom'

const navLinks = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/candidates', label: 'Candidates' },
  { to: '/admin/companies', label: 'Companies' },
  { to: '/admin/verifiers', label: 'Verifiers' },
  { to: '/admin/company-requests', label: 'Company requests' },
  { to: '/admin/masters', label: 'Master data' },
  { to: '/admin/settings', label: 'Site settings' },
  { to: '/admin/announcements', label: 'Announcements' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/contests', label: 'Contests' },
  { to: '/admin/audit-log', label: 'Audit log' },
]

/**
 * Shared chrome for the admin portal — mirrors VerifierLayout.tsx exactly
 * (same wrapper, same pill-nav pattern) since this is the same kind of
 * internal tool: many destinations under one role, rather than the single
 * page every other role gets from the app Header.
 */
export default function AdminLayout() {
  return (
    <div className="flex min-h-[60vh] flex-col bg-surface/40">
      <div className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/40">Admin portal</p>
          {/* Name deliberately not repeated here — see VerifierLayout. */}
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-3 sm:px-6">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              // Only the exact "/admin" link needs `end` — every other link
              // is a path prefix (e.g. /admin/candidates/:id should keep
              // "Candidates" highlighted), same reasoning as VerifierLayout.
              end={link.to === '/admin'}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                  isActive ? 'bg-primary text-white shadow-soft' : 'text-ink/60 hover:bg-surface hover:text-ink',
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
