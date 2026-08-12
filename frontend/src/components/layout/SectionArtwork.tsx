export type ArtworkScene =
  | 'walkins'
  | 'jobs'
  | 'contest-dsa'
  | 'contest-domain'
  | 'contest-quant'
  | 'community-feed'
  | 'community-browse'
  | 'leaderboard'
  | 'messages'

interface SectionArtworkProps {
  scene: ArtworkScene
  className?: string
}

/**
 * The illustrated panel in the left rail, under the section card.
 *
 * Every rail was card → roadmap → nothing, which left the sections looking
 * alike whichever one you were in: the same gradient block over the same
 * numbered list, with only the words changing. These give each tab something
 * of its own to recognise before reading anything.
 *
 * Inline SVG rather than raster images on purpose. Three reasons that matter
 * here: the artwork inherits the theme (every fill and stroke below resolves
 * through `currentColor` or a brand token, so nothing is a light-mode PNG
 * glowing on a dark page), it costs no extra request and no layout shift on
 * load, and the motion is CSS on real elements rather than a video or a GIF
 * that cannot be paused.
 *
 * All motion is declared with the existing `animate-*` utilities from
 * tailwind.config.js, and every animated element is `motion-reduce:animate-
 * none`, so a reader who has asked their OS for less movement gets the same
 * composition standing still — not a blank space where the panel was.
 *
 * `aria-hidden` throughout: these are decoration. Everything they suggest is
 * stated in words by the card above and the roadmap below, so a screen reader
 * loses nothing by skipping them.
 */

/** Shared frame so every scene sits in the same box at the same size. */
function Frame({ children, tint }: { children: React.ReactNode; tint: string }) {
  return (
    <div
      className={[
        'relative isolate overflow-hidden rounded-card border border-line shadow-soft',
        tint,
      ].join(' ')}
      aria-hidden="true"
    >
      <svg viewBox="0 0 320 180" className="h-auto w-full" role="presentation">
        {children}
      </svg>
    </div>
  )
}

/** Walk-ins: a map pin dropping onto a route, with a pulse where it lands. */
function WalkinsScene() {
  return (
    <Frame tint="bg-gradient-to-br from-primary/10 via-transparent to-accent/10">
      {/* Route */}
      <path
        d="M20 140 C 80 140, 70 70, 130 70 S 200 120, 250 60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="7 7"
        strokeLinecap="round"
        className="text-primary/35"
      />
      {/* Landing pulse */}
      <circle cx="250" cy="60" r="16" className="animate-float fill-primary/15 motion-reduce:animate-none" />
      <circle cx="250" cy="60" r="9" className="fill-primary/25" />
      {/* Pin */}
      <g className="animate-float motion-reduce:animate-none" style={{ animationDuration: '4s' }}>
        <path
          d="M250 22a13 13 0 0 0-13 13c0 9.5 13 23 13 23s13-13.5 13-23a13 13 0 0 0-13-13z"
          className="fill-primary"
        />
        <circle cx="250" cy="35" r="4.5" className="fill-white" />
      </g>
      {/* Waiting crowd, staggered so the queue reads as arriving */}
      {[60, 92, 124].map((x, index) => (
        <g
          key={x}
          className="animate-fade-up motion-reduce:animate-none"
          style={{ animationDelay: `${index * 160}ms`, animationDuration: '700ms' }}
        >
          <circle cx={x} cy="132" r="7" className="fill-accent/70" />
          <path
            d={`M${x - 11} 158a11 11 0 0 1 22 0z`}
            className="fill-accent/45"
          />
        </g>
      ))}
      {/* Ground */}
      <path d="M12 162h296" stroke="currentColor" strokeWidth="2" className="text-line" strokeLinecap="round" />
    </Frame>
  )
}

