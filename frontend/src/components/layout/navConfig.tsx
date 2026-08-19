import type { Role } from '@/lib/authStore'
import { roleHome } from '@/lib/roleHome'

/**
 * The one description of "what can this role navigate to".
 *
 * The same list drives three different chromes — the desktop top bar, the
 * mobile bottom bar and the slide-out drawer — so a new destination is added
 * here once instead of in three components that quietly drift apart.
 */
export interface NavItem {
  to: string
  label: string
  /** Bottom-bar label, where a slot is about 64px wide. Defaults to `label`. */
  short?: string
  icon: JSX.Element
  /**
   * Match this path exactly rather than as a prefix. Needed for any route
   * that is a prefix of its own children — `/candidate` would otherwise light
   * up while you are on `/candidate/edit`.
   */
  end?: boolean
  /**
   * Hidden until the account passes verification, matching `requireVerified`
   * on the route (see components/ProtectedRoute.tsx) and requireVerified on
   * the server. Anything that is "the product" carries this; the account's own
   * home and its billing trail do not, because those are exactly what a
   * pending or rejected account still needs.
   *
   * Offering a link that is guaranteed to land on a locked screen is worse
   * than offering no link, so this is filtered out rather than shown disabled.
   */
  gated?: boolean
}

// Inline SVG in the stroke style already used by the header and menu glyphs
// (24x24, stroke="currentColor", strokeWidth 2), rather than an icon package
// — this matches what is in the app without adding a dependency.
const stroke = {
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 2,
}

export const icons = {
  home: <path {...stroke} d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  profile: <path {...stroke} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
  // A noticeboard — the Walk-in Pedia / Job Book pairing.
  board: <path {...stroke} d="M4 6h16v13H4zM4 10h16M9 3v3M15 3v3M8 14h5" />,
  community: (
    <path
      {...stroke}
      d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M10 7a3 3 0 11-6 0 3 3 0 016 0zM21 20v-1a4 4 0 00-3-3.87M16 4.13a4 4 0 010 7.75"
    />
  ),
  trophy: (
    <path
      {...stroke}
      d="M8 4h8v5a4 4 0 11-8 0V4zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4m-3 3h6"
    />
  ),
  search: <path {...stroke} d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />,
  messages: <path {...stroke} d="M21 15a2 2 0 01-2 2H8l-4 4V6a2 2 0 012-2h13a2 2 0 012 2z" />,
  unlocked: <path {...stroke} d="M7 11V8a5 5 0 019.9-1M5 11h14v10H5zM12 15v3" />,
  payments: <path {...stroke} d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />,
  leaderboard: <path {...stroke} d="M5 20V10m7 10V4m7 16v-6" />,
  plus: <path {...stroke} d="M12 5v14M5 12h14" />,
  settings: (
    <path
      {...stroke}
      d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6h.09A1.65 1.65 0 0010 3.09V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v.09a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
    />
  ),
  logout: <path {...stroke} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />,
  menu: <path {...stroke} d="M4 6h16M4 12h16M4 18h16" />,
  close: <path {...stroke} d="M6 18L18 6M6 6l12 12" />,
} satisfies Record<string, JSX.Element>

/** The surfaces every signed-in role shares. */
const sharedItems: NavItem[] = [
  { to: '/feed', label: 'Walk-ins & Jobs', short: 'Jobs', icon: icons.board, gated: true },
  { to: '/community', label: 'Community', short: 'Community', icon: icons.community, gated: true },
]

/**
 * Destinations only one role has.
 *
 * None of these may repeat the role's own home path — navItemsFor() puts Home
 * at the front of the list, and a second entry with the same `to` would give
 * two nav links the same React key.
 */
const roleItems: Record<Role, NavItem[]> = {
  candidate: [
    { to: '/contests', label: 'Contests', short: 'Contests', icon: icons.trophy, end: true, gated: true },
    {
      to: '/candidate/messages',
      label: 'Messages',
      short: 'Inbox',
      icon: icons.messages,
      end: true,
      gated: true,
    },
    { to: '/contests/leaderboard', label: 'Leaderboard', icon: icons.leaderboard, gated: true },
    { to: '/candidate/payments', label: 'Payments', icon: icons.payments, end: true },
  ],
  company: [
    { to: '/company/search', label: 'Find candidates', short: 'Search', icon: icons.search, gated: true },
    { to: '/company/relevancy', label: 'AI Relevancy', short: 'Relevancy', icon: icons.leaderboard, gated: true },
    { to: '/company/unlocked', label: 'Unlocked', icon: icons.unlocked, gated: true },
    { to: '/company/messages', label: 'Messages', short: 'Messages', icon: icons.messages, gated: true },
    { to: '/company/payments', label: 'Payments', icon: icons.payments },
  ],
  verifier: [
    { to: '/verify/profiles', label: 'Profiles', icon: icons.profile },
    { to: '/verify/analytics', label: 'Analytics', icon: icons.leaderboard },
    { to: '/verify/account', label: 'Account', icon: icons.settings },
  ],
  admin: [
    { to: '/admin/candidates', label: 'Candidates', icon: icons.profile },
    { to: '/admin/companies', label: 'Companies', icon: icons.search },
    { to: '/admin/payments', label: 'Payments', icon: icons.payments },
  ],
}

/**
 * Everything this role can reach — the drawer's list, in order.
 *
 * `verified` is the account's verification state (see lib/verification.ts).
 * It defaults to true so a caller that genuinely has no notion of an account
 * — nothing in the app today — still gets the full list rather than silently
 * getting a stripped one.
 */
export function navItemsFor(role: Role, verified = true): NavItem[] {
  const items: NavItem[] = [
    { to: roleHome[role].to, label: 'Home', short: 'Home', icon: icons.home, end: true },
    ...sharedItems,
    ...roleItems[role],
  ]

  return verified ? items : items.filter((item) => !item.gated)
}

/**
 * The four bottom-bar slots, which flank the central compose button.
 *
 * Candidates get the layout as specified — Home, the job feeds, Community,
 * Contests. Companies get Search in the fourth slot instead, because contests
 * are candidate-only and a nav item that 403s is worse than no nav item.
 * Verifiers and admins have their own pill navs inside their portals and so
 * get no bottom bar at all (see BottomNav).
 *
 * Returns null for an unverified account: three of the four slots are gated,
 * and a bottom bar reduced to a single working tab (next to a compose button
 * that only leads to a locked screen) is chrome pretending there is somewhere
 * to go. BottomNav renders nothing at all in that case.
 */
export function bottomNavItemsFor(
  role: 'candidate' | 'company',
  verified = true,
): [NavItem[], NavItem[]] | null {
  if (!verified) return null

  const items = navItemsFor(role)
  // Non-null asserted because the paths are the literals declared above, in
  // this same file — narrowing the parameter to the two roles that have a
  // fourth slot is what makes that true rather than hopeful.
  const byPath = (path: string) => items.find((item) => item.to === path)!

  const home = items[0]
  const feed = byPath('/feed')
  const community = byPath('/community')
  const fourth = role === 'company' ? byPath('/company/search') : byPath('/contests')

  // Split either side of the compose button so the bar can render
  // [left] (+) [right] without the caller re-deriving the ordering.
  return [
    [home, feed],
    [community, fourth],
  ]
}
