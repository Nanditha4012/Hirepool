import React from 'react'

/**
 * `inverse` / `outlineInverse` exist for buttons sitting on a dark photo or
 * gradient.
 *
 * They are real variants rather than something callers patch on with
 * `className="bg-white text-primary"`, because that silently does not work:
 * the override and the variant's own `bg-*`/`text-*` have identical
 * specificity, so which one applies is decided by their order in the
 * generated stylesheet, not by the order in the class attribute. Tailwind
 * emits `.text-white` after `.text-primary`, so `className="text-primary"`
 * lost to the primary variant's `text-white` — producing a white button with
 * white, invisible, label text.
 */
type Variant = 'primary' | 'secondary' | 'danger' | 'inverse' | 'outlineInverse'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90 disabled:bg-primary/50',
  secondary:
    'border border-primary text-primary bg-card hover:bg-primary/5 disabled:text-primary/40 disabled:border-primary/40',
  danger: 'bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50',
  inverse: 'bg-white text-primary shadow-soft hover:bg-white/90 disabled:bg-white/60',
  outlineInverse:
    'border-2 border-white/80 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:border-white disabled:border-white/40 disabled:text-white/50',
}

const sizeClasses: Record<Size, string> = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-base px-4 py-2.5',
  lg: 'text-lg px-6 py-3',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-card font-semibold',
        // `transition-all` rather than `transition-colors` so the active-state
        // scale below actually animates.
        'transition-all duration-200 active:scale-[0.97]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
