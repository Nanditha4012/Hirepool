import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/lib/notificationsApi'
import Skeleton from '@/components/ui/Skeleton'

const POLL_INTERVAL_MS = 45_000

/** Relative time for a notification's createdAt — "just now", "5m ago", "3d ago". */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Bell icon + unread badge, mounted in Header for any signed-in user (all
 * four roles hit the same role-agnostic /me/notifications* endpoints).
 * Polls the unread count in the background; clicking opens a small dropdown
 * with the most recent notifications, each of which marks itself read and
 * navigates to its `link` (if any) on click.
 */
export default function NotificationBell() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const refreshUnreadCount = useCallback(async () => {
    try {
      const { count } = await getUnreadNotificationCount()
      setUnreadCount(count)
    } catch {
      // Silent — this is a background poll, not a user-initiated action.
    }
  }, [])

  useEffect(() => {
    refreshUnreadCount()
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refreshUnreadCount])

  // Close on outside click — same pattern as ChipMultiSelect/Combobox.
  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleToggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      setError(null)
      try {
        const result = await listMyNotifications({ limit: 10 })
        setNotifications(result.results)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load notifications')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleNotificationClick = async (notification: NotificationRow) => {
    setOpen(false)
    if (!notification.readAt) {
      setUnreadCount((prev) => Math.max(prev - 1, 0))
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)),
      )
      try {
        await markNotificationRead(notification.id)
      } catch {
        // Best-effort — the dropdown already reflects "read" optimistically;
        // a failed PATCH here just means it may show unread again next open.
      }
    }
    if (notification.link) {
      navigate(notification.link)
    }
  }

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await markAllNotificationsRead()
      setUnreadCount(0)
      setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all as read')
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        className={[
          'relative inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-card transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'text-ink/60 hover:bg-surface hover:text-ink',
        ].join(' ')}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-80 max-w-[90vw] overflow-hidden rounded-card border border-line bg-card shadow-lift animate-fade-in">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll || unreadCount === 0}
              className="text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-ink/30 disabled:no-underline"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <p className="p-4 text-sm text-danger">{error}</p>
            ) : notifications.length === 0 ? (
              <p className="p-4 text-sm text-ink/40">You&apos;re all caught up — no notifications yet.</p>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={[
                        'flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-3 text-left last:border-0',
                        'transition-colors hover:bg-surface',
                        notification.readAt ? '' : 'bg-primary/5',
                      ].join(' ')}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <p className={['text-sm', notification.readAt ? 'text-ink/70' : 'font-semibold text-ink'].join(' ')}>
                          {notification.message}
                        </p>
                        {!notification.readAt && (
                          <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        )}
                      </div>
                      <p className="text-xs text-ink/40">{timeAgo(notification.createdAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
