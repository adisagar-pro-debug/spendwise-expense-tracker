export function formatMoney(amount: number, currencyCode = 'USD', compact = false): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currencyCode} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  }
}

export function localISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('en-US', options).format(parsed)
}

export function relativeDate(date: string): string {
  const target = new Date(`${date}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const days = Math.round((today.getTime() - target.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
}

export function csvEscape(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
