import { useEffect, useState } from 'react'
import { apiFetch } from './apiClient'
import { APP_NAME } from './config'

// Small nice-to-have loader for the public, unauthenticated
// GET /masters/site-settings (backed by Phase 5's site_settings table).
// Falls back to build-time config when a key is missing or the endpoint
// isn't available yet (e.g. the Phase 5 migration hasn't run in a given
// environment) — this is not core to the admin portal, keep it minimal.

export type SiteSettingsMap = Record<string, string | null>

const FALLBACKS: SiteSettingsMap = {
  app_name: APP_NAME,
}

/** Reads a settings map with a fallback for a missing/null key. */
export function getSiteSetting(settings: SiteSettingsMap, key: string, fallback = ''): string {
  return settings[key] ?? FALLBACKS[key] ?? fallback
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettingsMap>(FALLBACKS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await apiFetch<SiteSettingsMap>('/masters/site-settings', { auth: false })
        if (!cancelled) setSettings({ ...FALLBACKS, ...result })
      } catch {
        // Endpoint may 404/fail before Phase 5's migration runs — fall back
        // to build-time config silently, this is a nice-to-have only.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { settings, loading }
}
