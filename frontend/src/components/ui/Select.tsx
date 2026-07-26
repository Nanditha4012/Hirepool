import React, { forwardRef, useId } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
}

// Plain native <select> primitive. A searchable combobox is Phase 2 scope
// per the build spec — this only needs to work end to end for now.
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, id, className = '', ...rest }, ref) => {
    const generatedId = useId()
    const selectId = id || generatedId

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={[
            'rounded-card border bg-white px-3 py-2 text-ink',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            error ? 'border-danger' : 'border-gray-300',
            className,
          ].join(' ')}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${selectId}-error` : undefined}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={`${selectId}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    )
  },
)

Select.displayName = 'Select'

export default Select
