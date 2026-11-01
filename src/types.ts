export type DefaultCategory =
  | 'Housing'
  | 'Groceries'
  | 'Dining'
  | 'Transport'
  | 'Shopping'
  | 'Bills & utilities'
  | 'Health'
  | 'Entertainment'
  | 'Travel'
  | 'Income'
  | 'Transfers'
  | 'Fees'
  | 'Other'
  | 'Unknown'

export type Category = DefaultCategory | (string & {})

export type ClassificationMethod = 'merchant rule' | 'saved correction' | 'manual' | 'unknown'

export interface Transaction {
  id: string
  date: string
  description: string
  merchant: string
  amount: number
  currencyCode: string
  category: Category
  confidence: number
  classificationMethod: ClassificationMethod
  sourceStatementId: string
  isDuplicate: boolean
  duplicateOf?: string
  duplicateConfirmedDistinct?: boolean
  isSelfTransfer?: boolean
  selfTransferPairId?: string
  selfTransferConfirmedDistinct?: boolean
  directionChoice?: 'spending' | 'income'
  dateOrderChoice?: 'MDY' | 'DMY'
  isDemo?: boolean
  issue?: string
}

export interface Statement {
  id: string
  fileName: string
  bankName: string
  importedAt: string
  transactionCount: number
  duplicateCount: number
  skippedCount: number
  fileSize: number
  parser: 'CSV' | 'Excel' | 'PDF' | 'Sample'
  isDemo?: boolean
  warnings?: string[]
}

export interface StagedTransaction {
  id: string
  date: string
  description: string
  merchant: string
  amount: number
  currencyCode: string
  category: Category
  confidence: number
  classificationMethod: ClassificationMethod
  issue?: string
  directionChoice?: 'spending' | 'income'
  dateOrderChoice?: 'MDY' | 'DMY'
  directionAmbiguous?: boolean
  dateAmbiguous?: boolean
  originalDate?: string
}

export interface ParsedStatement {
  id: string
  fileName: string
  fileSize: number
  parser: 'CSV' | 'Excel' | 'PDF'
  transactions: StagedTransaction[]
  warnings: string[]
  skippedRows: number
  errors: string[]
  positiveAmountMode?: 'spending' | 'income'
  dateFormatMode?: 'MDY' | 'DMY'
  bankName?: string
}

export interface CategoryResult {
  merchant: string
  category: Category
  confidence: number
  method: ClassificationMethod
}

export interface AnalyticsTransaction extends Transaction {
  amount: number
}

export interface SpendwiseSnapshot {
  version: 1
  updatedAt: string
  currency: string
  transactions: Transaction[]
  statements: Statement[]
  customCategories: string[]
  disabledCategories: string[]
  merchantCorrections: Record<string, Category>
}

export interface GoogleUserInfo {
  email: string
  name: string
  picture?: string
}

export interface UserAccount {
  id: string
  name: string
  email?: string
  picture?: string
  mode: 'google' | 'local' | 'demo'
  createdAt: string
  lastActiveAt: string
}

export interface UserSession {
  mode: 'google' | 'local' | 'demo'
  name: string
  email?: string
  picture?: string
  accountId?: string
}

export interface DriveSyncStatus {
  connected: boolean
  syncing: boolean
  user: GoogleUserInfo | null
  lastSyncedAt: string | null
  error?: string | null
}
