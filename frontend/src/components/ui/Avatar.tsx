type Size = 'sm' | 'md' | 'lg'

interface AvatarProps {
  /** Display name, username or email — whatever identifies this person best. */
  name: string
  size?: Size
  className?: string
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

/**
 * Derives up to two initials.
 *
 * Email addresses are special-cased to their local part first, otherwise
 * "manoj@gmail.com" yields "MG" — the "G" coming from the mail provider,
 * which tells you nothing about the person.
 */
function initialsFor(name: string): string {
  const base = name.includes('@') ? name.split('@')[0] : name
  const words = base.split(/[\s._-]+/).filter(Boolean)

  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * Initials in a tinted disc — the stand-in for a profile photo, which nothing
 * in the product uploads yet.
 *
 * The hue is picked deterministically from the name so the same person always
 * gets the same colour (recognisable at a glance in a list), rather than
 * every avatar in the app being the same flat brand blue.
 */
export default function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  const initials = initialsFor(name)

  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360
  }

  return (
    <span
      aria-hidden="true"
      style={{
        // Inline HSL rather than a Tailwind class: the hue is computed at
        // runtime, and Tailwind can only emit classes it can see at build
        // time — `bg-[hsl(${hash}...)]` would simply not exist in the CSS.
        backgroundImage: `linear-gradient(135deg, hsl(${hash} 70% 46%), hsl(${(hash + 40) % 360} 68% 38%))`,
      }}
      className={[
        'inline-flex flex-shrink-0 select-none items-center justify-center rounded-full font-bold text-white shadow-soft ring-2 ring-card',
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      {initials}
    </span>
  )
}