/** Job Book: an open ledger whose entries write themselves in. */
function JobsScene() {
  return (
    <Frame tint="bg-gradient-to-br from-accent/10 via-transparent to-primary/10">
      {/* Book */}
      <rect x="46" y="34" width="228" height="118" rx="10" className="fill-card stroke-line" strokeWidth="2" />
      <path d="M160 34v118" stroke="currentColor" strokeWidth="2" className="text-line" />
      {/* Entries, drawn in one after another */}
      {[
        { y: 60, w: 78 },
        { y: 82, w: 62 },
        { y: 104, w: 84 },
        { y: 126, w: 54 },
      ].map((line, index) => (
        <g
          key={line.y}
          className="animate-fade-in motion-reduce:animate-none"
          style={{ animationDelay: `${index * 200}ms`, animationDuration: '600ms' }}
        >
          <rect x="62" y={line.y} width="10" height="10" rx="3" className="fill-primary/60" />
          <rect x="80" y={line.y + 2} width={line.w} height="6" rx="3" className="fill-ink/15" />
          <rect x="176" y={line.y} width="10" height="10" rx="3" className="fill-accent/60" />
          <rect x="194" y={line.y + 2} width={line.w - 12} height="6" rx="3" className="fill-ink/15" />
        </g>
      ))}
      {/* The "apply" tag lifting off the page — every post carries a way in */}
      <g className="animate-float motion-reduce:animate-none" style={{ animationDuration: '5s' }}>
        <rect x="228" y="18" width="66" height="26" rx="13" className="fill-primary" />
        <path
          d="M246 31h18m-6-5 6 5-6 5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </Frame>
  )
}

/** DSA: a binary tree whose nodes light up along a traversal. */
function DsaScene() {
  const edges = [
    'M160 46 L108 92',
    'M160 46 L212 92',
    'M108 92 L74 140',
    'M108 92 L142 140',
    'M212 92 L246 140',
  ]
  const nodes = [
    { cx: 160, cy: 46 },
    { cx: 108, cy: 92 },
    { cx: 212, cy: 92 },
    { cx: 74, cy: 140 },
    { cx: 142, cy: 140 },
    { cx: 246, cy: 140 },
  ]
  return (
    <Frame tint="bg-gradient-to-br from-primary/10 via-transparent to-accent/10">
      {edges.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="2.5" className="text-primary/30" strokeLinecap="round" />
      ))}
      {nodes.map((node, index) => (
        <g
          key={`${node.cx}-${node.cy}`}
          className="animate-scale-in motion-reduce:animate-none"
          style={{ animationDelay: `${index * 130}ms`, animationDuration: '500ms' }}
        >
          <circle cx={node.cx} cy={node.cy} r="17" className="fill-primary/12" />
          <circle cx={node.cx} cy={node.cy} r="11" className="fill-primary" />
        </g>
      ))}
      {/* The visitor travelling the tree */}
      <circle r="6" className="fill-accent motion-reduce:hidden">
        <animateMotion dur="5s" repeatCount="indefinite" path="M160 46 L108 92 L74 140 L108 92 L142 140 L108 92 L160 46 L212 92 L246 140 L212 92 L160 46" />
      </circle>
    </Frame>
  )
}

/** Domain: stacked service tiers with a request flowing down them. */
function DomainScene() {
  const tiers = [
    { y: 34, label: 'UI' },
    { y: 76, label: 'API' },
    { y: 118, label: 'DB' },
  ]
  return (
    <Frame tint="bg-gradient-to-br from-accent/12 via-transparent to-primary/10">
      {tiers.map((tier, index) => (
        <g
          key={tier.y}
          className="animate-fade-up motion-reduce:animate-none"
          style={{ animationDelay: `${index * 170}ms`, animationDuration: '650ms' }}
        >
          <rect x="66" y={tier.y} width="188" height="32" rx="9" className="fill-card stroke-line" strokeWidth="2" />
          <rect x="80" y={tier.y + 12} width="52" height="8" rx="4" className="fill-primary/50" />
          <rect x="142" y={tier.y + 12} width="34" height="8" rx="4" className="fill-ink/15" />
          <circle cx="236" cy={tier.y + 16} r="6" className="fill-verified/70" />
        </g>
      ))}
      {/* Connectors */}
      <path d="M160 66v10M160 108v10" stroke="currentColor" strokeWidth="2.5" className="text-primary/40" strokeLinecap="round" />
      {/* The request, descending the stack and returning */}
      <circle r="5.5" className="fill-accent motion-reduce:hidden">
        <animateMotion dur="4s" repeatCount="indefinite" path="M160 50 L160 92 L160 134 L160 92 L160 50" />
      </circle>
    </Frame>
  )
}

