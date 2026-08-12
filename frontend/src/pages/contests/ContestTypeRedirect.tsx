import { Navigate, useParams } from 'react-router-dom'
import { isContestType } from '@/lib/contestApi'

/**
 * Bounces the old `/contests/dsa` style URL onto the tab that replaced it.
 *
 * Contest types used to be three separate pages reached by pushing a route,
 * which made Contests the odd one out: the Walk-in Pedia and the Job Book are
 * tabs of one screen, and switching between them never leaves the page. They
 * are now the same shape — `/contests?tab=dsa` — so this exists purely so
 * links, bookmarks and anything already shared keep landing somewhere
 * sensible instead of on the 404 page.
 *
 * `replace` so the dead path doesn't sit in the history stack for Back to
 * land on and immediately re-redirect. An unrecognised type falls back to the
 * default tab rather than 404ing, which is the friendlier read of a typo.
 */
export default function ContestTypeRedirect() {
  const { type } = useParams<{ type: string }>()

  return <Navigate to={isContestType(type) ? `/contests?tab=${type}` : '/contests'} replace />
}
