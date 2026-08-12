/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based rather than media-based: the header has an explicit toggle,
  // so the user's choice has to win over their OS setting. ThemeProvider
  // (src/lib/themeStore.tsx) puts `.dark` on <html>.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --------------------------------------------------------------
        // Brand colours — fixed in both themes. These sit on their own
        // coloured surfaces (buttons, badges, photo overlays), so flipping
        // them per theme would break that contrast rather than help it.
        // --------------------------------------------------------------
        primary: '#0A66C2',
        'primary-dark': '#074A8C',
        'primary-light': '#3B8DE0',
        accent: '#7C3AED',
        verified: '#16A34A',
        boost: '#F59E0B',
        danger: '#DC2626',

        // --------------------------------------------------------------
        // Semantic surfaces — resolved from CSS custom properties defined
        // in index.css, so adding `.dark` to <html> re-themes every
        // existing `text-ink` / `bg-surface` / `border-line` in the app
        // without touching a single component class.
        //
        // The `<alpha-value>` placeholder is what keeps opacity modifiers
        // (text-ink/60, bg-card/85) working against a variable colour.
        // --------------------------------------------------------------
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        /** Page background. */
        page: 'rgb(var(--c-page) / <alpha-value>)',
        /** Raised surfaces: cards, header, table shells. */
        card: 'rgb(var(--c-card) / <alpha-value>)',
        /** Default border/divider colour. */
        line: 'rgb(var(--c-line) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      borderRadius: {
        card: '12px',
      },
      maxWidth: {
        /**
         * The width of a page's content column.
         *
         * Every signed-in page used to pick its own `max-w-4xl`/`5xl`/`6xl`,
         * and the most common of those (5xl = 1024px) left roughly 15% of a
         * 1440px laptop screen empty down each side — the app rendered as a
         * narrow strip with the dashboard tables and candidate grids
         * squeezed into the middle of an otherwise blank display. One shared
         * token means the header, the footer and the page under them all
         * line up, and widening the app later is one number rather than
         * sixty class strings.
         *
         * Wide enough to use a laptop properly, still capped so a 4K monitor
         * doesn't stretch a table into an unreadable 3000px line.
         */
        app: '1600px',
        /**
         * For the handful of pages that are one column of prose or messages
         * rather than a grid — a conversation thread, a graded test report.
         * Still far wider than the 896px they used to be, but short of the
         * point where a paragraph becomes an unreadable single line.
         */
        'app-narrow': '1120px',
      },
      boxShadow: {
        soft: '0 2px 8px rgba(0,0,0,0.06)',
        lift: '0 12px 32px -8px rgba(10, 102, 194, 0.28)',
        glow: '0 0 0 4px rgba(10, 102, 194, 0.12)',
      },
      keyframes: {
        // The brand loader: each letter of "Hirepool" runs this with a
        // staggered delay, producing a wave. Scale/colour move with the
        // bounce so it reads as alive rather than a jitter.
        dance: {
          '0%, 60%, 100%': { transform: 'translateY(0) scale(1)' },
          '30%': { transform: 'translateY(-38%) scale(1.12)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        // Skeleton placeholder sweep.
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },

        // ----------------------------------------------------------------
        // Landing-page scenery. All slow and wide-amplitude on purpose:
        // this is a storybook backdrop, not UI feedback, so the motion has
        // to be noticeable at a glance and never draw the eye off the copy
        // sitting on top of it.
        // ----------------------------------------------------------------

        /** Clouds crossing the sky. Full width, so it must run linear. */
        drift: {
          from: { transform: 'translateX(-25%)' },
          to: { transform: 'translateX(125%)' },
        },
        /** Grass and treetops leaning in a breeze. */
        sway: {
          '0%, 100%': { transform: 'rotate(-2.5deg)' },
          '50%': { transform: 'rotate(2.5deg)' },
        },
        /** A character breathing / hovering, smaller than `float`. */
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        /** Birds flapping — a squash on the vertical axis reads as wings. */
        flap: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(0.45)' },
        },
        /** Sun and lantern glow. */
        'pulse-glow': {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.08)' },
        },
        /** Dust motes and pollen rising through a sunbeam. */
        rise: {
          from: { transform: 'translateY(0)', opacity: '0' },
          '15%': { opacity: '0.9' },
          '85%': { opacity: '0.9' },
          to: { transform: 'translateY(-140px)', opacity: '0' },
        },
      },
      animation: {
        dance: 'dance 1s ease-in-out infinite',
        'fade-up': 'fade-up 0.5s ease-out both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.3s ease-out both',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'gradient-pan': 'gradient-pan 12s ease infinite',
        // Scenery. Durations are long and mutually prime-ish so the layers
        // never fall into a visible shared rhythm.
        drift: 'drift 48s linear infinite',
        'drift-slow': 'drift 78s linear infinite',
        sway: 'sway 5.5s ease-in-out infinite',
        bob: 'bob 3.4s ease-in-out infinite',
        flap: 'flap 0.5s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 6s ease-in-out infinite',
        rise: 'rise 9s linear infinite',
      },
    },
  },
  plugins: [],
}
