import type { Role } from './authStore'

/**
 * Where each signed-in role's "home" is, and what to call it.
 *
 * Previously copied into Header.tsx and ProfileMenu.tsx, which is how the
 * brand lockup ended up pointing at `/` for everyone: the header's logo was
 * never wired to this at all, so clicking it while signed in threw the user
 * back out to the marketing landing page — profile still in the corner,
 * nothing else on screen belonging to them. One exported map, imported by the
 * logo, the desktop nav, the drawer and the account card.
 */
export const roleHome: Record<Role, { to: string; label: string }> = {
  candidate: { to: '/candidate', label: 'My profile' },
  company: { to: '/company', label: 'Dashboard' },
  verifier: { to: '/verify/queue', label: 'Review queue' },
  admin: { to: '/admin', label: 'Admin portal' },
}

/**
 * The path the brand lockup should navigate to.
 *
 * Signed out that is the landing page; signed in it is the user's own home,
 * because for them the landing page is a page about a product they have
 * already joined.
 */
export function homePathFor(role: Role | undefined | null): string {
  return role ? roleHome[role].to : '/'
}
