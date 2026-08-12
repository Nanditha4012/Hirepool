/**
 * The landing hero's illustrated backdrop.
 *
 * A hand-drawn storybook landscape rather than the stock photograph that was
 * here: layered hills receding into haze, clouds crossing the sky at
 * different speeds, birds, swaying grass, and — the part that carries the
 * product's actual claim — a lone figure standing still on a hill while
 * lit windows drift *toward* them. That is the pitch in one picture:
 * companies come to you.
 *
 * All SVG, no image request. Which matters more than usual on this screen:
 * the hero is the first paint of the first page a visitor ever sees, and the
 * old version had a full-bleed CDN photo in front of the copy, so the
 * headline landed on a flat gradient and then the picture arrived underneath
 * it. Nothing here can fail to load or shift the layout.
 *
 * Depth comes from the parallax layer speeds (far clouds slower than near
 * ones, back hills static, foreground grass swaying) and from atmospheric
 * perspective — each hill band is lighter and bluer than the one in front of
 * it, which is what makes a flat SVG read as distance.
 *
 * Every animated element carries `motion-reduce:animate-none`; with motion
 * reduced this becomes a still illustration rather than an empty box.
 */

/** One drifting cloud. `top`/`scale`/`delay` place it in its layer. */
function Cloud({
  top,
  scale,
  delay,
  slow = false,
  opacity = 0.9,
}: {
  top: string
  scale: number
  delay: string
  slow?: boolean
  opacity?: number
}) {
  return (
    <div
      className={[
        'pointer-events-none absolute left-0 motion-reduce:animate-none',
        slow ? 'animate-drift-slow' : 'animate-drift',
      ].join(' ')}
      style={{ top, animationDelay: delay }}
      aria-hidden="true"
    >
      <svg
        width={220 * scale}
        height={80 * scale}
        viewBox="0 0 220 80"
        fill="white"
        style={{ opacity }}
      >
        <ellipse cx="60" cy="52" rx="52" ry="26" />
        <ellipse cx="108" cy="38" rx="46" ry="32" />
        <ellipse cx="158" cy="52" rx="44" ry="24" />
        <rect x="58" y="50" width="102" height="26" rx="13" />
      </svg>
    </div>
  )
}

/** A small flock. Each bird flaps on its own offset so they aren't in lockstep. */
function Birds({ className, delay }: { className: string; delay: string }) {
  return (
    <div className={['pointer-events-none absolute', className].join(' ')} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <svg
          key={index}
          width="26"
          height="14"
          viewBox="0 0 26 14"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          className="absolute animate-flap opacity-70 motion-reduce:animate-none"
          style={{
            left: `${index * 34}px`,
            top: `${index === 1 ? -12 : 0}px`,
            animationDelay: `calc(${delay} + ${index * 0.13}s)`,
          }}
        >
          <path d="M2 9C6 3 9 3 13 8c4-5 7-5 11 1" />
        </svg>
      ))}
    </div>
  )
}

/**
 * A drifting window of light — a company, coming to the candidate.
 *
 * Deliberately abstract: a lit window is legible at this scale where a logo
 * or a building would be mush, and it keeps the metaphor (someone is in
 * there, looking for you) without naming a company that does not exist.
 */
function DriftingOffer({
  left,
  top,
  delay,
  hue,
}: {
  left: string
  top: string
  delay: string
  hue: string
}) {
  return (
    <div
      className="pointer-events-none absolute animate-float motion-reduce:animate-none"
      style={{ left, top, animationDelay: delay, animationDuration: '7s' }}
      aria-hidden="true"
    >
      <svg width="54" height="66" viewBox="0 0 54 66">
        {/* Lantern body */}
        <rect x="6" y="10" width="42" height="46" rx="8" fill={hue} opacity="0.92" />
        <rect x="6" y="10" width="42" height="46" rx="8" fill="white" opacity="0.12" />
        {/* Window panes */}
        <rect x="14" y="19" width="11" height="11" rx="2.5" fill="white" opacity="0.85" />
        <rect x="29" y="19" width="11" height="11" rx="2.5" fill="white" opacity="0.55" />
        <rect x="14" y="35" width="11" height="11" rx="2.5" fill="white" opacity="0.55" />
        <rect x="29" y="35" width="11" height="11" rx="2.5" fill="white" opacity="0.85" />
        {/* Hanger */}
        <path d="M27 10V3" stroke="white" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />
        {/* Glow */}
        <circle
          cx="27"
          cy="33"
          r="26"
          fill={hue}
          opacity="0.3"
          className="animate-pulse-glow motion-reduce:animate-none"
          style={{ animationDelay: delay }}
        />
      </svg>
    </div>
  )
}

