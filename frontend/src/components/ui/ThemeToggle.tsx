import { useTheme } from '@/lib/themeStore'

interface ThemeToggleProps {
  /** Light-on-dark styling, for use over photo panels and dark headers. */
  inverted?: boolean
  className?: string
}

/**
 * Sun/moon switch for light and dark mode.
 *
 * Both icons are always rendered and cross-faded with rotation, rather than
 * swapped conditionally — a mounted-and-transformed pair animates, whereas
 * unmount/remount would just pop.
 */
export default function ThemeToggle({ inverted = false, className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // role="switch" + aria-checked tells assistive tech this is a
      // two-state control, not a button that navigates somewhere.
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={[
        'relative inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-card transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        inverted
          ? 'text-white/80 hover:bg-white/10 hover:text-white'
          : 'text-ink/60 hover:bg-surface hover:text-ink',
        className,
      ].join(' ')}
    >
      {/* Sun — shown in light mode */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className={[
          'absolute h-5 w-5 transition-all duration-300',
          isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
        ].join(' ')}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>

      {/* Moon — shown in dark mode */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={[
          'absolute h-5 w-5 transition-all duration-300',
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        ].join(' ')}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  )
}
