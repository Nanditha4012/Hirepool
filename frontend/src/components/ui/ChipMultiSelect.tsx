import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { dropdownEmptyClasses, dropdownListClasses, dropdownOptionClasses } from './Combobox'

export interface ChipMultiSelectOption {
  value: string
  label: string
}

interface ChipMultiSelectProps {
  label?: string
  error?: string
  placeholder?: string
  options: ChipMultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  maxItems?: number
  id?: string
  className?: string
}

const ChipMultiSelect = ({
  label,
  error,
  placeholder,
  options,
  value,
  onChange,
  maxItems,
  id,
  className = '',
}: ChipMultiSelectProps) => {
  const generatedId = useId()
  const fieldId = id || generatedId
  const listboxId = `${fieldId}-listbox`

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const atLimit = typeof maxItems === 'number' && value.length >= maxItems

  const selectedOptions = useMemo(
    () => value.map((v) => options.find((option) => option.value === v)).filter(
      (option): option is ChipMultiSelectOption => Boolean(option),
    ),
    [options, value],
  )

  const filteredOptions = useMemo(() => {
    const remaining = options.filter((option) => !value.includes(option.value))
    const q = query.trim().toLowerCase()
    if (!q) return remaining
    return remaining.filter((option) => option.label.toLowerCase().includes(q))
  }, [options, value, query])

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

  const addOption = (option: ChipMultiSelectOption) => {
    if (atLimit) return
    onChange([...value, option.value])
    setQuery('')
    setActiveIndex(-1)
    // Keep the dropdown open for fast repeated selection unless we just hit the cap.
    if (typeof maxItems === 'number' && value.length + 1 >= maxItems) {
      setOpen(false)
    }
  }

  const removeOption = (optionValue: string) => {
    onChange(value.filter((v) => v !== optionValue))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (atLimit) return
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true)
      setActiveIndex(-1)
      event.preventDefault()
      return
    }
    if (event.key === 'Backspace' && query === '' && value.length > 0) {
      removeOption(value[value.length - 1])
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
      if (option) addOption(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setQuery('')
      setActiveIndex(-1)
    }
  }

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          className={[
            'flex w-full flex-wrap items-center gap-1.5 rounded-card border px-2 py-1.5',
            'focus-within:ring-2 focus-within:ring-primary focus-within:border-primary',
            error ? 'border-danger' : 'border-gray-300',
            atLimit ? 'bg-surface' : '',
            className,
          ].join(' ')}
        >
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-sm text-primary"
            >
              {option.label}
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                onClick={() => removeOption(option.value)}
                className="text-primary/70 hover:text-primary"
              >
                ×
              </button>
            </span>
          ))}
          <input
            id={fieldId}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            disabled={atLimit}
            autoComplete="off"
            placeholder={selectedOptions.length === 0 ? placeholder : undefined}
            value={query}
            onFocus={() => {
              if (!atLimit) {
                setOpen(true)
                setActiveIndex(-1)
              }
            }}
            onClick={() => {
              if (!atLimit) setOpen(true)
            }}
            onChange={(event) => {
              setQuery(event.target.value)
              if (!open) setOpen(true)
              setActiveIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            className={[
              'min-w-[8ch] flex-1 border-none bg-transparent px-1 py-0.5 text-ink placeholder:text-ink/40',
              'focus:outline-none focus:ring-0',
              atLimit ? 'cursor-not-allowed text-ink/40' : '',
            ].join(' ')}
          />
        </div>
        {open && !atLimit && (
          <ul id={listboxId} role="listbox" className={dropdownListClasses}>
            {filteredOptions.length === 0 && <li className={dropdownEmptyClasses}>No results</li>}
            {filteredOptions.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={false}
                className={dropdownOptionClasses(index === activeIndex)}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addOption(option)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {typeof maxItems === 'number' && (
        <p className="text-xs text-ink/40">Up to {maxItems}</p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export default ChipMultiSelect
