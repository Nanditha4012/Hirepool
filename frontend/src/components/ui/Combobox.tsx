import React, { useEffect, useId, useMemo, useRef, useState } from 'react'

export interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  label?: string
  error?: string
  placeholder?: string
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  allowClear?: boolean
  disabled?: boolean
  id?: string
  className?: string
}

// Shared visual classes for the dropdown listbox + its options, kept in one
// place so Combobox and ChipMultiSelect render identically.
export const dropdownListClasses =
  'absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-card border border-line bg-card py-1 shadow-soft'

export const dropdownOptionClasses = (active: boolean) =>
  [
    'cursor-pointer px-3 py-2 text-sm',
    active ? 'bg-primary/10 text-primary' : 'text-ink hover:bg-surface',
  ].join(' ')

export const dropdownEmptyClasses = 'px-3 py-2 text-sm text-ink/40'

const Combobox = ({
  label,
  error,
  placeholder,
  options,
  value,
  onChange,
  allowClear = true,
  disabled,
  id,
  className = '',
}: ComboboxProps) => {
  const generatedId = useId()
  const comboId = id || generatedId
  const listboxId = `${comboId}-listbox`

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value],
  )

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) => option.label.toLowerCase().includes(q))
  }, [options, query])

  // Click-outside closes the dropdown without changing selection.
  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const openDropdown = () => {
    if (disabled) return
    setOpen(true)
    setActiveIndex(-1)
  }

  const selectOption = (option: ComboboxOption) => {
    onChange(option.value)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      openDropdown()
      event.preventDefault()
      return
    }
    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (prev + 1 >= filteredOptions.length ? 0 : prev + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (prev - 1 < 0 ? filteredOptions.length - 1 : prev - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filteredOptions[activeIndex]
      if (option) selectOption(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setQuery('')
      setActiveIndex(-1)
    }
  }

  const displayValue = open ? query : selectedOption ? selectedOption.label : ''

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      {label && (
        <label htmlFor={comboId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={comboId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${comboId}-error` : undefined}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          value={displayValue}
          onFocus={openDropdown}
          onClick={openDropdown}
          onChange={(event) => {
            setQuery(event.target.value)
            if (!open) setOpen(true)
            setActiveIndex(-1)
          }}
          onKeyDown={handleKeyDown}
          className={[
            'w-full rounded-card border px-3 py-2 text-ink placeholder:text-ink/40',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            error ? 'border-danger' : 'border-line',
            disabled ? 'cursor-not-allowed bg-surface text-ink/40' : '',
            allowClear && selectedOption ? 'pr-8' : '',
            className,
          ].join(' ')}
        />
        {allowClear && selectedOption && !disabled && (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => {
              onChange(null)
              setQuery('')
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
          >
            ×
          </button>
        )}
        {open && (
          <ul id={listboxId} role="listbox" className={dropdownListClasses}>
            {filteredOptions.length === 0 && <li className={dropdownEmptyClasses}>No results</li>}
            {filteredOptions.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={dropdownOptionClasses(index === activeIndex)}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  // Prevent input blur before the click handler fires.
                  event.preventDefault()
                }}
                onClick={() => selectOption(option)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p id={`${comboId}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export default Combobox
