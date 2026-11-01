import type { Category, CategoryResult } from '../types'
import { titleCase } from './format'

export const ORIGINAL_BUILTIN_CATEGORIES: Category[] = [
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
  'Housing',
  'Fees',
  'Other',
  'Unknown',
]

// Built-in categories with Housing and Fees removed by default
export const DEFAULT_ACTIVE_CATEGORIES: Category[] = [
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
  'Other',
  'Unknown',
]

export const DEFAULT_DISABLED_CATEGORIES: string[] = ['Housing', 'Fees']

const DISABLED_CATEGORIES_KEY = 'spendwise.disabled-categories.v1'
const CUSTOM_CATEGORIES_KEY = 'spendwise.custom-categories.v1'

export function getDisabledCategories(): string[] {
  if (typeof window === 'undefined') return DEFAULT_DISABLED_CATEGORIES
  try {
    const raw = window.localStorage.getItem(DISABLED_CATEGORIES_KEY)
    if (raw === null) return DEFAULT_DISABLED_CATEGORIES
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : DEFAULT_DISABLED_CATEGORIES
  } catch {
    return DEFAULT_DISABLED_CATEGORIES
  }
}

export function saveDisabledCategories(disabled: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISABLED_CATEGORIES_KEY, JSON.stringify(disabled))
  } catch {
    // Ignore storage errors
  }
}

export function disableBuiltinCategory(name: string): string[] {
  const current = getDisabledCategories()
  if (!current.includes(name)) {
    const next = [...current, name]
    saveDisabledCategories(next)
    return next
  }
  return current
}

export function enableBuiltinCategory(name: string): string[] {
  const current = getDisabledCategories()
  const next = current.filter((c) => c !== name)
  saveDisabledCategories(next)
  return next
}

export function resetCategoriesToDefault(): { disabled: string[]; custom: string[] } {
  saveDisabledCategories(DEFAULT_DISABLED_CATEGORIES)
  saveCustomCategories([])
  return { disabled: DEFAULT_DISABLED_CATEGORIES, custom: [] }
}

export function getActiveBuiltinCategories(): Category[] {
  const disabled = new Set(getDisabledCategories())
  return ORIGINAL_BUILTIN_CATEGORIES.filter((c) => !disabled.has(c))
}

export function getCustomCategories(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_CATEGORIES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string' && c.trim().length > 0) : []
  } catch {
    return []
  }
}

export function saveCustomCategories(categories: string[]): void {
  if (typeof window === 'undefined') return
  try {
    const cleaned = Array.from(new Set(categories.map((c) => c.trim()).filter(Boolean)))
    window.localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(cleaned))
  } catch {
    // Ignore storage errors
  }
}

export function addCustomCategory(name: string): { success: boolean; error?: string; categories: string[] } {
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Category name cannot be empty', categories: getCustomCategories() }
  if (ORIGINAL_BUILTIN_CATEGORIES.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: 'A built-in category exists with that name. You can re-enable it below.', categories: getCustomCategories() }
  }
  const current = getCustomCategories()
  if (current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: 'A custom category already exists with that name', categories: current }
  }
  const next = [...current, trimmed]
  saveCustomCategories(next)
  return { success: true, categories: next }
}

export function deleteCustomCategory(name: string): string[] {
  const current = getCustomCategories()
  const next = current.filter((c) => c.toLowerCase() !== name.toLowerCase())
  saveCustomCategories(next)
  return next
}

export function getAllCategories(): Category[] {
  const custom = getCustomCategories()
  const active = getActiveBuiltinCategories().filter((c) => c !== 'Other' && c !== 'Unknown')
  return [...active, ...custom, 'Other', 'Unknown']
}

export const CATEGORIES: Category[] = getAllCategories()
export const DEFAULT_CATEGORIES: Category[] = DEFAULT_ACTIVE_CATEGORIES

const STORAGE_KEY = 'spendwise.merchant-corrections.v1'

const descriptorPrefixes = [
  /^(?:pending|posted|debit card|credit card|card purchase|card payment|pos purchase|pos debit|visa debit|visa|mastercard|ach debit|ach credit|online transfer|direct debit|purchase|withdrawal|deposit|payment to|payment from|pay by|purchase at)\s+/i,
  /^(?:\d{2,4}\s+){1,3}/,
]

