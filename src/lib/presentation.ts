import type { Category } from '../types'

export const CATEGORY_COLORS: Record<Category, string> = {
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

export function categorySlug(category: Category): string {
  return category.replace(/[^a-z]/gi, '').toLowerCase()
}
