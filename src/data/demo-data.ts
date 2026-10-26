import type { Statement, Transaction } from '../types'
import { classifyMerchant } from '../lib/categories'
import { localISODate } from '../lib/format'

function monthDay(offset: number, day: number): string {
  const now = new Date()
  return localISODate(new Date(now.getFullYear(), now.getMonth() + offset, day))
}

const sampleRows = [
  [-5, 2, 'Northstar Payroll', 4620, 'Income'],
  [-5, 3, 'Harborview Apartments Rent', -1480, 'Housing'],
  [-5, 5, 'Trader Joe’s #438', -116.42, 'Groceries'],
  [-5, 7, 'MetroCard Autoload', -32, 'Transport'],
  [-4, 1, 'Northstar Payroll', 4620, 'Income'],
  [-4, 2, 'Harborview Apartments Rent', -1480, 'Housing'],
  [-4, 6, 'Whole Foods Market', -98.35, 'Groceries'],
  [-4, 9, 'The Daily Grind Cafe', -14.5, 'Dining'],
  [-3, 1, 'Northstar Payroll', 4620, 'Income'],
  [-3, 2, 'Harborview Apartments Rent', -1480, 'Housing'],
  [-3, 5, 'Spotify Premium', -11.99, 'Entertainment'],
  [-3, 11, 'Shell Oil #8821', -42.72, 'Transport'],
  [-2, 1, 'Northstar Payroll', 4620, 'Income'],
  [-2, 2, 'Harborview Apartments Rent', -1480, 'Housing'],
  [-2, 6, 'Aldi Grocery', -84.18, 'Groceries'],
  [-2, 12, 'Green Street Thai', -47.6, 'Dining'],
  [-1, 1, 'Northstar Payroll', 4620, 'Income'],
  [-1, 2, 'Harborview Apartments Rent', -1480, 'Housing'],
  [-1, 4, 'Netflix.com', -15.49, 'Entertainment'],
  [-1, 9, 'Metro Transit', -28.5, 'Transport'],
  [0, 1, 'Northstar Payroll', 4620, 'Income'],
  [0, 2, 'Harborview Apartments Rent', -1480, 'Housing'],
  [0, 3, 'Whole Foods Market', -146.23, 'Groceries'],
  [0, 4, 'The Daily Grind Cafe', -8.75, 'Dining'],
  [0, 6, 'Xfinity Internet', -69.99, 'Bills & utilities'],
  [0, 8, 'Shell Oil #8821', -38.15, 'Transport'],
  [0, 11, 'Amazon Marketplace', -52.8, 'Shopping'],
  [0, 13, 'CVS Pharmacy', -18.4, 'Health'],
  [0, 15, 'Green Street Thai', -42.15, 'Dining'],
  [0, 17, 'Unknown • SQ *RIVERBEND STUDIO', -86, 'Unknown'],
  [0, 19, 'Aldi Grocery', -76.38, 'Groceries'],
  [0, 21, 'Metro Transit', -28.5, 'Transport'],
  [0, 23, 'Spotify Premium', -11.99, 'Entertainment'],
] as const

export const demoStatementId = 'demo-statement'

export const demoTransactions: Transaction[] = sampleRows.map(([offset, day, description, amount, category], index) => {
  const result = classifyMerchant(description)
  return {
    id: `demo-${index + 1}`,
    date: monthDay(offset, day),
    description,
    merchant: result.merchant,
    amount,
    currencyCode: 'USD',
    category,
    confidence: category === 'Unknown' ? 0 : Math.max(result.confidence, 0.94),
    classificationMethod: category === 'Unknown' ? 'unknown' : 'merchant rule',
    sourceStatementId: demoStatementId,
    isDuplicate: false,
    isDemo: true,
  }
})

export const demoStatements: Statement[] = [
  {
    id: demoStatementId,
    fileName: 'northstar-checking-sample.csv',
    bankName: 'Northstar Checking',
    importedAt: new Date().toISOString(),
    transactionCount: demoTransactions.length,
    duplicateCount: 0,
    skippedCount: 0,
    fileSize: 58_214,
    parser: 'Sample',
    isDemo: true,
  },
]
