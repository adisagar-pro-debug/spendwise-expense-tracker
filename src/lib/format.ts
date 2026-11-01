const currencyLocales: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'en-IE',
  CAD: 'en-CA',
  AUD: 'en-AU',
  NZD: 'en-NZ',
  JPY: 'ja-JP',
  SGD: 'en-SG',
  HKD: 'en-HK',
  AED: 'en-AE',
  CHF: 'de-CH',
  ZAR: 'en-ZA',
}

function formatIndianCompact(amount: number): string {
  const isNegative = amount < 0
  const abs = Math.abs(amount)
  let formattedValue: string
  let suffix = ''

  if (abs >= 10_000_000) {
    // 1 Crore = 10,000,000 (100 Lakhs)
    const val = abs / 10_000_000
    formattedValue = val.toLocaleString('en-IN', {
      maximumFractionDigits: val < 10 ? 2 : 1,
      minimumFractionDigits: 0,
    })
    suffix = 'Cr'
  } else if (abs >= 100_000) {
    // 1 Lakh = 100,000
    const val = abs / 100_000
    formattedValue = val.toLocaleString('en-IN', {
      maximumFractionDigits: val < 10 ? 2 : 1,
      minimumFractionDigits: 0,
    })
    suffix = 'L'
  } else if (abs >= 1_000) {
    // Thousand = 1,000
    const val = abs / 1_000
    formattedValue = val.toLocaleString('en-IN', {
      maximumFractionDigits: val < 10 ? 1 : 0,
      minimumFractionDigits: 0,
    })
    suffix = 'K'
  } else {
    formattedValue = abs.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })
  }

  return `${isNegative ? '-' : ''}₹${formattedValue}${suffix}`
}

export function formatMoney(amount: number, currencyCode = 'USD', compact = false): string {
  const normalizedCode = (currencyCode || 'USD').toUpperCase().trim()

  if (normalizedCode === 'INR' && compact) {
    return formatIndianCompact(amount)
  }

  const locale = currencyLocales[normalizedCode] ?? 'en-US'

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCode,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? (normalizedCode === 'INR' ? 2 : 1) : 2,
      minimumFractionDigits: compact ? 0 : 2,
    }).format(amount)
  } catch {
    return `${normalizedCode} ${amount.toLocaleString(locale, { maximumFractionDigits: 2 })}`
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
