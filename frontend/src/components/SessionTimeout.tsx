import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authStore'
import { SESSION_IDLE_MINUTES, SESSION_WARNING_SECONDS } from '@/lib/config'
import Button from '@/components/ui/Button'

const IDLE_MS = SESSION_IDLE_MINUTES * 60 * 1000
const WARNING_MS = SESSION_WARNING_SECONDS * 1000

/** Cross-tab activity clock. */
const ACTIVITY_KEY = 'hirepool:last-activity'

/**
 * Events that count as "the user is still here". Deliberately excludes
 * `mousemove`: a stray cursor nudge from a passing hand, or a page whose own
 * animation moves under a parked pointer, would keep an abandoned session
 * alive forever — which is the exact thing an idle timeout exists to stop.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

/**
 * Signs an idle user out after SESSION_IDLE_MINUTES, with a countdown warning
 * shortly before so a half-finished form isn't lost silently.
 *
 * Activity is written to localStorage rather than kept in a ref, so several
 * open tabs share one clock: typing in the tab you're actually looking at
 * keeps the others alive, instead of a background tab timing the whole
 * session out from under you.
 *
 * Rendered only when someone is signed in (see App.tsx) — the timer has
 * nothing to do on the public pages.
 */
export default function SessionTimeout() {
  const { user, expireSession } = useAuth()
  const navigate = useNavigate()

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  // Guards against the 1s tick firing expireSession() repeatedly while the
  // logout request is still in flight.
  const expiringRef = useRef(false)

  const markActive = useCallback(() => {
    try {
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
    } catch {
      // Private-browsing / storage-disabled: the timer then works per-tab
      // instead of across tabs, which is a graceful degradation, not a break.
    }
  }, [])

  const readLastActive = useCallback((): number => {
    try {
      const raw = Number(localStorage.getItem(ACTIVITY_KEY))
      return Number.isFinite(raw) && raw > 0 ? raw : Date.now()
    } catch {
      return Date.now()
    }
  }, [])

  // Reset the clock whenever the signed-in user changes — a fresh login must
  // not inherit the previous session's staleness.
  useEffect(() => {
    if (!user) return
    markActive()
    setSecondsLeft(null)
    expiringRef.current = false
  }, [user, markActive])

  useEffect(() => {
    if (!user) return

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true })
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActive)
      }
    }
  }, [user, markActive])

  useEffect(() => {
    if (!user) return

    const tick = async () => {
      const idleFor = Date.now() - readLastActive()

      if (idleFor >= IDLE_MS) {
        if (expiringRef.current) return
        expiringRef.current = true
        setSecondsLeft(null)
        await expireSession()
        navigate('/login', { replace: true })
        return
      }

      const msToWarning = IDLE_MS - WARNING_MS - idleFor
      setSecondsLeft(msToWarning <= 0 ? Math.ceil((IDLE_MS - idleFor) / 1000) : null)
    }

    // Interval rather than a single setTimeout to the deadline: a laptop that
    // sleeps freezes timers, so a timeout scheduled for 30 minutes out can
    // fire long after the session should already have ended. Re-deriving the
    // remaining time from a wall-clock timestamp every second means waking
    // from sleep expires the session immediately, as it should.
    const id = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(id)
  }, [user, expireSession, navigate, readLastActive])

  if (!user || secondsLeft === null) return null

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm animate-scale-in rounded-card border border-line bg-card p-6 shadow-lift">
        <h2 id="session-timeout-title" className="text-lg font-bold text-ink">
          Still there?
        </h2>
        <p className="mt-2 text-sm text-ink/70">
          You&apos;ve been inactive for a while. For your security we&apos;ll sign you out in{' '}
          <span className="font-semibold text-ink">{secondsLeft}s</span>.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => {
              markActive()
              setSecondsLeft(null)
            }}
          >
            Stay signed in
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              expiringRef.current = true
              await expireSession()
              navigate('/login', { replace: true })
            }}
          >
            Log out now
          </Button>
        </div>
      </div>
    </div>
  )
}
