import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { APP_NAME } from '@/lib/config'
import { useAuth } from '@/lib/authStore'
import Button from '@/components/ui/Button'

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    setMenuOpen(false)
    navigate('/')
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="text-xl font-extrabold text-primary">
          {APP_NAME}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-4 md:flex">
          {user ? (
            <>
              <span className="text-sm text-ink/70">
                Signed in as <span className="font-semibold text-ink">{user.role}</span>
              </span>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-ink hover:text-primary">
                Login
              </Link>
              <Link to="/signup">
                <Button size="sm">Sign up</Button>
              </Link>
            </>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-card p-2 text-ink md:hidden"
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

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-gray-200 px-4 pb-4 md:hidden">
          {user ? (
            <div className="flex flex-col gap-3 pt-3">
              <span className="text-sm text-ink/70">
                Signed in as <span className="font-semibold text-ink">{user.role}</span>
              </span>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pt-3">
              <Link to="/login" className="text-sm font-medium text-ink hover:text-primary" onClick={() => setMenuOpen(false)}>
                Login
              </Link>
              <Link to="/signup" onClick={() => setMenuOpen(false)}>
                <Button size="sm" className="w-full">
                  Sign up
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