export default function HeroScene() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* ---- Sky ---- */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1e3a8a] via-[#0A66C2] to-[#7C3AED]" />

      {/* Sun, low and warm, behind everything */}
      <div className="absolute left-[14%] top-[18%] h-40 w-40 -translate-x-1/2 rounded-full bg-boost/50 blur-2xl animate-pulse-glow motion-reduce:animate-none" />
      <div className="absolute left-[14%] top-[18%] h-20 w-20 -translate-x-1/2 rounded-full bg-boost/80 blur-md" />

      {/* ---- Clouds: three parallax layers ---- */}
      <Cloud top="8%" scale={1.5} delay="0s" slow opacity={0.28} />
      <Cloud top="22%" scale={1.0} delay="-16s" opacity={0.4} />
      <Cloud top="14%" scale={0.7} delay="-34s" slow opacity={0.22} />
      <Cloud top="34%" scale={0.55} delay="-8s" opacity={0.3} />

      <Birds className="left-[22%] top-[26%]" delay="0s" />
      <Birds className="left-[68%] top-[18%] scale-75" delay="0.2s" />

      {/* ---- Drifting offers, converging on the figure ---- */}
      <DriftingOffer left="62%" top="34%" delay="0s" hue="#F59E0B" />
      <DriftingOffer left="76%" top="46%" delay="1.4s" hue="#16A34A" />
      <DriftingOffer left="70%" top="60%" delay="2.6s" hue="#3B8DE0" />

      {/* ---- Hills. Back to front, each darker and greener than the last:
              atmospheric perspective is what sells the depth. ---- */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[62%] w-full"
        viewBox="0 0 1440 420"
        preserveAspectRatio="none"
      >
        {/* Furthest ridge — nearly sky-coloured */}
        <path
          d="M0 250 C 180 190, 300 240, 460 215 S 760 150, 940 200 S 1240 245, 1440 195 L1440 420 L0 420Z"
          fill="#5B8FD4"
          opacity="0.55"
        />
        {/* Middle */}
        <path
          d="M0 300 C 220 250, 380 300, 560 275 S 880 225, 1080 275 S 1300 310, 1440 265 L1440 420 L0 420Z"
          fill="#2F6FBA"
          opacity="0.75"
        />
        {/* Near hill — the one the figure stands on */}
        <path
          d="M0 355 C 260 300, 420 350, 640 330 S 980 290, 1180 335 S 1340 360, 1440 335 L1440 420 L0 420Z"
          fill="#1B4E8C"
        />
        {/* Foreground bank */}
        <path
          d="M0 392 C 300 362, 560 400, 820 382 S 1220 366, 1440 392 L1440 420 L0 420Z"
          fill="#12365F"
        />
      </svg>

      {/* ---- The figure: still, while the offers come to them ---- */}
      <div className="absolute bottom-[19%] left-[30%] animate-bob motion-reduce:animate-none">
        <svg width="64" height="96" viewBox="0 0 64 96" aria-hidden="true">
          {/* Long shadow cast toward the light */}
          <ellipse cx="32" cy="92" rx="21" ry="4.5" fill="#0B2444" opacity="0.55" />
          {/* Body */}
          <path d="M32 40c9 0 15 7 16 16l2 30H14l2-30c1-9 7-16 16-16z" fill="#0F2E52" />
          {/* Bag strap — a job hunt, not a stroll */}
          <path d="M22 46 L42 68" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
          {/* Head */}
          <circle cx="32" cy="27" r="13" fill="#0F2E52" />
          {/* Rim light from the sun, on the correct side */}
          <path d="M22 20a13 13 0 0 1 8-6" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.75" />
        </svg>
      </div>

      {/* ---- Foreground grass, swaying. Rendered last so it overlaps the
              figure's feet and completes the depth stack. ---- */}
      <div className="absolute inset-x-0 bottom-0 flex h-24 items-end justify-between px-2">
        {Array.from({ length: 40 }).map((_, index) => (
          <svg
            key={index}
            width="16"
            height="46"
            viewBox="0 0 16 46"
            className="origin-bottom animate-sway opacity-70 motion-reduce:animate-none"
            style={{
              animationDelay: `${(index % 7) * 0.4}s`,
              animationDuration: `${4.5 + (index % 5) * 0.5}s`,
              height: `${28 + ((index * 13) % 22)}px`,
            }}
            aria-hidden="true"
          >
            <path d="M8 46 C 5 32, 3 20, 1 6" stroke="#0B2A4D" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M8 46 C 9 32, 11 22, 14 12" stroke="#0B2A4D" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
        ))}
      </div>

      {/* Pollen drifting up through the sun's light */}
      {Array.from({ length: 14 }).map((_, index) => (
        <span
          key={index}
          className="absolute bottom-[14%] h-1.5 w-1.5 rounded-full bg-boost/70 animate-rise motion-reduce:hidden"
          style={{
            left: `${6 + index * 6.7}%`,
            animationDelay: `${(index % 9) * 1.1}s`,
            animationDuration: `${8 + (index % 4) * 2}s`,
          }}
          aria-hidden="true"
        />
      ))}

      {/* Legibility scrim. Last in the stack so it sits over the whole scene
          — the headline has to hold contrast against every layer above. */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/45 via-slate-950/25 to-slate-950/50" />
    </div>
  )
}