export function normalizeMerchant(description: string): string {
  // Pattern 1: Indian UPI format (KVB / general bank UPI-DR-123456789012-Merchant-BANK-branch)
  const upiKvb = description.match(/^UPI-(?:DR|CR|REV)-\d{8,14}-(.+?)(?:-[A-Z]{2,6}(?:-[0-9A-Z]+)?)?$/i)
  if (upiKvb) {
    let name = upiKvb[1].replace(/-[A-Z]{2,6}(?:-[0-9A-Z]+)?$/i, '').trim()
    if (name.endsWith('-')) name = name.slice(0, -1).trim()
    if (name) return titleCase(name)
  }

  // Pattern 2: HDFC UPI format (UPI-MERCHANT-VPA-IFSC-RRN-NOTE)
  const upiHdfc = description.match(/^UPI-([A-Z0-9\s.]+?)(?:-[^@\s]+@[a-z0-9]+|-[\d\s*]+@)/i)
  if (upiHdfc && upiHdfc[1]) {
    return titleCase(upiHdfc[1].trim())
  }

  // Pattern 3: Cheque / Clearing (BY CLG:NAME:Bank)
  const clgMatch = description.match(/^BY\s+CLG:([^:]+)/i)
  if (clgMatch) {
    return titleCase(clgMatch[1].trim())
  }

  // Pattern 4: Razorpay / Govt online payments
  if (/RAZPPAY|RAZORPAY/i.test(description)) {
    if (/GOV/i.test(description)) return 'Razorpay (Govt Services)'
    return 'Razorpay'
  }

  // Pattern 5: Salary / Employer corporate payouts
  const salMatch = description.match(/(?:SALARY\s+|A2AINT\d*-)?([A-Z\s]+(?:PVT|PRIVATE|LTD|LIMITED)[A-Z\s]*)/i)
  if (salMatch) {
    return titleCase(salMatch[1].replace(/PRIVATE\s+LI\s+MITED/i, 'Private Limited').replace(/\s+/g, ' ').trim())
  }

  // Pattern 6: Credit card & bill payments
  if (/IB\s+BILLPAY/i.test(description)) {
    return 'HDFC BillPay'
  }

  // Pattern 7: ATM Cash Withdrawal
  if (/^ATM\b/i.test(description)) {
    const locMatch = description.match(/^ATM\s+CSW\/\d+\/([A-Z\s/]+)/i)
    if (locMatch) return titleCase(`ATM ${locMatch[1].replace(/\//g, ' ')}`)
    return 'ATM Cash Withdrawal'
  }

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

export function removeCategoryFromSavedCorrections(category: Category): void {
  const current = readCorrections()
  let changed = false
  const updated: Record<string, Category> = {}
  for (const [k, v] of Object.entries(current)) {
    if (v === category) {
      changed = true
    } else {
      updated[k] = v
    }
  }
  if (changed) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // storage quota or restrictions
    }
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
  { category: 'Income', confidence: 0.98, pattern: /\b(salary|payroll|paycheck|direct deposit|credit interest|interest paid|interest payment|dividend|tax refund|cashback|reimbursement|bonus)\b/i },
  { category: 'Housing', confidence: 0.97, pattern: /\b(rent|mortgage|landlord|property management|hoa dues|home loan|housing)\b/i },
  { category: 'Groceries', confidence: 0.96, pattern: /\b(trader joe'?s|whole foods|aldi|lidl|kroger|safeway|publix|wegmans|sprouts|stop ?& ?shop|grocery|grocer|supermarket|fresh market|food lion|h.?e.?b|market basket|blinkit|zepto|instamart|bigbasket|rice house|super market|vegetables|fruits|provisions|flour mill|dairy|milk|store|stores|malar store|super agency|agencies|mart)\b/i },
  { category: 'Dining', confidence: 0.95, pattern: /\b(restaurant|cafe|coffee|starbucks|dunkin|chipotle|sweetgreen|panera|doordash|uber eats|grubhub|deliveroo|caviar|takeaway|pizza|mcdonald|burger king|shake shack|dining|swiggy(?! instamart)|zomato|chai|tea|juice|hotel|hotels|bhavan|dhaba|bakery|sweets|fast food|snacks|biryani|mess|pizzahut|dominos|saravana|idly|kebab|tandoori|relax cafe|vishak)\b/i },
  { category: 'Transport', confidence: 0.96, pattern: /\b(uber(?! eats)|lyft|shell|chevron|exxon|mobil|bp\b|sunoco|valero|gas station|fuel|parking|chendhoor parking|metro card|subway fare|transit|toll|mta|bicycle|ola\b|rapido|chennai metro|cmrl|irctc|redbus|petrol|hpcl|bpcl|iocl|indian oil|auto\b|railways|bike parts|auto parts|krishna auto|metro)\b/i },
  { category: 'Health', confidence: 0.95, pattern: /\b(pharmacy|cvs|walgreens|rite aid|urgent care|doctor|physician|medical|dentist|health|hospital|optical|clinic|prescription|apollo|medplus|medicines|dental)\b|(?:^|\s)dr\.?\s+[a-z]/i },
  { category: 'Entertainment', confidence: 0.96, pattern: /\b(netflix|spotify|hulu|disney\+?|max\b|apple tv|youtube premium|prime video|cinema|movie theater|concert|ticketmaster|steam games|playstation|xbox|bookmyshow|pvr|inox|theatre|theater|cinemas|district movie)\b/i },
  { category: 'Bills & utilities', confidence: 0.95, pattern: /\b(electric|electricity|utility|water bill|gas bill|internet|broadband|xfinity|comcast|verizon|at&t|t-mobile|mobile plan|phone bill|insurance premium|airtel|jio|bsnl|vi\b|vodafone|billpay|recharge|jiofiber|billdesk|razppay|razorpay|govin|gov\.in)\b/i },
  { category: 'Travel', confidence: 0.94, pattern: /\b(airline|airways|hotel|airbnb|booking\.com|marriott|hilton|hyatt|delta air|united airlines|american airlines|airport|rental car|expedia|trip\.com|yercaud|kerala trip|andaman|resort)\b/i },
  { category: 'Fees', confidence: 0.96, pattern: /\b(overdraft fee|service fee|monthly fee|maintenance fee|atm fee|foreign transaction fee|late fee|bank charge|interest charged|sms charges|insta alert|alert charges)\b/i },
  { category: 'Transfers', confidence: 0.95, pattern: /\b(transfer|self transfer|transfer back|payout|payloop|payback|zelle|cash app|venmo|paypal|wire transfer|peer.?to.?peer|p2p|zerodha|groww|mfautopay|clearing|by clg|loan|rd installment|closure|mutual funds|slice|credit card bill|cred\.club|adisagar|hdfc-5010|kvbl0001694|atm\b|imps|neft|rtgs)\b/i },
  { category: 'Shopping', confidence: 0.92, pattern: /\b(amazon|target|walmart|costco|etsy|ebay|ikea|home depot|lowe'?s|best buy|nike|adidas|uniqlo|shopify|online store|retail|flipkart|zudio|pothys|reliance trends|reliance digital|lenskart|myntra|decathlon|meesho|nykaa|footwear|fashions|tailors|florist|good luck florist|flowers|enterprises|enterprise|shivani enterprises)\b/i },
]

export function classifyMerchant(description: string): CategoryResult {
  const merchant = normalizeMerchant(description)
  const override = readCorrections()[merchant.toLowerCase()]
  const disabledSet = new Set(getDisabledCategories())

  if (override && !disabledSet.has(override) && getAllCategories().includes(override)) {
    return { merchant, category: override as Category, confidence: 1, method: 'saved correction' }
  }
  for (const rule of rules) {
    if (disabledSet.has(rule.category)) continue
    if (rule.pattern.test(description) || rule.pattern.test(merchant)) {
      return { merchant, category: rule.category, confidence: rule.confidence, method: 'merchant rule' }
    }
  }
  // Generic Indian UPI person-to-person transfer
  if (!disabledSet.has('Transfers') && (/^UPI-(?:DR|CR|REV)-/i.test(description) || /^UPI-[A-Z0-9\s.]+?-[^@\s]+@/i.test(description))) {
    return { merchant, category: 'Transfers', confidence: 0.85, method: 'merchant rule' }
  }
  return { merchant, category: 'Unknown', confidence: 0, method: 'unknown' }
}

export function confidenceLabel(value: number): string {
  if (value >= 0.9) return 'High'
  if (value >= 0.65) return 'Review'
  return 'Unknown'
}
