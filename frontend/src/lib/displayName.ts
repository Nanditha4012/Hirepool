import type { AuthUser } from './authStore'

/**
 * The one name to show for an account, in order of how human it reads.
 *
 * Lives here rather than in ProfileMenu.tsx so both the desktop hover card and
 * the mobile menu can import it without that file exporting a non-component
 * (which breaks React Fast Refresh for the whole module).
 */
export function displayNameFor(user: AuthUser): string {
  return user.fullName || user.username || user.email
}