/** Quant: three section bars filling to different heights. */
function QuantScene() {
  const bars = [
    { x: 70, h: 78, label: 'Math' },
    { x: 138, h: 108, label: 'Logic' },
    { x: 206, h: 62, label: 'English' },
  ]
  return (
    <Frame tint="bg-gradient-to-br from-primary/12 via-transparent to-verified/10">
      {/* Baseline */}
      <path d="M46 148h228" stroke="currentColor" strokeWidth="2" className="text-line" strokeLinecap="round" />
      {bars.map((bar, index) => (
        <g key={bar.x}>
          {/* Track */}
          <rect x={bar.x} y="28" width="44" height="120" rx="10" className="fill-ink/5" />
          {/* Fill. Grows from the baseline via a transform origin at the
              bottom, so the bar rises rather than fading in place. */}
          <rect
            x={bar.x}
            y={148 - bar.h}
            width="44"
            height={bar.h}
            rx="10"
            className="origin-bottom animate-scale-in motion-reduce:animate-none"
            style={{ animationDelay: `${index * 200}ms`, animationDuration: '700ms' }}
            fill={index === 1 ? 'rgb(124 58 237)' : 'rgb(10 102 194)'}
            opacity={0.85}
          />
          <circle
            cx={bar.x + 22}
            cy={148 - bar.h - 14}
            r="7"
            className="animate-float motion-reduce:animate-none fill-boost"
            style={{ animationDelay: `${index * 200}ms`, animationDuration: '4.5s' }}
          />
        </g>
      ))}
    </Frame>
  )
}

/** Community feed: overlapping speech bubbles arriving in turn. */
function CommunityFeedScene() {
  return (
    <Frame tint="bg-gradient-to-br from-accent/12 via-transparent to-primary/10">
      {[
        { x: 34, y: 30, w: 150, fill: 'fill-primary', text: 'fill-white/70' },
        { x: 118, y: 74, w: 168, fill: 'fill-card', text: 'fill-ink/20' },
        { x: 48, y: 118, w: 140, fill: 'fill-accent', text: 'fill-white/70' },
      ].map((bubble, index) => (
        <g
          key={bubble.y}
          className="animate-fade-up motion-reduce:animate-none"
          style={{ animationDelay: `${index * 220}ms`, animationDuration: '700ms' }}
        >
          <rect
            x={bubble.x}
            y={bubble.y}
            width={bubble.w}
            height="38"
            rx="14"
            className={[bubble.fill, bubble.fill === 'fill-card' ? 'stroke-line' : ''].join(' ')}
            strokeWidth="2"
          />
          <rect x={bubble.x + 16} y={bubble.y + 12} width={bubble.w * 0.5} height="6" rx="3" className={bubble.text} />
          <rect x={bubble.x + 16} y={bubble.y + 23} width={bubble.w * 0.3} height="6" rx="3" className={bubble.text} />
        </g>
      ))}
    </Frame>
  )
}

/** Browse communities: a grid of tiles, one lifting as if picked. */
function CommunityBrowseScene() {
  const tiles = [
    { x: 52, y: 30 },
    { x: 134, y: 30 },
    { x: 216, y: 30 },
    { x: 52, y: 100 },
    { x: 134, y: 100 },
    { x: 216, y: 100 },
  ]
  return (
    <Frame tint="bg-gradient-to-br from-primary/10 via-transparent to-accent/12">
      {tiles.map((tile, index) => (
        <g
          key={`${tile.x}-${tile.y}`}
          className={[
            index === 4 ? 'animate-float' : 'animate-scale-in',
            'motion-reduce:animate-none',
          ].join(' ')}
          style={{
            animationDelay: `${index * 110}ms`,
            animationDuration: index === 4 ? '4s' : '500ms',
          }}
        >
          <rect
            x={tile.x}
            y={tile.y}
            width="52"
            height="52"
            rx="14"
            className={index === 4 ? 'fill-primary' : 'fill-card stroke-line'}
            strokeWidth="2"
          />
          <circle
            cx={tile.x + 26}
            cy={tile.y + 22}
            r="8"
            className={index === 4 ? 'fill-white/80' : 'fill-primary/40'}
          />
          <rect
            x={tile.x + 13}
            y={tile.y + 36}
            width="26"
            height="5"
            rx="2.5"
            className={index === 4 ? 'fill-white/60' : 'fill-ink/15'}
          />
        </g>
      ))}
    </Frame>
  )
}

