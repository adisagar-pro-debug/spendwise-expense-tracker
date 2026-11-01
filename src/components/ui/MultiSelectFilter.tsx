import React, { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export interface MultiSelectOption {
  value: string
  label: string
  count?: number
  color?: string
}

interface MultiSelectFilterProps {
  icon?: React.ReactNode
  allLabel: string
  selectedValues: string[] // Empty array means 'all' are included
  options: MultiSelectOption[]
  onChange: (selected: string[]) => void
  searchPlaceholder?: string
  ariaLabel?: string
  className?: string
}

export function MultiSelectFilter({
  icon,
  allLabel,
  selectedValues,
  options,
  onChange,
  searchPlaceholder = 'Search…',
  ariaLabel,
  className = '',
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const isAllSelected = selectedValues.length === 0 || selectedValues.length === options.length

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options
    const q = searchTerm.toLowerCase().trim()
    return options.filter((opt) => opt.label.toLowerCase().includes(q))
  }, [options, searchTerm])

  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      const next = selectedValues.filter((v) => v !== value)
      onChange(next)
    } else {
      const next = [...selectedValues, value]
      // If user selected all options individually, normalize to empty array (meaning All)
      if (next.length === options.length) {
        onChange([])
      } else {
        onChange(next)
      }
    }
  }

  const handleSelectAll = () => {
    onChange([])
  }

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    onChange([])
  }

  // Label text for trigger button
  const triggerLabel = useMemo(() => {
    if (isAllSelected) return allLabel
    if (selectedValues.length === 1) {
      const matched = options.find((o) => o.value === selectedValues[0])
      return matched ? matched.label : selectedValues[0]
    }
    const first = options.find((o) => o.value === selectedValues[0])
    const firstName = first ? first.label : selectedValues[0]
    return `${firstName} +${selectedValues.length - 1}`
  }, [isAllSelected, allLabel, selectedValues, options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`shadcn-filter-trigger multi-filter-trigger ${!isAllSelected ? 'multi-filter-active' : ''} ${className}`}
          aria-label={ariaLabel || allLabel}
          aria-expanded={open}
        >
          {icon && <span className="multi-filter-icon">{icon}</span>}
          {!isAllSelected && <span className="filter-active-dot" aria-hidden="true" />}
          <span className="multi-filter-label" title={triggerLabel}>{triggerLabel}</span>
          {!isAllSelected && selectedValues.length > 1 && (
            <span className="multi-filter-badge">{selectedValues.length}</span>
          )}
          {!isAllSelected ? (
            <span
              className="multi-filter-clear-icon"
              role="button"
              tabIndex={0}
              title={`Reset to ${allLabel}`}
              aria-label={`Reset to ${allLabel}`}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  handleClear()
                }
              }}
            >
              <X size={13} />
            </span>
          ) : (
            <ChevronDown size={14} className="multi-filter-chevron" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="multi-filter-popover">
        <div className="multi-filter-header">
          {options.length > 6 && (
            <div className="multi-filter-search-box">
              <Search size={14} />
              <input
                type="text"
                className="multi-filter-search-input"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  className="multi-filter-search-clear"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          <div className="multi-filter-actions-row">
            <button
              type="button"
              className={`multi-filter-quick-btn ${isAllSelected ? 'quick-btn-active' : ''}`}
              onClick={handleSelectAll}
            >
              {allLabel}
            </button>
            {!isAllSelected && (
              <button
                type="button"
                className="multi-filter-quick-btn"
                onClick={() => onChange([])}
              >
                Reset
              </button>
            )}
            <span className="multi-filter-selected-count">
              {isAllSelected ? 'All active' : `${selectedValues.length} of ${options.length} selected`}
            </span>
          </div>
        </div>

        <div className="multi-filter-list" role="listbox" aria-multiselectable="true">
          {filteredOptions.length === 0 ? (
            <div className="multi-filter-empty">No matches found</div>
          ) : (
            filteredOptions.map((option) => {
              const isChecked = !isAllSelected && selectedValues.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isChecked}
                  className={`multi-filter-item ${isChecked ? 'item-checked' : ''}`}
                  onClick={() => handleToggle(option.value)}
                >
                  <div className={`multi-filter-checkbox ${isChecked ? 'checkbox-checked' : ''}`}>
                    {isChecked && <Check size={11} strokeWidth={3} />}
                  </div>

                  {option.color && (
                    <span
                      className="multi-filter-color-dot"
                      style={{ backgroundColor: option.color }}
                    />
                  )}

                  <span className="multi-filter-item-label" title={option.label}>
                    {option.label}
                  </span>

                  {typeof option.count === 'number' && (
                    <span className="multi-filter-item-count">{option.count}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
