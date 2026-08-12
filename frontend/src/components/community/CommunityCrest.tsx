type Size = 'sm' | 'md' | 'lg'

interface CommunityCrestProps {
  /** The community's slug — the stable key the artwork is derived from. */
  slug: string
  /** Used as the accessible label and for the fallback initials. */
  name: string
  size?: Size
  className?: string
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
}

/**
 * A community's crest: a generated, illustrated badge instead of an emoji.
 *
 * Communities were identified by a single emoji stored on the row (💬, 🧵,
 * 🏛️). That is a weak identity for three reasons, in increasing order of how
 * much they matter. Emoji render as a different picture on every OS and as
 * flat monochrome glyphs on some Windows builds, so the catalogue looked
 * inconsistent and occasionally broken. They carry no brand — a page of
 * system emoji looks like a chat message, not a product. And they are
 * unbounded: every new community needs someone to pick one, and picks
 * collide.
 *
 * This derives a crest instead. Slug -> a stable hash -> a hue pair, a
 * geometric emblem from a fixed set, and a background pattern. The same
 * community always gets the same crest, different ones reliably differ, and
 * adding a community needs no decision from anyone. Because it is SVG built
 * from brand-adjacent HSL, it is crisp at any size and identical on every
 * platform.
 *
 * The emoji column on the row is left alone and simply no longer read by the
 * UI — dropping it would be a migration for no gain, and it is still useful
 * as an admin-facing hint in the seeder.
 */

/** FNV-1a. Small, stable, and well spread for short strings like a slug. */
function hashOf(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return Math.abs(hash)
}

/**
 * Six emblems, each drawn in a 32x32 box.
 *
 * Deliberately abstract marks rather than literal pictograms: a community
 * called "Salary & Negotiation" has no obvious icon, and a wrong-but-literal
 * one (a moneybag) is worse than a distinctive abstract one. These are here
 * to be *told apart*, which is all a crest has to do.
 */
const EMBLEMS = [
  // Concentric rings
  <g key="rings" fill="none" stroke="currentColor" strokeWidth="2.4">
    <circle cx="16" cy="16" r="10.5" opacity="0.45" />
    <circle cx="16" cy="16" r="5.5" />
  </g>,
  // Ascending bars
  <g key="bars" fill="currentColor">
    <rect x="6" y="18" width="4.5" height="9" rx="2" opacity="0.5" />
    <rect x="13.75" y="11" width="4.5" height="16" rx="2" opacity="0.75" />
    <rect x="21.5" y="5" width="4.5" height="22" rx="2" />
  </g>,
  // Linked nodes
  <g key="nodes" stroke="currentColor" strokeWidth="2.2" fill="currentColor">
    <path d="M10 22 L16 10 L22 22" fill="none" opacity="0.5" />
    <circle cx="16" cy="9" r="3.4" />
    <circle cx="9" cy="23" r="3.4" opacity="0.75" />
    <circle cx="23" cy="23" r="3.4" opacity="0.75" />
  </g>,
  // Chevron stack
  <g key="chevrons" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 13 L16 6 L24 13" />
    <path d="M8 21 L16 14 L24 21" opacity="0.6" />
    <path d="M8 28 L16 21 L24 28" opacity="0.3" />
  </g>,
  // Shield
  <g key="shield" fill="currentColor">
    <path d="M16 4l10 4v8c0 6.5-4.4 11-10 12.5C10.4 27 6 22.5 6 16V8z" opacity="0.28" />
    <path d="M16 9l5.5 2.2V16c0 3.6-2.4 6.1-5.5 7.1-3.1-1-5.5-3.5-5.5-7.1v-4.8z" />
  </g>,
  // Orbit
  <g key="orbit" fill="none" stroke="currentColor" strokeWidth="2.3">
    <ellipse cx="16" cy="16" rx="12" ry="5.5" opacity="0.4" />
    <ellipse cx="16" cy="16" rx="5.5" ry="12" opacity="0.4" />
    <circle cx="16" cy="16" r="3.6" fill="currentColor" stroke="none" />
  </g>,
]

export default function CommunityCrest({
  slug,
  name,
  size = 'md',
  className = '',
}: CommunityCrestProps) {
  const hash = hashOf(slug || name)

  // Hue is stepped by the golden angle so consecutive communities in the
  // catalogue land far apart on the wheel rather than in a gradient of
  // near-identical blues.
  const hue = (hash * 137.508) % 360
  const hueB = (hue + 42) % 360
  const emblem = EMBLEMS[hash % EMBLEMS.length]
  const patternRotation = (hash % 4) * 45

  const gradientId = `crest-grad-${slug || name}`
  const patternId = `crest-pat-${slug || name}`

  return (
    <span
      role="img"
      aria-label={`${name} community`}
      className={[
        'relative inline-flex flex-shrink-0 overflow-hidden rounded-card shadow-soft ring-1 ring-black/5',
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      <svg viewBox="0 0 32 32" className="h-full w-full">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            {/* Saturation and lightness are fixed so every crest carries the
                same weight — only the hue varies. Without that, some came out
                as pale washes and others as near-black blocks. */}
            <stop offset="0%" stopColor={`hsl(${hue} 68% 48%)`} />
            <stop offset="100%" stopColor={`hsl(${hueB} 62% 36%)`} />
          </linearGradient>

          <pattern
            id={patternId}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${patternRotation})`}
          >
            <path d="M0 4h8" stroke="white" strokeOpacity="0.13" strokeWidth="2.5" />
          </pattern>
        </defs>

        <rect width="32" height="32" fill={`url(#${gradientId})`} />
        <rect width="32" height="32" fill={`url(#${patternId})`} />
        <g className="text-white">{emblem}</g>
      </svg>
    </span>
  )
}
