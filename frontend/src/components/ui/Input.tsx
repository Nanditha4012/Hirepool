import React, { forwardRef, useId } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...rest }, ref) => {
    const generatedId = useId()
    const inputId = id || generatedId

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={[
            'rounded-card border px-3 py-2 text-ink placeholder:text-ink/40',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            error ? 'border-danger' : 'border-gray-300',
            className,
          ].join(' ')}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...rest}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

export default Input