/** Leaderboard: a podium whose steps rise into place. */
function LeaderboardScene() {
  const steps = [
    { x: 62, h: 56, place: 2, fill: 'fill-ink/20' },
    { x: 134, h: 88, place: 1, fill: 'fill-boost' },
    { x: 206, h: 40, place: 3, fill: 'fill-accent/50' },
  ]
  return (
    <Frame tint="bg-gradient-to-br from-boost/12 via-transparent to-primary/10">
      <path d="M40 152h240" stroke="currentColor" strokeWidth="2" className="text-line" strokeLinecap="round" />
      {steps.map((step, index) => (
        <g
          key={step.place}
          className="origin-bottom animate-fade-up motion-reduce:animate-none"
          style={{ animationDelay: `${index * 180}ms`, animationDuration: '700ms' }}
        >
          <rect x={step.x} y={152 - step.h} width="52" height={step.h} rx="8" className={step.fill} />
          {/* Head of the person standing on it */}
          <circle cx={step.x + 26} cy={152 - step.h - 20} r="11" className="fill-primary/70" />
        </g>
      ))}
      {/* Trophy above first place */}
      <g className="animate-float motion-reduce:animate-none" style={{ animationDuration: '4s' }}>
        <path d="M148 24h24v12a12 12 0 0 1-24 0z" className="fill-boost" />
        <path d="M156 48h8v8h-8z" className="fill-boost" />
        <path d="M150 58h20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-boost" />
      </g>
    </Frame>
  )
}

/** Messages: two bubbles trading places along a thread. */
function MessagesScene() {
  return (
    <Frame tint="bg-gradient-to-br from-primary/12 via-transparent to-verified/10">
      {/* Thread line */}
      <path
        d="M40 90h240"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="6 8"
        className="text-line"
        strokeLinecap="round"
      />
      {/* Company side */}
      <g className="animate-fade-up motion-reduce:animate-none" style={{ animationDuration: '600ms' }}>
        <circle cx="56" cy="90" r="18" className="fill-primary" />
        <rect x="84" y="42" width="132" height="34" rx="13" className="fill-card stroke-line" strokeWidth="2" />
        <rect x="98" y="54" width="72" height="6" rx="3" className="fill-ink/20" />
        <rect x="98" y="64" width="48" height="6" rx="3" className="fill-ink/12" />
      </g>
      {/* Candidate side */}
      <g
        className="animate-fade-up motion-reduce:animate-none"
        style={{ animationDelay: '260ms', animationDuration: '600ms' }}
      >
        <circle cx="264" cy="90" r="18" className="fill-accent" />
        <rect x="104" y="104" width="132" height="34" rx="13" className="fill-primary" />
        <rect x="118" y="116" width="80" height="6" rx="3" className="fill-white/70" />
        <rect x="118" y="126" width="52" height="6" rx="3" className="fill-white/45" />
      </g>
      {/* The message in transit */}
      <circle r="5" className="fill-verified motion-reduce:hidden">
        <animateMotion dur="4s" repeatCount="indefinite" path="M74 90 L246 90 L74 90" />
      </circle>
    </Frame>
  )
}

const SCENES: Record<ArtworkScene, () => JSX.Element> = {
  walkins: WalkinsScene,
  jobs: JobsScene,
  'contest-dsa': DsaScene,
  'contest-domain': DomainScene,
  'contest-quant': QuantScene,
  'community-feed': CommunityFeedScene,
  'community-browse': CommunityBrowseScene,
  leaderboard: LeaderboardScene,
  messages: MessagesScene,
}

export default function SectionArtwork({ scene, className = '' }: SectionArtworkProps) {
  const Scene = SCENES[scene]
  // Keyed on the scene so switching tabs replays the entrance animations
  // rather than swapping in a composition that is already settled.
  return (
    <div className={className} key={scene}>
      <Scene />
    </div>
  )
}
