import type { Category, Transaction } from '../types'
import { normalizeMerchant } from './categories'

export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  Housing: '#e3c49b',
  Groceries: '#92bb7a',
  Dining: '#efa987',
  Transport: '#8eb7c4',
  Shopping: '#b39ad5',
  'Bills & utilities': '#e1c46d',
  Health: '#d4919b',
  Entertainment: '#969ee0',
  Travel: '#79bba9',
  Income: '#23a77a',
  Transfers: '#84a8d3',
  Fees: '#c68e76',
  Other: '#9da8ad',
  Unknown: '#c2c8ca',
}

export const CATEGORY_COLORS: Record<string, string> = DEFAULT_CATEGORY_COLORS

const CUSTOM_PALETTE = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#d946ef', // fuchsia
  '#84cc16', // lime
  '#e11d48', // rose
]

export function getCategoryColor(category: string): string {
  if (category in DEFAULT_CATEGORY_COLORS) {
    return DEFAULT_CATEGORY_COLORS[category]
  }
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % CUSTOM_PALETTE.length
  return CUSTOM_PALETTE[index]
}

export function categorySlug(category: Category): string {
  return category.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'other'
}

export function transactionDuplicateMatch(
  left: Pick<Transaction, 'date' | 'currencyCode' | 'amount' | 'description'>,
  right: Pick<Transaction, 'date' | 'currencyCode' | 'amount' | 'description'>
): boolean {
  if (left.date !== right.date || left.currencyCode !== right.currencyCode) return false
  if (Math.round(Math.abs(left.amount) * 100) !== Math.round(Math.abs(right.amount) * 100)) return false
  return normalizeMerchant(left.description).toLowerCase() === normalizeMerchant(right.description).toLowerCase()
}
