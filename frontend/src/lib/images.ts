/**
 * Photography used across the marketing surfaces.
 *
 * Centralised here rather than inlined at each use site so the whole set can
 * be swapped for self-hosted assets in one edit. These are Unsplash CDN URLs
 * with explicit width/quality parameters — which means they are a runtime
 * dependency on an external host: if it is unreachable (offline dev, a
 * locked-down network, a strict image CSP) the photos simply don't paint.
 * Every place one is used is styled to survive that — a gradient or solid
 * background sits underneath, so a missing photo degrades to a plain panel
 * rather than a hole in the layout.
 */

/** Unsplash serves a resized/compressed derivative from these params. */
function unsplash(id: string, width = 1600): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=70`
}

export const IMAGES = {
  /** Hero: a candidate working, warm and human rather than corporate stock. */
  hero: unsplash('1522071820081-009f0129c71c', 1920),
  /** How-it-works step art. */
  stepVerify: unsplash('1600880292203-757bb62b4baf', 800),
  stepDiscover: unsplash('1552664730-d307ca884978', 800),
  stepConnect: unsplash('1573497019940-1c28c88b4f3e', 800),
  /** Split-panel art for the auth pages. */
  authCandidate: unsplash('1531482615713-2afd69097998', 1200),
  authCompany: unsplash('1497366754035-f200968a6e72', 1200),
  authVerifier: unsplash('1521737604893-d14cc237f11d', 1200),
  /** Wide band behind the closing call to action. */
  ctaBand: unsplash('1521737711867-e3b97375f902', 1920),
} as const

/** Small round avatars for the testimonial strip. */
export const AVATARS = [
  unsplash('1494790108377-be9c29b29330', 200),
  unsplash('1500648767791-00dcc994a43e', 200),
  unsplash('1438761681033-6461ffad8d80', 200),
  unsplash('1507003211169-0a1dd7228f2d', 200),
] as const
