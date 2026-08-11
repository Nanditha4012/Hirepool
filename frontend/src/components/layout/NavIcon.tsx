/**
 * Wraps a glyph from navConfig's `icons` in its 24×24 frame.
 *
 * Its own module rather than living beside the glyphs it renders: a file that
 * exports both a component and plain constants breaks React Fast Refresh for
 * everything in it, and navConfig is nearly all constants.
 */
export default function NavIcon({
  glyph,
  className = 'h-6 w-6',
}: {
  glyph: JSX.Element
  className?: string
}) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      {glyph}
    </svg>
  )
}
