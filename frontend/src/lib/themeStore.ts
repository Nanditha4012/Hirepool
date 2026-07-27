import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'hirepool.theme'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

/**
 * Resolves the theme to use on first paint: an explicit past choice if there
 * is one, otherwise the OS preference.
 *
 * Wrapped in try/catch because localStorage throws outright — not just
 * returns null — in a Safari private window and under some cookie-blocking
 * settings. A theme preference is not worth taking the whole app down for.
 */
function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Ignore — fall through to the OS preference.
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme)

  // Toggling one class on <html> is the whole mechanism: Tailwind is in
  // `darkMode: 'class'`, and every themed colour in the app resolves from
  // the CSS variables index.css redefines under `.dark`.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Preference just won't persist; the current session still works.
    }
  }, [theme])

  // Follow the OS if — and only if — the user has never chosen explicitly.
  // Someone who picked light on a dark-mode machine should stay in light.
  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia('(prefers-color-scheme: dark)')

    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return
      } catch {
        // Can't read a stored choice, so treat the OS as authoritative.
      }
      setThemeState(event.matches ? 'dark' : 'light')
    }

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  )

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme])

  // createElement rather than JSX so this stays a .ts file — same approach as
  // authStore.ts. Exporting both a component and a hook from one .tsx module
  // trips react-refresh/only-export-components; keeping the extension .ts
  // sidesteps it without splitting the provider and its hook apart.
  return React.createElement(ThemeContext.Provider, { value }, children)
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
