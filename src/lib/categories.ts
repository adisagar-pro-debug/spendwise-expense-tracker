import type { Category, CategoryResult } from '../types'
import { titleCase } from './format'

export const CATEGORIES: Category[] = [
  'Housing',
  'Groceries',
  'Dining',
  'Transport',
  'Shopping',
  'Bills & utilities',
  'Health',
  'Entertainment',
  'Travel',
  'Income',
  'Transfers',
  'Fees',
  'Other',
  'Unknown',
]

const STORAGE_KEY = 'spendwise.merchant-corrections.v1'

const descriptorPrefixes = [
  /^(?:pending|posted|debit card|credit card|card purchase|card payment|pos purchase|pos debit|visa debit|visa|mastercard|ach debit|ach credit|online transfer|direct debit|purchase|withdrawal|deposit|payment to|payment from|pay by|purchase at)\s+/i,
  /^(?:\d{2,4}\s+){1,3}/,
]

export function normalizeMerchant(description: string): string {
  let cleaned = description
    .replace(/\b(?:REF|REFERENCE|TRACE|AUTH|TRANSACTION|TXN|ID|CARD)\s*[:#-]?\s*[A-Z0-9-]{5,}\b/gi, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  for (const prefix of descriptorPrefixes) cleaned = cleaned.replace(prefix, '').trim()
  cleaned = cleaned
    .replace(/\s+(?:\d{4,}|\*{2,}\d{2,})\s*$/, '')
    .replace(/\s+[A-Z]{2}\s*$/, '')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned ? titleCase(cleaned) : 'Unknown merchant'
}

function readCorrections(): Record<string, Category> {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (!value) return {}
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? parsed as Record<string, Category> : {}
  } catch {
    return {}
  }
}

export function getSavedCorrections(): Record<string, Category> {
  return readCorrections()
}

export function saveMerchantCorrection(merchant: string, category: Category): void {
  const key = normalizeMerchant(merchant).toLowerCase()
  if (!key || key === 'unknown merchant') return
  const updated = { ...readCorrections(), [key]: category }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // Browsers with storage disabled can still use corrections for the current in-memory transaction.
  }
}

export function clearSavedCorrections(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // A storage restriction does not block the tracker from running.
  }
}

const rules: Array<{ category: Category; confidence: number; pattern: RegExp }> = [
  { category: 'Income', confidence: 0.98, pattern: /\b(salary|payroll|paycheck|direct deposit|interest payment|dividend|tax refund|cashback|reimbursement)\b/i },
  { category: 'Housing', confidence: 0.97, pattern: /\b(rent|mortgage|landlord|property management|hoa dues|home loan)\b/i },
  { category: 'Groceries', confidence: 0.96, pattern: /\b(trader joe'?s|whole foods|aldi|lidl|kroger|safeway|publix|wegmans|sprouts|stop ?& ?shop|grocery|grocer|supermarket|fresh market|food lion|h.?e.?b|market basket)\b/i },
  { category: 'Dining', confidence: 0.95, pattern: /\b(restaurant|cafe|coffee|starbucks|dunkin|chipotle|sweetgreen|panera|doordash|uber eats|grubhub|deliveroo|caviar|takeaway|pizza|mcdonald|burger king|shake shack|dining)\b/i },
  { category: 'Transport', confidence: 0.96, pattern: /\b(uber(?! eats)|lyft|shell|chevron|exxon|mobil|bp\b|sunoco|valero|gas station|fuel|parking|metro card|subway fare|transit|toll|mta|bicycle)\b/i },
  { category: 'Health', confidence: 0.94, pattern: /\b(pharmacy|cvs|walgreens|rite aid|urgent care|doctor|medical|dentist|health|hospital|optical|clinic|prescription)\b/i },
  { category: 'Entertainment', confidence: 0.96, pattern: /\b(netflix|spotify|hulu|disney\+?|max\b|apple tv|youtube premium|prime video|cinema|movie theater|concert|ticketmaster|steam games|playstation|xbox)\b/i },
  { category: 'Bills & utilities', confidence: 0.94, pattern: /\b(electric|electricity|utility|water bill|gas bill|internet|broadband|xfinity|comcast|verizon|at&t|t-mobile|mobile plan|phone bill|insurance premium)\b/i },
  { category: 'Travel', confidence: 0.94, pattern: /\b(airline|airways|hotel|airbnb|booking\.com|marriott|hilton|hyatt|delta air|united airlines|american airlines|airport|rental car|expedia|trip\.com)\b/i },
  { category: 'Fees', confidence: 0.96, pattern: /\b(overdraft fee|service fee|monthly fee|maintenance fee|atm fee|foreign transaction fee|late fee|bank charge|interest charged)\b/i },
  { category: 'Transfers', confidence: 0.9, pattern: /\b(transfer|zelle|cash app|venmo|paypal|wire transfer|peer.?to.?peer|p2p|upi[-\s]+(?:mr|mrs|ms)\b)\b/i },
  { category: 'Shopping', confidence: 0.91, pattern: /\b(amazon|target|walmart|costco|etsy|ebay|ikea|home depot|lowe'?s|best buy|nike|adidas|uniqlo|shopify|online store|retail)\b/i },
]

export function classifyMerchant(description: string): CategoryResult {
  const merchant = normalizeMerchant(description)
  const override = readCorrections()[merchant.toLowerCase()]
  if (override && CATEGORIES.includes(override)) {
    return { merchant, category: override, confidence: 1, method: 'saved correction' }
  }
  for (const rule of rules) {
    if (rule.pattern.test(description)) {
      return { merchant, category: rule.category, confidence: rule.confidence, method: 'merchant rule' }
    }
  }
  return { merchant, category: 'Unknown', confidence: 0, method: 'unknown' }
}

export function confidenceLabel(value: number): string {
  if (value >= 0.9) return 'High'
  if (value >= 0.65) return 'Review'
  return 'Unknown'
}
