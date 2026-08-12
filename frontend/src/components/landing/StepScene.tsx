export type StepSceneName = 'verify' | 'discover' | 'connect'

/**
 * The illustrated header for each "How it works" card.
 *
 * Same argument as HeroScene, one level down: these were three stock photos
 * of people at desks, which said nothing about the three steps and cost three
 * lazy-loaded CDN requests on the marketing page. Each of these draws the
 * step it actually describes — a checklist being ticked, a profile surfacing
 * in a search, a company reaching out — and animates on a loop so the row of
 * cards has life in it without a hover being required.
 *
 * Drawn in the same palette as the hero so the page reads as one illustrated
 * world rather than three unrelated graphics. Motion-reduce safe throughout.
 */

/** Step 1 — a human reviewer ticking a profile field by field. */
function VerifyScene() {
  const rows = [
    { y: 30, w: 96, delay: '0s' },
    { y: 58, w: 120, delay: '0.5s' },
    { y: 86, w: 80, delay: '1s' },
    { y: 114, w: 108, delay: '1.5s' },
  ]
  return (
    <svg viewBox="0 0 320 176" className="h-full w-full">
      {/* Document */}
      <rect x="52" y="14" width="180" height="150" rx="12" fill="white" opacity="0.95" />
      <rect x="52" y="14" width="180" height="150" rx="12" fill="none" stroke="#0A66C2" strokeOpacity="0.2" strokeWidth="2" />

      {rows.map((row) => (
        <g key={row.y}>
          <rect x="76" y={row.y} width={row.w} height="9" rx="4.5" fill="#0A66C2" opacity="0.18" />
          {/* The tick, drawn on as if being marked off */}
          <g
            className="origin-center animate-scale-in motion-reduce:animate-none"
            style={{ animationDelay: row.delay, animationDuration: '600ms' }}
          >
            <circle cx="212" cy={row.y + 4} r="9" fill="#16A34A" opacity="0.15" />
            <path
              d={`M207.5 ${row.y + 4} l3.2 3.4 6-7`}
              stroke="#16A34A"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        </g>
      ))}

      {/* Reviewer's magnifier, moving down the list */}
      <g className="animate-bob motion-reduce:animate-none" style={{ animationDuration: '4s' }}>
        <circle cx="252" cy="74" r="21" fill="none" stroke="#F59E0B" strokeWidth="5" />
        <path d="M267 89 L282 104" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round" />
        <circle cx="252" cy="74" r="21" fill="white" opacity="0.14" />
      </g>
    </svg>
  )
}

/** Step 2 — the verified profile surfacing above the rest. */
function DiscoverScene() {
  return (
    <svg viewBox="0 0 320 176" className="h-full w-full">
      {/* The other candidates, dimmed */}
      {[
        { x: 34, y: 96 },
        { x: 104, y: 110 },
        { x: 216, y: 106 },
        { x: 262, y: 118 },
      ].map((card, index) => (
        <g key={card.x} opacity="0.35">
          <rect x={card.x} y={card.y} width="46" height="56" rx="10" fill="white" />
          <circle cx={card.x + 23} cy={card.y + 18} r="9" fill="#0A66C2" opacity="0.4" />
          <rect x={card.x + 10} y={card.y + 33} width="26" height="5" rx="2.5" fill="#0A66C2" opacity="0.3" />
          <rect
            x={card.x + 14}
            y={card.y + 43}
            width="18"
            height="5"
            rx="2.5"
            fill="#0A66C2"
            opacity="0.2"
            style={{ animationDelay: `${index * 0.3}s` }}
          />
        </g>
      ))}

      {/* The verified one, lifted and lit */}
      <g className="animate-float motion-reduce:animate-none" style={{ animationDuration: '5s' }}>
        <circle cx="160" cy="74" r="52" fill="#F59E0B" opacity="0.18" className="animate-pulse-glow motion-reduce:animate-none" />
        <rect x="130" y="34" width="60" height="76" rx="13" fill="white" />
        <circle cx="160" cy="60" r="13" fill="#0A66C2" />
        <rect x="141" y="80" width="38" height="6" rx="3" fill="#0A66C2" opacity="0.4" />
        <rect x="148" y="92" width="24" height="6" rx="3" fill="#0A66C2" opacity="0.25" />
        {/* Verified tick badge */}
        <circle cx="186" cy="42" r="12" fill="#16A34A" />
        <path
          d="M180.5 42 l4 4 7.5-8"
          stroke="white"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  )
}

/** Step 3 — a company reaching out, and the contact unlocking. */
function ConnectScene() {
  return (
    <svg viewBox="0 0 320 176" className="h-full w-full">
      {/* Company side */}
      <g>
        <rect x="26" y="52" width="76" height="76" rx="14" fill="white" opacity="0.95" />
        <rect x="40" y="70" width="20" height="20" rx="4" fill="#0A66C2" opacity="0.55" />
        <rect x="68" y="70" width="20" height="20" rx="4" fill="#0A66C2" opacity="0.3" />
        <rect x="40" y="98" width="20" height="20" rx="4" fill="#0A66C2" opacity="0.3" />
        <rect x="68" y="98" width="20" height="20" rx="4" fill="#0A66C2" opacity="0.55" />
      </g>

      {/* Candidate side */}
      <g>
        <circle cx="256" cy="72" r="21" fill="white" opacity="0.95" />
        <path d="M256 98a30 30 0 0 0-28 30h56a30 30 0 0 0-28-30z" fill="white" opacity="0.95" />
      </g>

      {/* The path between them */}
      <path
        d="M110 90 C 150 90, 170 82, 210 82"
        stroke="white"
        strokeOpacity="0.45"
        strokeWidth="2.5"
        strokeDasharray="7 8"
        fill="none"
        strokeLinecap="round"
      />

      {/* The message travelling it */}
      <g className="motion-reduce:hidden">
        <circle r="9" fill="#F59E0B">
          <animateMotion dur="3.4s" repeatCount="indefinite" path="M110 90 C 150 90, 170 82, 210 82" />
        </circle>
      </g>

      {/* The unlock — the moment being paid for */}
      <g className="animate-bob motion-reduce:animate-none" style={{ animationDuration: '3.2s' }}>
        <rect x="146" y="28" width="34" height="26" rx="6" fill="#16A34A" />
        <path
          d="M153 28v-6a10 10 0 0 1 19-4"
          stroke="#16A34A"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="163" cy="41" r="4" fill="white" />
      </g>
    </svg>
  )
}

const SCENES: Record<StepSceneName, () => JSX.Element> = {
  verify: VerifyScene,
  discover: DiscoverScene,
  connect: ConnectScene,
}

export default function StepScene({ scene }: { scene: StepSceneName }) {
  const Scene = SCENES[scene]
  return (
    <div
      className="relative h-full w-full bg-gradient-to-br from-primary-dark via-primary to-accent"
      aria-hidden="true"
    >
      <Scene />
    </div>
  )
}
