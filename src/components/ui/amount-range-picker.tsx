import * as React from 'react'
import { ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

interface AmountRangePickerProps {
  minAmount: string
  maxAmount: string
  onChange: (min: string, max: string) => void
  currencyCode?: string
  className?: string
}

function getCurrencySymbol(code: string): string {
  switch (code.toUpperCase()) {
    case 'INR': return '₹'
    case 'EUR': return '€'
    case 'GBP': return '£'
    case 'JPY': return '¥'
    case 'CAD': return 'C$'
    case 'AUD': return 'A$'
    default: return '$'
  }
}

export function AmountRangePicker({
  minAmount,
  maxAmount,
  onChange,
  currencyCode = 'INR',
  className = '',
}: AmountRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const symbol = getCurrencySymbol(currencyCode)

  const [localMin, setLocalMin] = React.useState(minAmount)
  const [localMax, setLocalMax] = React.useState(maxAmount)

  // Sync external changes
  React.useEffect(() => {
    setLocalMin(minAmount)
  }, [minAmount])

  React.useEffect(() => {
    setLocalMax(maxAmount)
  }, [maxAmount])

  const hasActiveFilter = Boolean(minAmount || maxAmount)

  const handleMinChange = (val: string) => {
    setLocalMin(val)
    onChange(val, localMax)
  }

  const handleMaxChange = (val: string) => {
    setLocalMax(val)
    onChange(localMin, val)
  }

  const handlePreset = (min: string, max: string) => {
    setLocalMin(min)
    setLocalMax(max)
    onChange(min, max)
  }

  const handleClear = () => {
    setLocalMin('')
    setLocalMax('')
    onChange('', '')
  }

  const getTriggerLabel = () => {
    if (!minAmount && !maxAmount) return 'Amount range'
    if (minAmount && maxAmount) return `${symbol}${minAmount} – ${symbol}${maxAmount}`
    if (minAmount) return `≥ ${symbol}${minAmount}`
    return `≤ ${symbol}${maxAmount}`
  }

  const presets = currencyCode === 'INR' ? [
    { label: `< ${symbol}500`, min: '', max: '500' },
    { label: `${symbol}500 – 2K`, min: '500', max: '2000' },
    { label: `${symbol}2K – 10K`, min: '2000', max: '10000' },
    { label: `> ${symbol}10K`, min: '10000', max: '' },
  ] : [
    { label: `< ${symbol}25`, min: '', max: '25' },
    { label: `${symbol}25 – 100`, min: '25', max: '100' },
    { label: `${symbol}100 – 500`, min: '100', max: '500' },
    { label: `> ${symbol}500`, min: '500', max: '' },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`shadcn-filter-trigger amount-trigger ${hasActiveFilter ? 'amount-trigger-active' : ''} ${className}`}
          aria-label="Filter transactions by amount range"
        >
          <SlidersHorizontal size={13} className="filter-icon" />
          {hasActiveFilter && <span className="filter-active-dot" aria-hidden="true" />}
          <span className="amount-trigger-text">{getTriggerLabel()}</span>
          {hasActiveFilter ? (
            <span
              role="button"
              tabIndex={0}
              className="amount-clear-inline"
              title="Clear amount filter"
              onClick={(e) => {
                e.stopPropagation()
                handleClear()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  handleClear()
                }
              }}
            >
              <X size={12} />
            </span>
          ) : (
            <ChevronDown size={13} className="trigger-chevron" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="amount-popover-content">
        <div className="amount-popover-header">
          <div>
            <strong>Filter by amount</strong>
            <span>Set minimum and maximum transaction limits</span>
          </div>
        </div>

        <div className="amount-inputs-grid">
          <div className="amount-input-box">
            <label htmlFor="amount-min-input">Minimum</label>
            <div className="amount-field-wrapper">
              <span className="amount-currency-prefix">{symbol}</span>
              <input
                id="amount-min-input"
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={localMin}
                onChange={(e) => handleMinChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setOpen(false) }}
              />
            </div>
          </div>

          <div className="amount-separator">to</div>

          <div className="amount-input-box">
            <label htmlFor="amount-max-input">Maximum</label>
            <div className="amount-field-wrapper">
              <span className="amount-currency-prefix">{symbol}</span>
              <input
                id="amount-max-input"
                type="number"
                min="0"
                step="any"
                placeholder="No limit"
                value={localMax}
                onChange={(e) => handleMaxChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setOpen(false) }}
              />
            </div>
          </div>
        </div>

        <div className="amount-presets">
          <span className="amount-presets-label">Quick presets:</span>
          <div className="amount-preset-chips">
            {presets.map((preset) => {
              const isActive = localMin === preset.min && localMax === preset.max
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`amount-preset-chip ${isActive ? 'amount-preset-chip-active' : ''}`}
                  onClick={() => handlePreset(preset.min, preset.max)}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="amount-popover-footer">
          <button
            type="button"
            className="amount-reset-button"
            onClick={handleClear}
            disabled={!hasActiveFilter && !localMin && !localMax}
          >
            <RotateCcw size={12} /> Reset
          </button>
          <button
            type="button"
            className="button button-small button-primary"
            onClick={() => setOpen(false)}
          >
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
