import * as React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { formatDate } from '../../lib/format'

export interface DateRange {
  from: string
  to: string
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  placeholder?: string
  className?: string
  align?: 'start' | 'center' | 'end'
}

function parseISODate(iso: string): Date | null {
  if (!iso) return null
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Pick a date range',
  className = '',
  align = 'start',
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  // Initialize view date based on 'from' or current date
  const initialDate = parseISODate(value.to) || parseISODate(value.from) || new Date()
  const [viewYear, setViewYear] = React.useState(initialDate.getFullYear())
  const [viewMonth, setViewMonth] = React.useState(initialDate.getMonth())

  // Hover state for range selection
  const [hoverDate, setHoverDate] = React.useState<string | null>(null)
  const [selectingFrom, setSelectingFrom] = React.useState<string | null>(null)

  // Keep view in sync when value changes externally
  React.useEffect(() => {
    if (value.to) {
      const d = parseISODate(value.to)
      if (d) {
        setViewYear(d.getFullYear())
        setViewMonth(d.getMonth())
      }
    } else if (value.from) {
      const d = parseISODate(value.from)
      if (d) {
        setViewYear(d.getFullYear())
        setViewMonth(d.getMonth())
      }
    }
  }, [value.from, value.to])

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const handleDayClick = (isoString: string) => {
    if (!selectingFrom) {
      // First click: set start date
      setSelectingFrom(isoString)
      setHoverDate(null)
    } else {
      // Second click: set range
      let from = selectingFrom
      let to = isoString
      if (from > to) {
        const temp = from
        from = to
        to = temp
      }
      onChange({ from, to })
      setSelectingFrom(null)
      setHoverDate(null)
      setOpen(false)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ from: '', to: '' })
    setSelectingFrom(null)
    setHoverDate(null)
  }

  // Quick Presets
  const applyPreset = (preset: 'thisMonth' | 'lastMonth' | 'thisYear' | 'allTime') => {
    const today = new Date()
    let from = ''
    let to = ''

    if (preset === 'thisMonth') {
      from = toISODate(new Date(today.getFullYear(), today.getMonth(), 1))
      to = toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    } else if (preset === 'lastMonth') {
      from = toISODate(new Date(today.getFullYear(), today.getMonth() - 1, 1))
      to = toISODate(new Date(today.getFullYear(), today.getMonth(), 0))
    } else if (preset === 'thisYear') {
      from = toISODate(new Date(today.getFullYear(), 0, 1))
      to = toISODate(today)
    } else if (preset === 'allTime') {
      from = ''
      to = ''
    }

    onChange({ from, to })
    setSelectingFrom(null)
    setHoverDate(null)
    setOpen(false)
  }

  // Compute calendar grid
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay() // 0 = Sunday

  const days: Array<{ dayNum: number; iso: string; currentMonth: boolean }> = []

  // Trailing days from previous month
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = viewMonth === 0 ? 12 : viewMonth
    const y = viewMonth === 0 ? viewYear - 1 : viewYear
    days.push({
      dayNum: d,
      iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      currentMonth: false,
    })
  }

  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      dayNum: d,
      iso: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      currentMonth: true,
    })
  }

  // Leading days of next month to complete row of 7
  const remainder = 7 - (days.length % 7)
  if (remainder < 7) {
    for (let d = 1; d <= remainder; d++) {
      const m = viewMonth === 11 ? 1 : viewMonth + 2
      const y = viewMonth === 11 ? viewYear + 1 : viewYear
      days.push({
        dayNum: d,
        iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        currentMonth: false,
      })
    }
  }

  // Determine selection bounds
  const activeFrom = selectingFrom || value.from
  let activeTo = selectingFrom ? (hoverDate || selectingFrom) : value.to

  let rangeStart = activeFrom
  let rangeEnd = activeTo
  if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
    rangeStart = activeTo
    rangeEnd = activeFrom
  }

  // Format trigger label
  let triggerLabel = placeholder
  const hasRange = Boolean(value.from || value.to)
  if (value.from && value.to) {
    const today = new Date()
    const thisMonthStart = toISODate(new Date(today.getFullYear(), today.getMonth(), 1))
    const thisMonthEnd = toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    const lastMonthStart = toISODate(new Date(today.getFullYear(), today.getMonth() - 1, 1))
    const lastMonthEnd = toISODate(new Date(today.getFullYear(), today.getMonth(), 0))
    const thisYearStart = toISODate(new Date(today.getFullYear(), 0, 1))
    const thisYearEnd = toISODate(today)

    if (value.from === thisMonthStart && (value.to === thisMonthEnd || value.to === toISODate(today))) {
      triggerLabel = 'This month'
    } else if (value.from === lastMonthStart && value.to === lastMonthEnd) {
      triggerLabel = 'Last month'
    } else if (value.from === thisYearStart && (value.to === thisYearEnd || value.to === `${today.getFullYear()}-12-31`)) {
      triggerLabel = 'This year'
    } else if (value.from === value.to) {
      triggerLabel = formatDate(value.from, { month: 'short', day: 'numeric', year: 'numeric' })
    } else {
      triggerLabel = `${formatDate(value.from, { month: 'short', day: 'numeric', year: '2-digit' })} – ${formatDate(value.to, { month: 'short', day: 'numeric', year: '2-digit' })}`
    }
  } else if (value.from) {
    triggerLabel = `From ${formatDate(value.from, { month: 'short', day: 'numeric', year: '2-digit' })}`
  } else if (value.to) {
    triggerLabel = `Until ${formatDate(value.to, { month: 'short', day: 'numeric', year: '2-digit' })}`
  } else {
    triggerLabel = placeholder || 'All time'
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`shadcn-daterange-trigger ${hasRange ? 'has-value' : ''} ${className}`}
          aria-label="Filter date range"
        >
          <CalendarDays size={14} className="shadcn-daterange-icon" />
          {hasRange && <span className="filter-active-dot" aria-hidden="true" />}
          <span className="shadcn-daterange-text">{triggerLabel}</span>
          {hasRange ? (
            <span
              role="button"
              tabIndex={0}
              className="shadcn-daterange-clear"
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClear(e as unknown as React.MouseEvent) }}
              title="Clear date range"
            >
              <X size={13} />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="shadcn-daterange-popover">
        <div className="shadcn-calendar-container">
          {/* Quick presets sidebar */}
          <div className="shadcn-calendar-presets">
            <span className="shadcn-preset-label">Presets</span>
            <button type="button" className="shadcn-preset-btn" onClick={() => applyPreset('thisMonth')}>This month</button>
            <button type="button" className="shadcn-preset-btn" onClick={() => applyPreset('lastMonth')}>Last month</button>
            <button type="button" className="shadcn-preset-btn" onClick={() => applyPreset('thisYear')}>This year</button>
            <button type="button" className="shadcn-preset-btn" onClick={() => applyPreset('allTime')}>All time</button>
          </div>

          {/* Calendar view */}
          <div className="shadcn-calendar-main">
            {/* Calendar header with month & year navigation */}
            <div className="shadcn-calendar-header">
              <button
                type="button"
                className="shadcn-calendar-nav-btn"
                onClick={handlePrevMonth}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="shadcn-calendar-title">
                <strong>{MONTH_NAMES[viewMonth]}</strong>
                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  className="shadcn-calendar-year-select"
                  aria-label="Select calendar year"
                >
                  {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - 10 + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="shadcn-calendar-nav-btn"
                onClick={handleNextMonth}
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Days of week */}
            <div className="shadcn-calendar-weekdays">
              {DAY_LABELS.map((day) => (
                <div key={day} className="shadcn-weekday-label">{day}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="shadcn-calendar-days">
              {days.map((d) => {
                const isStart = rangeStart === d.iso
                const isEnd = rangeEnd === d.iso
                const isInRange = Boolean(rangeStart && rangeEnd && d.iso > rangeStart && d.iso < rangeEnd)
                const isSelected = isStart || isEnd

                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => handleDayClick(d.iso)}
                    onMouseEnter={() => { if (selectingFrom) setHoverDate(d.iso) }}
                    className={`shadcn-calendar-day
                      ${!d.currentMonth ? 'other-month' : ''}
                      ${isSelected ? 'is-selected' : ''}
                      ${isStart ? 'range-start' : ''}
                      ${isEnd ? 'range-end' : ''}
                      ${isInRange ? 'in-range' : ''}
                    `}
                  >
                    <span>{d.dayNum}</span>
                  </button>
                )
              })}
            </div>

            {/* Hint / Helper footer */}
            <div className="shadcn-calendar-footer">
              <span>{selectingFrom ? 'Click a second date to complete range' : 'Click a date to start selection'}</span>
              {hasRange && (
                <button type="button" className="shadcn-calendar-reset-btn" onClick={handleClear}>
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
