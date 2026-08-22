import React from 'react'

/**
 * Real marks for contact channels and coding platforms.
 *
 * The profile card used to label these with whatever single character came to
 * hand — "☎", "✉", "💬" for contact, and the first letter of the platform
 * name in a grey circle for LeetCode/GitHub/HackerRank. Two problems with
 * that. The emoji render as a different glyph on every OS (and as flat
 * monochrome text on some Windows builds), so the row looked broken on
 * exactly the platform most of these users are on. And "L" in a circle is not
 * a LeetCode logo — a company scanning twenty cards has to read each label to
 * work out what it is looking at, which is the job an icon exists to do.
 *
 * Inline SVG paths in the same 24x24 stroke idiom as navConfig's glyphs, so
 * they inherit `currentColor` and theme correctly. Brand marks are simplified
 * silhouettes drawn to be recognisable at 16-20px rather than exact traces of
 * the originals.
 */

const stroke = {
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 1.9,
  fill: 'none',
}

/** Channels a company can reach a candidate through, plus their document links. */
export const contactIcons = {
  phone: (
    <path
      {...stroke}
      d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"
    />
  ),
  email: (
    <>
      <path {...stroke} d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <path {...stroke} d="M22 6l-10 7L2 6" />
    </>
  ),
  whatsapp: (
    <path
      {...stroke}
      d="M20.5 11.6a8.4 8.4 0 01-12.3 7.5L3.5 20.5l1.4-4.6A8.4 8.4 0 1120.5 11.6zM8.6 8.2c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.6l-.4.5c-.1.2-.3.3-.1.6a7 7 0 003.3 2.9c.3.1.5.1.7-.1l.6-.7c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.4.4a2 2 0 01-1.4 1.7c-.5.2-1.2.2-3.8-1a10 10 0 01-4.2-4.4c-.4-1-.4-2 .1-2.6z"
    />
  ),
  resume: (
    <>
      <path {...stroke} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path {...stroke} d="M14 2v6h6M9 13h6M9 17h4" />
    </>
  ),
  portfolio: (
    <>
      <circle {...stroke} cx="12" cy="12" r="10" />
      <path {...stroke} d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z" />
    </>
  ),
  location: (
    <>
      <path {...stroke} d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1116 0z" />
      <circle {...stroke} cx="12" cy="10" r="3" />
    </>
  ),
  clock: (
    <>
      <circle {...stroke} cx="12" cy="12" r="9" />
      <path {...stroke} d="M12 7v5l3 2" />
    </>
  ),
  briefcase: (
    <>
      <path {...stroke} d="M3 8h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V9a1 1 0 011-1z" />
      <path {...stroke} d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2M2 13h20" />
    </>
  ),
  /** Open padlock — "contact unlocked" state. */
  lockOpen: (
    <>
      <rect {...stroke} x="4" y="11" width="16" height="10" rx="2" />
      <path {...stroke} d="M7 11V7a5 5 0 019.5-2.2" />
    </>
  ),
  /** Closed padlock — "contact locked" placeholder before an unlock. */
  lockClosed: (
    <>
      <rect {...stroke} x="4" y="11" width="16" height="10" rx="2" />
      <path {...stroke} d="M7 11V7a5 5 0 0110 0v4" />
    </>
  ),
  trophy: (
    <path
      {...stroke}
      d="M8 4h8v5a4 4 0 11-8 0V4zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4m-3 3h6"
    />
  ),
  /** Data structures & algorithms — code brackets. */
  code: <path {...stroke} d="M8 6l-6 6 6 6M16 6l6 6-6 6" />,
  /** Domain-specific challenges — a wrench. */
  tools: (
    <path
      {...stroke}
      d="M14.7 6.3a4 4 0 00-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 005.4-5.4l-2.8 2.8-2-2z"
    />
  ),
  /** Quant — a bar chart. */
  chart: <path {...stroke} d="M5 20V10m7 10V4m7 16v-6" />,
  /** Domain/industry marker — a diamond. */
  domain: <path {...stroke} d="M12 2l4.5 5.5L12 22 7.5 7.5z" />,
} satisfies Record<string, React.ReactNode>

export type ContactIconName = keyof typeof contactIcons

/**
 * Coding-platform marks, keyed by the lowercased platform name stored on the
 * badge row. `fallback` covers anything an admin adds to the master list
 * later — an unrecognised platform gets a generic code glyph rather than
 * nothing, so the chip never renders with an empty slot.
 */
export const platformIcons = {
  leetcode: (
    <path
      {...stroke}
      d="M13.5 3.5L7 10.2a2.5 2.5 0 000 3.6l6.5 6.7M10.2 12h9.3M16.8 6.8L20 3.6"
    />
  ),
  github: (
    <path
      {...stroke}
      d="M9 19c-4.3 1.4-4.3-2.2-6-2.6m12 4.6v-3.6a3.1 3.1 0 00-.9-2.4c2.9-.3 6-1.4 6-6.4a5 5 0 00-1.4-3.5 4.6 4.6 0 00-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 00-6.6 0C5.9 1.3 4.8 1.6 4.8 1.6a4.6 4.6 0 00-.1 3.5A5 5 0 003.3 8.6c0 5 3.1 6.1 6 6.4a3.1 3.1 0 00-.9 2.4V21"
    />
  ),
  hackerrank: (
    <>
      <path {...stroke} d="M12 2l8.5 5v10L12 22 3.5 17V7z" />
      <path {...stroke} d="M9.5 8.5v7M14.5 8.5v7M9.5 12h5" />
    </>
  ),
  codechef: (
    <>
      <path {...stroke} d="M7 21h10l1-6H6z" />
      <path {...stroke} d="M8 15c-1-3 .5-5 1.5-6C10.5 8 10 6 9 5c2.5.3 4 2 4 3.6 0 1-.4 1.6-.4 2.2 0 .8.6 1.2 1.2 1.2.9 0 1.4-.7 1.4-1.6 1 1 1.5 2.4 1.2 4.6" />
    </>
  ),
  codeforces: (
    <>
      <rect {...stroke} x="3" y="10" width="4.5" height="10" rx="1" />
      <rect {...stroke} x="9.75" y="5" width="4.5" height="15" rx="1" />
      <rect {...stroke} x="16.5" y="13" width="4.5" height="7" rx="1" />
    </>
  ),
  geeksforgeeks: (
    <>
      <circle {...stroke} cx="8" cy="12" r="4" />
      <circle {...stroke} cx="16" cy="12" r="4" />
      <path {...stroke} d="M12 12h0" />
    </>
  ),
  linkedin: (
    <>
      <path {...stroke} d="M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
      <path {...stroke} d="M7.5 10.5V17M7.5 7.5v.01M11.5 17v-6.5M11.5 13a2.5 2.5 0 015 0V17" />
    </>
  ),
  fallback: <path {...stroke} d="M8 6l-6 6 6 6M16 6l6 6-6 6" />,
} satisfies Record<string, React.ReactNode>

export function platformIconFor(platformName: string): React.ReactNode {
  const key = platformName.toLowerCase().replace(/[^a-z]/g, '')
  return (platformIcons as Record<string, React.ReactNode>)[key] ?? platformIcons.fallback
}

interface BrandIconProps {
  glyph: React.ReactNode
  className?: string
}

/** Wraps a glyph in the shared 24x24 viewBox. Colour comes from the parent. */
export default function BrandIcon({ glyph, className = 'h-4 w-4' }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" className={className} aria-hidden="true">
      {glyph}
    </svg>
  )
}
