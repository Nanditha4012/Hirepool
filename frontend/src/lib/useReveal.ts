import { useEffect, useRef } from 'react'

/**
 * Reveals an element the first time it scrolls into view.
 *
 * Attach the returned ref to any node carrying the `.reveal` class (defined
 * in index.css); this adds `.is-revealed` when it crosses the viewport
 * threshold and then stops observing it — reveals are one-shot, so elements
 * don't re-animate when you scroll back up past them.
 *
 * Falls back to revealing immediately where IntersectionObserver is missing,
 * so content is never left permanently invisible.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(delayMs = 0) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-revealed')
      return
    }

    if (delayMs > 0) {
      node.style.transitionDelay = `${delayMs}ms`
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-revealed')
          observer.unobserve(entry.target)
        }
      },
      // A small positive threshold plus a bottom-inset root margin means the
      // element animates once it's meaningfully on screen, not the instant a
      // single pixel of it appears.
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [delayMs])

  return ref
}
