import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, ArrowRight, ArrowUpDown, BadgeCheck,
  ChartNoAxesColumnIncreasing, ChevronDown, ChevronRight, CircleArrowDown, CircleArrowUp, Cloud, CloudOff, Download,
  FileClock, FileStack, Filter, FolderPlus, Info, Landmark, LogIn, LogOut, Plus, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck,
  Sparkles, Trash2, UserCircle2, UserPlus, WalletCards, X,
} from 'lucide-react'
import Sidebar, { type PageKey } from './components/Sidebar'
import StatCard from './components/StatCard'
import TransactionsTable from './components/TransactionsTable'
import UploadDialog from './components/UploadDialog'
import DuplicatesReviewModal from './components/DuplicatesReviewModal'
import GoogleDriveSyncPanel from './components/GoogleDriveSyncPanel'
import AccountManagementPanel from './components/AccountManagementPanel'
import WelcomeLogin, { type UserSession } from './components/WelcomeLogin'
import MobileBottomNav from './components/MobileBottomNav'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './components/ui/select'
import { DateRangePicker } from './components/ui/date-range-picker'
import { AmountRangePicker } from './components/ui/amount-range-picker'
import { MultiSelectFilter } from './components/ui/MultiSelectFilter'
import { demoStatements, demoTransactions } from './data/demo-data'
import {
  addCustomCategory, clearSavedCorrections, deleteCustomCategory,
  disableBuiltinCategory, enableBuiltinCategory, getActiveBuiltinCategories, getAllCategories,
  getCustomCategories, getDisabledCategories, getSavedCorrections, normalizeMerchant, removeCategoryFromSavedCorrections, resetCategoriesToDefault,
  saveCustomCategories, saveDisabledCategories, saveMerchantCorrection, classifyMerchant,
} from './lib/categories'
import { formatDate, formatMoney, localISODate, relativeDate, titleCase, csvEscape } from './lib/format'
import { getCategoryColor, categorySlug } from './lib/presentation'
import { loadLocalSnapshot, saveLocalSnapshot } from './lib/storage'
import { getStoredToken, getStoredUser, pullSnapshotFromDrive, pushSnapshotToDrive } from './lib/driveSync'
import { detectSelfTransfers, toggleSelfTransferPair } from './lib/selfTransfers'
import { getActiveSession, saveActiveSession } from './lib/accounts'
import { useRouter } from './lib/router'
import { usePwaInstall } from './lib/usePwaInstall'
import type { Category, ParsedStatement, SpendwiseSnapshot, Statement, Transaction } from './types'

const DashboardCharts = lazy(() => import('./components/DashboardCharts'))
type ClassificationFilter = 'all' | 'unknown' | 'manual' | 'review' | 'duplicates' | 'transfers'

function transactionDuplicateMatch(left: Pick<Transaction, 'date' | 'currencyCode' | 'amount' | 'description'>, right: Pick<Transaction, 'date' | 'currencyCode' | 'amount' | 'description'>): boolean {
  if (left.date !== right.date || left.currencyCode !== right.currencyCode) return false
  if (Math.round(Math.abs(left.amount) * 100) !== Math.round(Math.abs(right.amount) * 100)) return false
  return normalizeMerchant(left.description).toLowerCase() === normalizeMerchant(right.description).toLowerCase()
}

function bankNameFromFile(fileName: string): string {
  const cleaned = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b(statement|transactions|activity|export)\b/gi, '').replace(/\s+/g, ' ').trim()
  return cleaned ? titleCase(cleaned) : 'Imported statement'
}

function currencyName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code } catch { return code }
}

function periodGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function App() {
  const [session, setSession] = useState<UserSession | null>(() => getActiveSession())
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [authModal, setAuthModal] = useState<{ open: boolean; mode: 'login' | 'signup' }>({ open: false, mode: 'login' })
  const { currentPage: activePage, navigate: setActivePage } = useRouter()
  const { canInstall, promptInstall } = usePwaInstall()
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions)
  const [statements, setStatements] = useState<Statement[]>(demoStatements)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [overviewFrom, setOverviewFrom] = useState(() => {
    const today = new Date()
    return localISODate(new Date(today.getFullYear(), today.getMonth(), 1))
  })
  const [overviewTo, setOverviewTo] = useState(() => {
    const today = new Date()
    return localISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  })
  const [currency, setCurrencyState] = useState(() => {
    return (typeof window !== 'undefined' && window.localStorage.getItem('spendwise.currency.v1')) || 'INR'
  })
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [statementFilter, setStatementFilter] = useState<string[]>([])
  const [classificationFilter, setClassificationFilter] = useState<ClassificationFilter>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [transactionPage, setTransactionPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [showDemo, setShowDemo] = useState(true)
  const [toast, setToast] = useState('')
  const [savedCorrections, setSavedCorrections] = useState(getSavedCorrections)
  const [categories, setCategories] = useState<Category[]>(() => getAllCategories())
  const [customCategories, setCustomCategories] = useState<string[]>(() => getCustomCategories())
  const [newCategoryName, setNewCategoryName] = useState('')
  const [reviewingDuplicateStatement, setReviewingDuplicateStatement] = useState<Statement | null>(null)
  const [customCategoriesOpen, setCustomCategoriesOpen] = useState(false)
  const [builtinCategoriesOpen, setBuiltinCategoriesOpen] = useState(false)
  const [removedCategoriesOpen, setRemovedCategoriesOpen] = useState(false)

  const handleAddCategory = (name: string) => {
    const res = addCustomCategory(name)
    if (!res.success) {
      setToast(res.error || 'Failed to add category')
      window.setTimeout(() => setToast(''), 3000)
      return false
    }
    setCustomCategories(res.categories)
    setCategories(getAllCategories())
    setCustomCategoriesOpen(true)
    setToast(`Added category "${name.trim()}"`)
    window.setTimeout(() => setToast(''), 3000)
    return true
  }

  const handleDeleteCategory = (name: string) => {
    const updated = deleteCustomCategory(name)
    setCustomCategories(updated)
    setCategories(getAllCategories())
    removeCategoryFromSavedCorrections(name)
    setSavedCorrections(getSavedCorrections())
    let affectedCount = 0
    setTransactions((current) => current.map((row) => {
      if (row.category === name) {
        affectedCount += 1
        return { ...row, category: 'Unknown', confidence: 0, classificationMethod: 'unknown' }
      }
      return row
    }))
    setToast(affectedCount > 0
      ? `Deleted "${name}" · ${affectedCount} transaction${affectedCount === 1 ? '' : 's'} moved to Unknown (Needs category)`
      : `Deleted category "${name}"`)
    window.setTimeout(() => setToast(''), 4000)
  }

  const [disabledCategories, setDisabledCategories] = useState<string[]>(() => getDisabledCategories())

  const handleDisableBuiltin = (name: string) => {
    const next = disableBuiltinCategory(name)
    setDisabledCategories(next)
    const updatedAll = getAllCategories()
    setCategories(updatedAll)
    removeCategoryFromSavedCorrections(name)
    setSavedCorrections(getSavedCorrections())
    let affectedCount = 0
    setTransactions((current) => current.map((row) => {
      if (row.category === name) {
        affectedCount += 1
        return { ...row, category: 'Unknown', confidence: 0, classificationMethod: 'unknown' }
      }
      return row
    }))
    setToast(affectedCount > 0
      ? `Removed "${name}" · ${affectedCount} transaction${affectedCount === 1 ? '' : 's'} moved to Unknown (Needs category)`
      : `Removed "${name}" from active categories`)
    window.setTimeout(() => setToast(''), 4000)
  }

  const handleEnableBuiltin = (name: string) => {
    const next = enableBuiltinCategory(name)
    setDisabledCategories(next)
    const updatedAll = getAllCategories()
    setCategories(updatedAll)
    setToast(`Restored "${name}" category`)
    window.setTimeout(() => setToast(''), 3000)
  }

  const handleResetCategories = () => {
    const prevCustom = [...customCategories]
    const res = resetCategoriesToDefault()
    setDisabledCategories(res.disabled)
    setCustomCategories(res.custom)
    const updatedAll = getAllCategories()
    setCategories(updatedAll)

    // Re-assign transactions using removed custom categories to 'Unknown'
    if (prevCustom.length > 0) {
      setTransactions((prev) => prev.map((t) => {
        if (prevCustom.includes(t.category)) {
          return {
            ...t,
            category: 'Unknown',
            confidence: 0,
            classificationMethod: 'manual',
          }
        }
        return t
      }))
    }

    setToast('Categories reset to defaults')
    window.setTimeout(() => setToast(''), 3000)
  }

  const handleReclassifyAll = () => {
    let reclassifiedCount = 0
    setTransactions((current) => current.map((row) => {
      const result = classifyMerchant(row.description)
      if (result.category !== row.category) {
        reclassifiedCount++
        return {
          ...row,
          category: result.category,
          confidence: result.confidence,
          classificationMethod: result.method,
        }
      }
      return row
    }))
    setToast(`Re-classified transactions (${reclassifiedCount} updated)`)
    window.setTimeout(() => setToast(''), 3500)
  }

  const [driveConnected, setDriveConnected] = useState(() => Boolean(getStoredToken()))
  const [isDriveSyncing, setIsDriveSyncing] = useState(false)
  const isInitialMountDoneRef = useRef(false)
  const skipNextDrivePushRef = useRef(false)

  const handleRestoreSnapshot = (snapshot: SpendwiseSnapshot) => {
    skipNextDrivePushRef.current = true
    const paired = detectSelfTransfers(snapshot.transactions)
    setTransactions(paired)
    setStatements(snapshot.statements)
    setCurrency(snapshot.currency || 'INR')
    if (snapshot.customCategories) {
      setCustomCategories(snapshot.customCategories)
      saveCustomCategories(snapshot.customCategories)
    }
    if (snapshot.disabledCategories) {
      setDisabledCategories(snapshot.disabledCategories)
      saveDisabledCategories(snapshot.disabledCategories)
    }
    if (snapshot.merchantCorrections) {
      for (const [m, c] of Object.entries(snapshot.merchantCorrections)) {
        saveMerchantCorrection(m, c)
      }
      setSavedCorrections(getSavedCorrections())
    }
    setCategories(getAllCategories())
    setShowDemo(false)
  }

  const toggleSelfTransfer = (transaction: Transaction) => {
    setTransactions((current) => toggleSelfTransferPair(current, transaction))
    setToast(transaction.isSelfTransfer ? 'Self-transfer unlinked (now counted in totals)' : 'Self-transfer re-paired (neutralized from totals)')
    window.setTimeout(() => setToast(''), 3000)
  }

  const handleResetData = () => {
    setShowDemo(true)
    setTransactions(demoTransactions)
    setStatements(demoStatements)
    const today = new Date()
    setOverviewFrom(localISODate(new Date(today.getFullYear(), today.getMonth(), 1)))
    setOverviewTo(localISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0)))
  }

  // Load from IndexedDB on initial mount and check Google Drive
  useEffect(() => {
    let isCancelled = false
    const initWorkspace = async () => {
      try {
        const local = await loadLocalSnapshot()
        if (!isCancelled && local && (local.transactions.length > 0 || local.statements.length > 0)) {
          skipNextDrivePushRef.current = true
          handleRestoreSnapshot(local)
        }

        const token = getStoredToken()
        if (!isCancelled) setDriveConnected(Boolean(token))
        if (token) {
          try {
            const driveSnapshot = await pullSnapshotFromDrive()
            if (!isCancelled && driveSnapshot && driveSnapshot.transactions.length > 0) {
              const driveTime = new Date(driveSnapshot.updatedAt || 0).getTime()
              const localTime = new Date(local?.updatedAt || 0).getTime()
              if (!local || driveTime > localTime) {
                skipNextDrivePushRef.current = true
                handleRestoreSnapshot(driveSnapshot)
                setToast('Synced latest data from Google Drive')
                window.setTimeout(() => setToast(''), 3000)
              }
            }
          } catch (err) {
            console.warn('Initial drive pull check failed:', err)
          }
        }
      } finally {
        if (!isCancelled) {
          window.setTimeout(() => {
            isInitialMountDoneRef.current = true
          }, 800)
        }
      }
    }

    initWorkspace()
    return () => {
      isCancelled = true
    }
  }, [])

  const currentSnapshot = useMemo<SpendwiseSnapshot>(() => ({
    version: 1,
    updatedAt: new Date().toISOString(),
    currency,
    transactions: showDemo ? [] : transactions,
    statements: showDemo ? [] : statements,
    customCategories,
    disabledCategories,
    merchantCorrections: savedCorrections,
  }), [currency, transactions, statements, customCategories, disabledCategories, savedCorrections, showDemo])

  // Automatically save to IndexedDB whenever real workspace data changes
  useEffect(() => {
    if (!showDemo) {
      saveLocalSnapshot(currentSnapshot)
    }
  }, [currentSnapshot, showDemo])

  // Automatically push debounced backup to Google Drive whenever workspace data changes
  useEffect(() => {
    if (showDemo) return
    if (!isInitialMountDoneRef.current) return
    if (currentSnapshot.transactions.length === 0 && currentSnapshot.statements.length === 0) return

    if (skipNextDrivePushRef.current) {
      skipNextDrivePushRef.current = false
      return
    }

    const token = getStoredToken()
    if (!token) return

    const timer = window.setTimeout(async () => {
      try {
        setIsDriveSyncing(true)
        await pushSnapshotToDrive(currentSnapshot)
      } catch (err) {
        console.warn('Auto-sync to Google Drive failed:', err)
      } finally {
        setIsDriveSyncing(false)
      }
    }, 3500)

    return () => window.clearTimeout(timer)
  }, [currentSnapshot, showDemo])

  const setCurrency = (value: string) => {
    setCurrencyState(value)
    try {
      window.localStorage.setItem('spendwise.currency.v1', value)
    } catch {
      // storage unavailable
    }
  }

  const handleCurrencyChange = (newCurrency: string) => {
    setCurrency(newCurrency)
    setToast(`Display currency set to ${newCurrency}`)
    window.setTimeout(() => setToast(''), 2500)
  }

  const liveTransactions = useMemo(() => showDemo ? transactions : transactions.filter((transaction) => !transaction.isDemo), [transactions, showDemo])
  const liveStatements = useMemo(() => showDemo ? statements : statements.filter((statement) => !statement.isDemo), [statements, showDemo])
  const selectableCurrencies = useMemo(() => Array.from(new Set(liveTransactions.map((transaction) => transaction.currencyCode))).sort(), [liveTransactions])
  const availableCurrencies = selectableCurrencies
  const activeCurrency = currency
  const analysisRows = useMemo(() => liveTransactions.filter((transaction) => !transaction.isDuplicate), [liveTransactions])
  const unknownRows = useMemo(() => analysisRows.filter((transaction) => transaction.category === 'Unknown').sort((a, b) => b.date.localeCompare(a.date)), [analysisRows])
  const activeImportedStatements = liveStatements.filter((statement) => !statement.isDemo)
  const sampleActive = showDemo && liveStatements.some((statement) => statement.isDemo)

  // Sync document title with current page and status
  useEffect(() => {
    const titleMap: Record<PageKey, string> = {
      overview: 'Spendwise — Overview',
      transactions: `Spendwise — Transactions${unknownRows.length > 0 ? ` (${unknownRows.length} review)` : ''}`,
      statements: 'Spendwise — Statements',
      settings: 'Spendwise — Preferences',
    }
    document.title = titleMap[activePage] || 'Spendwise — Expense Tracker'
  }, [activePage, unknownRows.length])

  // Global keyboard shortcut: Pressing "/" or "Ctrl/Cmd + K" focuses search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        if (activePage !== 'transactions') setActivePage('transactions')
        window.setTimeout(() => {
          const searchInput = document.querySelector('.search-input') as HTMLInputElement | null
          searchInput?.focus()
        }, 60)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePage, setActivePage])

  const periodDateRange = useMemo(() => {
    const today = new Date()
    const thisMonthStart = localISODate(new Date(today.getFullYear(), today.getMonth(), 1))
    const thisMonthEnd = localISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0))
    const lastMonthStart = localISODate(new Date(today.getFullYear(), today.getMonth() - 1, 1))
    const lastMonthEnd = localISODate(new Date(today.getFullYear(), today.getMonth(), 0))
    const thisYearStart = `${today.getFullYear()}-01-01`
    const thisYearEnd = localISODate(today)

    if (!overviewFrom && !overviewTo) {
      return { start: '', end: '', label: 'All time' }
    }
    if (overviewFrom === thisMonthStart && (overviewTo === thisMonthEnd || overviewTo === localISODate(today))) {
      return { start: overviewFrom, end: overviewTo, label: 'This month' }
    }
    if (overviewFrom === lastMonthStart && overviewTo === lastMonthEnd) {
      return { start: overviewFrom, end: overviewTo, label: 'Last month' }
    }
    if (overviewFrom === thisYearStart && (overviewTo === thisYearEnd || overviewTo === `${today.getFullYear()}-12-31`)) {
      return { start: overviewFrom, end: overviewTo, label: 'This year' }
    }

    let label = 'Custom range'
    if (overviewFrom && overviewTo) {
      if (overviewFrom === overviewTo) {
        label = formatDate(overviewFrom)
      } else {
        label = `${formatDate(overviewFrom, { month: 'short', day: 'numeric' })} – ${formatDate(overviewTo, { month: 'short', day: 'numeric', year: 'numeric' })}`
      }
    } else if (overviewFrom) {
      label = `From ${formatDate(overviewFrom)}`
    } else if (overviewTo) {
      label = `Until ${formatDate(overviewTo)}`
    }
    return { start: overviewFrom, end: overviewTo, label }
  }, [overviewFrom, overviewTo])

  const periodRows = useMemo(() => {
    const { start, end } = periodDateRange
    return analysisRows.filter((transaction) => {
      if (start && transaction.date < start) return false
      if (end && transaction.date > end) return false
      return true
    })
  }, [analysisRows, periodDateRange])
  const expenseRows = periodRows.filter((transaction) => transaction.amount < 0 && !transaction.isSelfTransfer)
  const incomeRows = periodRows.filter((transaction) => transaction.amount > 0 && !transaction.isSelfTransfer)
  const spend = expenseRows.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
  const income = incomeRows.reduce((sum, transaction) => sum + transaction.amount, 0)
  const cashFlow = income - spend
  const needsReviewCount = unknownRows.length + analysisRows.filter((transaction) => transaction.confidence > 0 && transaction.confidence < 0.8).length
  const duplicateCount = liveTransactions.filter((transaction) => transaction.isDuplicate).length
  const selfTransferCount = liveTransactions.filter((transaction) => transaction.isSelfTransfer).length

  const trendData = useMemo(() => {
    const today = new Date()
    let monthKeys: string[] = []

    if (periodDateRange.label === 'This year') {
      const y = today.getFullYear()
      for (let m = 0; m <= today.getMonth(); m++) {
        monthKeys.push(`${y}-${String(m + 1).padStart(2, '0')}`)
      }
    } else if (overviewFrom && overviewTo) {
      const cur = new Date(`${overviewFrom}T12:00:00`)
      const end = new Date(`${overviewTo}T12:00:00`)
      cur.setDate(1)
      while (cur <= end && monthKeys.length < 36) {
        monthKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
        cur.setMonth(cur.getMonth() + 1)
      }
    } else if (periodDateRange.label === 'All time') {
      const dates = analysisRows.map((r) => r.date).filter(Boolean).sort()
      if (dates.length) {
        const cur = new Date(`${dates[0]}T12:00:00`)
        const end = new Date(`${dates[dates.length - 1]}T12:00:00`)
        cur.setDate(1)
        while (cur <= end && monthKeys.length < 36) {
          monthKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
          cur.setMonth(cur.getMonth() + 1)
        }
      }
    }

    if (!monthKeys.length) {
      monthKeys = Array.from({ length: 6 }, (_, index) => {
        const monthsBack = 5 - index
        const monthDate = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1)
        return `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
      })
    }

    return monthKeys.map((key) => {
      const [year, month] = key.split('-').map(Number)
      const monthDate = new Date(year, month - 1, 1)
      const rows = analysisRows.filter((transaction) => transaction.date.slice(0, 7) === key)
      return {
        month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monthDate),
        income: rows.filter((transaction) => transaction.amount > 0 && !transaction.isSelfTransfer).reduce((sum, transaction) => sum + transaction.amount, 0),
        spending: rows.filter((transaction) => transaction.amount < 0 && !transaction.isSelfTransfer).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
      }
    })
  }, [analysisRows, periodDateRange.label, overviewFrom, overviewTo])

  const trendSubtitle = useMemo(() => {
    if (periodDateRange.label === 'This year') return `Monthly cash flow for ${new Date().getFullYear()}`
    if (periodDateRange.label === 'All time') return 'Cash flow over all recorded statement dates'
    if (periodDateRange.label === 'This month' || periodDateRange.label === 'Last month') return `Monthly cash flow around ${periodDateRange.label.toLowerCase()}`
    return 'Cash flow for selected date range'
  }, [periodDateRange])

  const categoryData = useMemo(() => {
    const sums = new Map<Category, number>()
    for (const transaction of periodRows) {
      if (transaction.amount >= 0 || transaction.isSelfTransfer) continue
      sums.set(transaction.category, (sums.get(transaction.category) ?? 0) + Math.abs(transaction.amount))
    }
    return Array.from(sums, ([name, value]) => ({ name, value, color: getCategoryColor(name) })).sort((a, b) => b.value - a.value)
  }, [periodRows])

  const merchantData = useMemo(() => {
    const sums = new Map<string, number>()
    for (const transaction of expenseRows) sums.set(transaction.merchant, (sums.get(transaction.merchant) ?? 0) + Math.abs(transaction.amount))
    return Array.from(sums, ([merchant, amount]) => ({ merchant, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5)
  }, [expenseRows])

  const changeCategory = (transaction: Transaction, category: Category) => {
    saveMerchantCorrection(transaction.merchant, category)
    const key = normalizeMerchant(transaction.merchant).toLowerCase()
    setTransactions((current) => current.map((row) => {
      if (normalizeMerchant(row.merchant).toLowerCase() !== key) return row
      return {
        ...row,
        category,
        confidence: category === 'Unknown' ? 0 : 1,
        classificationMethod: category === 'Unknown' ? 'unknown' : 'manual',
      }
    }))
    setSavedCorrections(getSavedCorrections())
    setToast(`${transaction.merchant} saved as ${category}`)
    window.setTimeout(() => setToast(''), 3000)
  }

  const changeCategoriesBatch = (transactionsToUpdate: Transaction[], category: Category) => {
    if (!transactionsToUpdate.length) return
    const targetIds = new Set(transactionsToUpdate.map((t) => t.id))
    const merchantKeys = new Set(transactionsToUpdate.map((t) => normalizeMerchant(t.merchant).toLowerCase()))

    for (const t of transactionsToUpdate) {
      saveMerchantCorrection(t.merchant, category)
    }

    setTransactions((current) => current.map((row) => {
      const isDirectTarget = targetIds.has(row.id)
      const isMatchingMerchant = merchantKeys.has(normalizeMerchant(row.merchant).toLowerCase())
      if (!isDirectTarget && !isMatchingMerchant) return row
      return {
        ...row,
        category,
        confidence: category === 'Unknown' ? 0 : 1,
        classificationMethod: category === 'Unknown' ? 'unknown' : 'manual',
      }
    }))
    setSavedCorrections(getSavedCorrections())
    setToast(`Assigned ${category} to ${transactionsToUpdate.length} transaction${transactionsToUpdate.length === 1 ? '' : 's'}`)
    window.setTimeout(() => setToast(''), 3500)
  }

  const toggleDuplicate = (transaction: Transaction) => {
    const includeAsDistinct = transaction.isDuplicate
    setTransactions((current) => current.map((row) => row.id === transaction.id
      ? { ...row, isDuplicate: !includeAsDistinct, duplicateConfirmedDistinct: includeAsDistinct }
      : row))
    setStatements((current) => current.map((statement) => statement.id === transaction.sourceStatementId
      ? { ...statement, duplicateCount: Math.max(0, statement.duplicateCount + (includeAsDistinct ? -1 : 1)) }
      : statement))
    if (transaction.isDuplicate) {
      setToast('Transaction included in totals')
    } else {
      setToast('Transaction excluded as a likely duplicate')
    }
    window.setTimeout(() => setToast(''), 3000)
  }

  const importStatements = (files: ParsedStatement[]) => {
    const hasExistingReal = transactions.some((transaction) => !transaction.isDemo)
    const baseTransactions = hasExistingReal ? transactions : []
    const baseStatements = hasExistingReal ? statements : []
    const nextTransactions = [...baseTransactions]
    const newStatements: Statement[] = []
    let added = 0
    let duplicates = 0

    for (const file of files) {
      const isIndian = file.bankName && /karur vysya|hdfc|sbi|state bank|icici|axis|kotak|baroda|pnb|canara/i.test(file.bankName)
      if (isIndian) {
        for (const t of file.transactions) {
          if (t.currencyCode === 'USD') t.currencyCode = 'INR'
        }
      }
      const statementId = file.id
      const rows: Transaction[] = file.transactions.map((row) => {
        const duplicate = nextTransactions.find((existing) => !existing.isDuplicate && transactionDuplicateMatch(existing, { ...row, sourceStatementId: statementId } as Transaction))
        const transaction: Transaction = {
          ...row,
          sourceStatementId: statementId,
          isDuplicate: Boolean(duplicate),
          duplicateOf: duplicate?.id,
          directionChoice: row.directionChoice,
          dateOrderChoice: row.dateOrderChoice,
        }
        if (duplicate) duplicates += 1
        else added += 1
        nextTransactions.push(transaction)
        return transaction
      })
      newStatements.push({
        id: statementId,
        fileName: file.fileName,
        bankName: file.bankName ?? bankNameFromFile(file.fileName),
        importedAt: new Date().toISOString(),
        transactionCount: rows.length,
        duplicateCount: rows.filter((row) => row.isDuplicate).length,
        skippedCount: file.skippedRows,
        fileSize: file.fileSize,
        parser: file.parser,
        warnings: file.warnings,
      })
    }

    const currencyCounts = new Map<string, number>()
    for (const file of files) {
      for (const t of file.transactions) {
        currencyCounts.set(t.currencyCode, (currencyCounts.get(t.currencyCode) ?? 0) + 1)
      }
    }
    const dominantCurrency = Array.from(currencyCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!hasExistingReal && dominantCurrency) setCurrency(dominantCurrency)

    const currentMonthKey = new Date().toISOString().slice(0, 7)
    const hasThisMonth = nextTransactions.some((t) => t.date.slice(0, 7) === currentMonthKey)
    if (!hasThisMonth) {
      setOverviewFrom('')
      setOverviewTo('')
    }

    setTransactions(detectSelfTransfers(nextTransactions))
    setStatements([...baseStatements, ...newStatements])
    setSavedCorrections(getSavedCorrections())
    setShowDemo(false)
    setUploadOpen(false)
    setActivePage('overview')
    setToast(`${added} transaction${added === 1 ? '' : 's'} added${duplicates ? ` · ${duplicates} likely duplicate${duplicates === 1 ? '' : 's'} held out` : ''}`)
    window.setTimeout(() => setToast(''), 5000)
  }

  const removeStatement = (statement: Statement) => {
    if (!window.confirm(`Remove “${statement.fileName}” and its ${statement.transactionCount} transaction rows from this tab?`)) return
    const remaining = transactions.filter((row) => row.sourceStatementId !== statement.id)
    const rechecked: Transaction[] = []
    for (const row of remaining) {
      if (row.duplicateConfirmedDistinct) {
        rechecked.push({ ...row, isDuplicate: false })
        continue
      }
      const match = rechecked.find((earlier) => !earlier.isDuplicate && transactionDuplicateMatch(earlier, row))
      rechecked.push({ ...row, isDuplicate: Boolean(match), duplicateOf: match?.id, duplicateConfirmedDistinct: false })
    }
    const survivingStatements = statements.filter((row) => row.id !== statement.id)
    setStatements(survivingStatements.map((row) => ({
      ...row,
      duplicateCount: rechecked.filter((transaction) => transaction.sourceStatementId === row.id && transaction.isDuplicate).length,
    })))
    setTransactions(detectSelfTransfers(rechecked))
    setToast('Statement and its transaction rows removed')
    window.setTimeout(() => setToast(''), 3000)
  }

  const allFiltersActive = Boolean(search || categoryFilter.length > 0 || statementFilter.length > 0 || classificationFilter !== 'all' || typeFilter !== 'all' || fromDate || toDate || minAmount || maxAmount)
  const filteredTransactions = useMemo(() => liveTransactions
    .filter((transaction) => {
      if (typeFilter === 'expense') return transaction.amount < 0
      if (typeFilter === 'income') return transaction.amount > 0
      return true
    })
    .filter((transaction) => {
      if (!search.trim()) return true
      const needle = search.trim().toLowerCase()
      return transaction.description.toLowerCase().includes(needle) || transaction.merchant.toLowerCase().includes(needle) || transaction.category.toLowerCase().includes(needle)
    })
    .filter((transaction) => categoryFilter.length === 0 || categoryFilter.includes(transaction.category))
    .filter((transaction) => statementFilter.length === 0 || statementFilter.includes(transaction.sourceStatementId))
    .filter((transaction) => classificationFilter === 'all'
      || (classificationFilter === 'unknown' && transaction.category === 'Unknown')
      || (classificationFilter === 'manual' && (transaction.classificationMethod === 'manual' || transaction.classificationMethod === 'saved correction'))
      || (classificationFilter === 'review' && transaction.confidence > 0 && transaction.confidence < 0.8 && !transaction.isDuplicate)
      || (classificationFilter === 'duplicates' && transaction.isDuplicate)
      || (classificationFilter === 'transfers' && (transaction.isSelfTransfer || transaction.category === 'Transfers')))
    .filter((transaction) => !fromDate || transaction.date >= fromDate)
    .filter((transaction) => !toDate || transaction.date <= toDate)
    .filter((transaction) => !minAmount || Math.abs(transaction.amount) >= Number(minAmount))
    .filter((transaction) => !maxAmount || Math.abs(transaction.amount) <= Number(maxAmount))
    .sort((a, b) => b.date.localeCompare(a.date)), [
    liveTransactions, search, categoryFilter, statementFilter, classificationFilter, typeFilter, fromDate, toDate, minAmount, maxAmount,
  ])

  useEffect(() => {
    setTransactionPage(1)
  }, [search, categoryFilter, statementFilter, classificationFilter, typeFilter, fromDate, toDate, minAmount, maxAmount, pageSize])

  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / pageSize))
  const safeTransactionPage = Math.min(transactionPage, pageCount)
  const pageStart = filteredTransactions.length ? (safeTransactionPage - 1) * pageSize : 0
  const pageTransactions = filteredTransactions.slice(pageStart, pageStart + pageSize)

  const clearFilters = () => {
    setSearch('')
    setCategoryFilter([])
    setStatementFilter([])
    setClassificationFilter('all')
    setTypeFilter('all')
    setFromDate('')
    setToDate('')
    setMinAmount('')
    setMaxAmount('')
  }

  const categoryFilterOptions = useMemo(() => {
    return categories.map((cat) => ({
      value: cat,
      label: cat,
      color: getCategoryColor(cat),
      count: liveTransactions.filter((t) => t.category === cat).length,
    }))
  }, [categories, liveTransactions])

  const statementFilterOptions = useMemo(() => {
    return liveStatements.map((stmt) => ({
      value: stmt.id,
      label: stmt.bankName,
      count: liveTransactions.filter((t) => t.sourceStatementId === stmt.id).length,
    }))
  }, [liveStatements, liveTransactions])

  const exportTransactions = () => {
    const columns = ['Date', 'Description', 'Merchant', 'Amount', 'Currency', 'Category', 'Confidence', 'Classification', 'Sign choice', 'Date order', 'Statement', 'Duplicate', 'Sample data']
    const exportRows = activePage === 'transactions' ? filteredTransactions : liveTransactions
    const lines = exportRows.map((transaction) => [
      transaction.date,
      transaction.description,
      transaction.merchant,
      transaction.amount,
      transaction.currencyCode,
      transaction.category,
      transaction.confidence,
      transaction.classificationMethod,
      transaction.directionChoice ?? 'from statement',
      transaction.dateOrderChoice ?? 'from statement',
      liveStatements.find((statement) => statement.id === transaction.sourceStatementId)?.bankName ?? '',
      transaction.isDuplicate ? 'yes' : 'no',
      transaction.isDemo ? 'yes' : 'no',
    ].map(csvEscape).join(','))
    const blob = new Blob([`\uFEFF${[columns.join(','), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'spendwise-transactions.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const pageTitle: Record<PageKey, string> = {
    overview: 'Overview',
    transactions: 'All transactions',
    statements: 'Your statements',
    settings: 'Preferences',
  }

  const { recentTransactions, recentRangeLabel } = useMemo(() => {
    if (!analysisRows.length) {
      return { recentTransactions: [], recentRangeLabel: 'No transactions yet' }
    }

    const sorted = analysisRows.slice().sort((a, b) => b.date.localeCompare(a.date))
    const displayRows = sorted.slice(0, 25)

    return {
      recentTransactions: displayRows,
      recentRangeLabel: `Latest ${displayRows.length} transactions · Scroll to view more`,
    }
  }, [analysisRows])

  const activeRealStatements = activeImportedStatements

  if (!session) {
    return (
      <>
        <WelcomeLogin
          onLogin={(newSession) => {
            setSession(newSession)
            saveActiveSession(newSession)
            if (newSession.mode === 'demo') {
              setShowDemo(true)
            } else {
              setShowDemo(false)
            }
          }}
          onToast={(msg) => {
            setToast(msg)
            window.setTimeout(() => setToast(''), 3500)
          }}
        />
        {toast && <div className="toast-message" role="status"><CheckIcon />{toast}</div>}
      </>
    )
  }

  const handleLogout = () => {
    if (window.confirm('Sign out and return to the welcome screen? (Your local data is safely preserved on this device)')) {
      setSession(null)
      saveActiveSession(null)
      setUserMenuOpen(false)
      setToast('Signed out of workspace')
      window.setTimeout(() => setToast(''), 3000)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        unknownCount={unknownRows.length}
        statementCount={activeRealStatements.length}
        userSession={session}
        canInstallPwa={canInstall}
        onInstallPwa={promptInstall}
        onLogout={handleLogout}
      />
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{activePage === 'overview' ? 'Overview' : activePage === 'transactions' ? 'Transactions' : activePage === 'statements' ? 'Statements' : 'Preferences'}</strong></div>
          <div className="topbar-actions">
            {driveConnected ? (
              <button
                type="button"
                className={`gdrive-topbar-pill connected ${isDriveSyncing ? 'syncing' : ''}`}
                onClick={() => setActivePage('settings')}
                title={isDriveSyncing ? 'Syncing updates to Google Drive…' : 'Google Drive connected · Auto-sync active'}
              >
                {isDriveSyncing ? <RefreshCw size={13} className="spin" /> : <Cloud size={13} />}
                <span>{isDriveSyncing ? 'Syncing…' : 'Drive Synced'}</span>
              </button>
            ) : session?.mode === 'google' ? (
              <button
                type="button"
                className="gdrive-topbar-pill needs-connect"
                onClick={() => {
                  setActivePage('settings')
                  window.setTimeout(() => {
                    const btn = document.querySelector('.gdrive-connect-row .button-primary') as HTMLButtonElement | null
                    btn?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }, 120)
                }}
                title="Google Account signed in · Click to connect Google Drive storage"
              >
                <CloudOff size={13} />
                <span>Connect Drive</span>
              </button>
            ) : (
              <button
                type="button"
                className="gdrive-topbar-pill"
                onClick={() => setActivePage('settings')}
                title="IndexedDB active · Click to connect Google Drive"
              >
                <CloudOff size={13} />
                <span>Local only</span>
              </button>
            )}
            {canInstall && (
              <button
                type="button"
                className="install-topbar-pill"
                onClick={promptInstall}
                title="Install Spendwise as a standalone desktop/mobile app"
              >
                <Download size={13} />
                <span>Install App</span>
              </button>
            )}

            {/* User Account Menu / Login Trigger */}
            <div className="user-topbar-menu-wrap">
              <button
                type="button"
                className="user-topbar-pill"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-label="User account menu"
                title={`Signed in as: ${session?.name || 'User'} (${session?.mode === 'google' ? 'Google Drive' : 'Local Workspace'})`}
              >
                {session?.picture ? (
                  <img src={session.picture} alt="" className="user-topbar-avatar" />
                ) : (
                  <div className="user-topbar-avatar-placeholder">
                    {session?.name ? session.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <span className="user-topbar-name">{session?.name || 'Account'}</span>
                <ChevronDown size={13} className={`chevron-transition ${userMenuOpen ? 'open' : ''}`} />
              </button>

              {userMenuOpen && (
                <div className="user-dropdown-menu">
                  <div className="user-dropdown-header">
                    <div className="user-dropdown-profile">
                      {session?.picture ? (
                        <img src={session.picture} alt="" className="user-dropdown-avatar" />
                      ) : (
                        <div className="user-dropdown-avatar-placeholder">
                          {session?.name ? session.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                      )}
                      <div className="user-dropdown-info">
                        <strong>{session?.name || 'User'}</strong>
                        <span title={session?.email}>{session?.email || 'Local Offline Account'}</span>
                      </div>
                    </div>
                    <span className={`user-dropdown-mode-badge ${session?.mode === 'google' ? (driveConnected ? 'badge-google' : 'badge-warning') : 'badge-local'}`}>
                      {session?.mode === 'google' ? (driveConnected ? 'Google Drive Synced' : 'Drive Disconnected') : session?.mode === 'demo' ? 'Sample Demo' : 'Local Workspace'}
                    </span>
                  </div>

                  <div className="user-dropdown-actions">
                    {session?.mode === 'google' && !driveConnected && (
                      <button
                        type="button"
                        className="user-dropdown-item user-dropdown-connect-highlight"
                        onClick={() => {
                          setUserMenuOpen(false)
                          setActivePage('settings')
                          window.setTimeout(() => {
                            const btn = document.querySelector('.gdrive-connect-row .button-primary') as HTMLButtonElement | null
                            btn?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            btn?.click()
                          }, 150)
                        }}
                      >
                        <Cloud size={14} />
                        <strong>Connect Google Drive</strong>
                      </button>
                    )}
                    <button
                      type="button"
                      className="user-dropdown-item"
                      onClick={() => {
                        setUserMenuOpen(false)
                        setActivePage('settings')
                      }}
                    >
                      <UserCircle2 size={14} />
                      <span>Account Management</span>
                    </button>

                    <button
                      type="button"
                      className="user-dropdown-item"
                      onClick={() => {
                        setUserMenuOpen(false)
                        setAuthModal({ open: true, mode: 'login' })
                      }}
                    >
                      <LogIn size={14} />
                      <span>Switch Account / Log In</span>
                    </button>

                    <button
                      type="button"
                      className="user-dropdown-item"
                      onClick={() => {
                        setUserMenuOpen(false)
                        setAuthModal({ open: true, mode: 'signup' })
                      }}
                    >
                      <UserPlus size={14} />
                      <span>Create New Account</span>
                    </button>

                    <div className="user-dropdown-divider" />

                    <button
                      type="button"
                      className="user-dropdown-item text-danger"
                      onClick={() => {
                        setUserMenuOpen(false)
                        handleLogout()
                      }}
                    >
                      <LogOut size={14} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button className="button button-primary top-upload" onClick={() => setUploadOpen(true)}><Plus size={16} /> Add statements</button>
            <button className="mobile-upload-button" onClick={() => setUploadOpen(true)} aria-label="Add statements"><Plus size={18} /></button>
          </div>
        </header>

        <div className={`page-wrap ${activePage === 'transactions' ? 'page-wrap-transactions' : ''}`}>
          <div className="page-heading-row">
            <div className="page-heading-copy">
              <div className="eyebrow"><span className="eyebrow-mark" /> PERSONAL FINANCE · {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()}</div>
              <h1>{activePage === 'overview' ? `${periodGreeting()}, ${session?.name || 'Alex'}` : pageTitle[activePage]}</h1>
            </div>
            {activePage === 'overview' && (
              <div className="heading-controls">
                <div className="period-filter-group">
                  <DateRangePicker
                    value={{ from: overviewFrom, to: overviewTo }}
                    onChange={({ from, to }) => {
                      setOverviewFrom(from)
                      setOverviewTo(to)
                    }}
                    placeholder="All time"
                  />
                </div>
                <button className="icon-button export-button" title="Export transaction data as a CSV" onClick={exportTransactions}><Download size={17} /></button>
              </div>
            )}
            {activePage === 'transactions' && (
              <button className="button button-secondary export-button-wide" onClick={exportTransactions}><Download size={15} /> Export CSV</button>
            )}
          </div>

          {sampleActive && activePage === 'overview' && (
            <div className="sample-banner">
              <div className="sample-banner-icon"><Sparkles size={16} /></div>
              <div><strong>Sample data active</strong> · <span>Upload statements to replace demo transactions.</span></div>
              <button className="sample-dismiss" onClick={() => { setShowDemo(false); setTransactions((current) => current.filter((transaction) => !transaction.isDemo)); setStatements((current) => current.filter((statement) => !statement.isDemo)) }}>Clear sample</button>
            </div>
          )}

          {activePage === 'overview' && (
            <>
              <section className="stat-grid" aria-label="Cash flow summary">
                <StatCard
                  label="TOTAL SPENDING"
                  value={formatMoney(spend, activeCurrency, true)}
                  note={`${expenseRows.length} purchases · ${periodDateRange.label.toLowerCase()}`}
                  icon={<CircleArrowDown size={17} />}
                  tone="warm"
                  onClick={() => {
                    setTypeFilter('expense')
                    setCategoryFilter([])
                    setStatementFilter([])
                    setClassificationFilter('all')
                    setFromDate(periodDateRange.start || '')
                    setToDate(periodDateRange.end || '')
                    setActivePage('transactions')
                  }}
                  actionHint="View spending transactions"
                />
                <StatCard
                  label="TOTAL INCOME"
                  value={formatMoney(income, activeCurrency, true)}
                  note={`${incomeRows.length} deposits · ${periodDateRange.label.toLowerCase()}`}
                  icon={<CircleArrowUp size={17} />}
                  onClick={() => {
                    setTypeFilter('income')
                    setCategoryFilter([])
                    setStatementFilter([])
                    setClassificationFilter('all')
                    setFromDate(periodDateRange.start || '')
                    setToDate(periodDateRange.end || '')
                    setActivePage('transactions')
                  }}
                  actionHint="View income transactions"
                />
                <StatCard
                  label="NET CASH FLOW"
                  value={formatMoney(cashFlow, activeCurrency, true)}
                  note={cashFlow >= 0 ? 'More in than out' : 'Spending exceeds income'}
                  icon={<WalletCards size={17} />}
                  tone="accent"
                  onClick={() => {
                    setTypeFilter('all')
                    setCategoryFilter([])
                    setStatementFilter([])
                    setClassificationFilter('all')
                    setFromDate(periodDateRange.start || '')
                    setToDate(periodDateRange.end || '')
                    setActivePage('transactions')
                  }}
                  actionHint="View cash flow transactions"
                />
                <StatCard
                  label="TRANSACTIONS"
                  value={String(periodRows.length)}
                  note={`${needsReviewCount} need a category review`}
                  icon={<ChartNoAxesColumnIncreasing size={17} />}
                  onClick={() => {
                    setTypeFilter('all')
                    setCategoryFilter([])
                    setStatementFilter([])
                    setClassificationFilter('all')
                    setFromDate(periodDateRange.start || '')
                    setToDate(periodDateRange.end || '')
                    setActivePage('transactions')
                  }}
                  actionHint="View all transactions"
                />
              </section>

              {periodRows.length === 0 && analysisRows.length > 0 && (
                <div className="period-empty-notice">
                  <AlertCircle size={15} />
                  <span>No transactions in {periodDateRange.label} ({analysisRows.length} total). Switch to <button type="button" className="inline-action-btn" onClick={() => { setOverviewFrom(''); setOverviewTo('') }}>All time</button>.</span>
                </div>
              )}

              <Suspense fallback={<section className="analytics-grid"><div className="panel chart-loading">Preparing your charts…</div></section>}>
                <DashboardCharts
                  trendData={trendData}
                  categoryData={categoryData}
                  spend={spend}
                  currencyCode={activeCurrency}
                  period={periodDateRange.label}
                  trendSubtitle={trendSubtitle}
                  unknownCount={unknownRows.length}
                  analyzedCount={analysisRows.length}
                  onCategoryClick={(category) => {
                    setCategoryFilter([category])
                    if (periodDateRange.start) setFromDate(periodDateRange.start)
                    if (periodDateRange.end) setToDate(periodDateRange.end)
                    setActivePage('transactions')
                  }}
                  onSeeTransactions={() => {
                    setCategoryFilter([])
                    if (periodDateRange.start) setFromDate(periodDateRange.start)
                    if (periodDateRange.end) setToDate(periodDateRange.end)
                    setActivePage('transactions')
                  }}
                  onUpload={() => setUploadOpen(true)}
                />
              </Suspense>

              <section className="lower-grid">
                <article className="panel recent-panel">
                  <div className="panel-heading panel-heading-simple">
                    <div>
                      <h2>Recent transactions</h2>
                      <span className="recent-subhead">{recentRangeLabel}</span>
                    </div>
                    <div className="recent-header-actions">
                      <button className="view-all-link" onClick={() => {
                        setFromDate('')
                        setToDate('')
                        setActivePage('transactions')
                      }}>View all <ArrowRight size={14} /></button>
                    </div>
                  </div>
                  <TransactionsTable
                    transactions={recentTransactions}
                    statements={liveStatements}
                    onChangeCategory={changeCategory}
                    onToggleDuplicate={toggleDuplicate}
                    onToggleSelfTransfer={toggleSelfTransfer}
                    availableCategories={categories}
                    currencyCode={activeCurrency}
                    compact
                  />
                </article>

                <div className="right-rail">
                  <article className="review-card">
                    <div className="review-card-heading"><span className="review-icon"><ShieldAlert size={16} /></span><span className="review-counter">{unknownRows.length}</span></div>
                    <div className="review-card-title">Needs a closer look</div>
                    {unknownRows.length ? (
                      <div className="unknown-list">
                        {unknownRows.slice(0, 3).map((transaction) => (
                          <div className="unknown-item" key={transaction.id}>
                            <div className="unknown-item-copy"><strong>{transaction.merchant}</strong><span>{relativeDate(transaction.date)} · {formatMoney(transaction.amount, activeCurrency)}</span></div>
                          </div>
                        ))}
                        {unknownRows.length > 3 && <button className="view-unknown-link" onClick={() => { setClassificationFilter('unknown'); setActivePage('transactions') }}>{unknownRows.length - 3} more to review <ArrowRight size={13} /></button>}
                      </div>
                    ) : (
                      <div className="all-clear-note"><BadgeCheck size={16} /><span>All transactions categorized</span></div>
                    )}
                    {unknownRows.length > 0 && <button className="review-all-button" onClick={() => { setClassificationFilter('unknown'); setActivePage('transactions') }}>Review categories <ArrowRight size={14} /></button>}
                  </article>

                  <article className="panel merchants-panel">
                    <div className="panel-heading panel-heading-simple">
                      <div><h2>Top merchants</h2></div>
                    </div>
                    {merchantData.length ? <div className="merchant-rank-list">{merchantData.slice(0, 4).map((row, index) => (
                      <div className="merchant-rank-item" key={row.merchant}>
                        <span className={`merchant-rank-number rank-${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
                        <span className="merchant-rank-name">{row.merchant}</span>
                        <strong>{formatMoney(row.amount, activeCurrency, true)}</strong>
                      </div>
                    ))}</div> : <div className="small-empty-message">Your top merchants will appear here.</div>}
                  </article>
                </div>
              </section>
            </>
          )}

          {activePage === 'transactions' && (
            <section className="panel ledger-panel">
              <div className="ledger-toolbar">
                <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a merchant or description…" aria-label="Search transactions" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</div>
                <div className="ledger-result-count"><span>{filteredTransactions.length}</span> of {liveTransactions.length} rows</div>
                {allFiltersActive && <button className="clear-filters-button" onClick={clearFilters}><X size={13} /> Clear filters</button>}
              </div>
              <div className="filter-toolbar">
                <MultiSelectFilter
                  icon={<Filter size={13} />}
                  allLabel="All categories"
                  selectedValues={categoryFilter}
                  options={categoryFilterOptions}
                  onChange={(selected) => {
                    setCategoryFilter(selected)
                    setTransactionPage(1)
                  }}
                  searchPlaceholder="Search categories…"
                  ariaLabel="Filter by categories"
                />

                <MultiSelectFilter
                  icon={<Landmark size={13} />}
                  allLabel="All statements"
                  selectedValues={statementFilter}
                  options={statementFilterOptions}
                  onChange={(selected) => {
                    setStatementFilter(selected)
                    setTransactionPage(1)
                  }}
                  searchPlaceholder="Search statements…"
                  ariaLabel="Filter by statements"
                />

                <Select value={classificationFilter} onValueChange={(v) => setClassificationFilter(v as ClassificationFilter)}>
                  <SelectTrigger
                    className="shadcn-filter-trigger"
                    icon={<ShieldCheck size={13} />}
                    isActive={classificationFilter !== 'all'}
                    aria-label="Filter by classification status"
                  >
                    <SelectValue placeholder="All classifications" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Status</SelectLabel>
                      <SelectItem value="all">All classifications</SelectItem>
                      <SelectItem value="unknown">Needs category</SelectItem>
                      <SelectItem value="transfers">Transfers & Self-transfers</SelectItem>
                      <SelectItem value="manual">Manual corrections</SelectItem>
                      <SelectItem value="review">Low confidence</SelectItem>
                      <SelectItem value="duplicates">Likely duplicates</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | 'expense' | 'income')}>
                  <SelectTrigger
                    className="shadcn-filter-trigger"
                    icon={<ArrowUpDown size={13} />}
                    isActive={typeFilter !== 'all'}
                    aria-label="Filter by transaction type"
                  >
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Type</SelectLabel>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="expense">Spending only</SelectItem>
                      <SelectItem value="income">Income only</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <DateRangePicker
                  value={{ from: fromDate, to: toDate }}
                  onChange={({ from, to }) => {
                    setFromDate(from)
                    setToDate(to)
                  }}
                  placeholder="Filter by date range"
                />
                <AmountRangePicker
                  minAmount={minAmount}
                  maxAmount={maxAmount}
                  onChange={(min, max) => {
                    setMinAmount(min)
                    setMaxAmount(max)
                  }}
                  currencyCode={activeCurrency}
                />
                {unknownRows.length > 0 && classificationFilter !== 'unknown' && (
                  <button
                    type="button"
                    className="quick-unknown-chip"
                    onClick={() => setClassificationFilter('unknown')}
                    title="Filter to transactions that need a category"
                  >
                    <ShieldAlert size={13} />
                    <span>{unknownRows.length} need category</span>
                  </button>
                )}
              </div>
              {classificationFilter === 'duplicates' && <div className="duplicate-explanation"><RotateCcw size={14} /> Duplicates are excluded from totals. Click a badge on any row to restore it.</div>}
              {classificationFilter === 'unknown' && (
                <div className="needs-category-banner">
                  <div className="needs-category-info">
                    <ShieldAlert size={15} />
                    {filteredTransactions.length > 0 ? (
                      <span><strong>{filteredTransactions.length} uncategorized transactions.</strong> Assign below or select rows for bulk update.</span>
                    ) : (
                      <span><strong>All transactions categorized.</strong> No unassigned rows remain.</span>
                    )}
                  </div>
                  {filteredTransactions.length === 0 && (
                    <button className="button button-small button-secondary" onClick={() => setClassificationFilter('all')}>
                      View all transactions
                    </button>
                  )}
                </div>
              )}
              <TransactionsTable
                transactions={pageTransactions}
                statements={liveStatements}
                onChangeCategory={changeCategory}
                onBatchChangeCategory={changeCategoriesBatch}
                onToggleDuplicate={toggleDuplicate}
                onToggleSelfTransfer={toggleSelfTransfer}
                showStatement
                allFilteredTransactions={filteredTransactions}
                resetSelectionKey={`${classificationFilter}-${categoryFilter.join(',')}-${statementFilter.join(',')}-${search}-${fromDate}-${toDate}-${transactionPage}`}
                availableCategories={categories}
                currencyCode={activeCurrency}
              />
              <div className="ledger-pagination" aria-label="Transaction pages">
                <span className="ledger-page-range">{filteredTransactions.length ? `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, filteredTransactions.length)} of ${filteredTransactions.length}` : 'No transactions'}</span>
                <div className="page-size-control">
                  <span>Rows per page</span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="shadcn-pagesize-trigger" aria-label="Rows per page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="250">250</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="1000">1,000</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="page-buttons"><button className="button button-secondary button-small" onClick={() => setTransactionPage((page) => Math.max(1, page - 1))} disabled={safeTransactionPage <= 1} aria-label="Previous page">Previous</button><span>Page {safeTransactionPage} of {pageCount}</span><button className="button button-secondary button-small" onClick={() => setTransactionPage((page) => Math.min(pageCount, page + 1))} disabled={safeTransactionPage >= pageCount} aria-label="Next page">Next</button></div>
              </div>
            </section>
          )}

          {activePage === 'statements' && (
            <section className="statements-layout">
              <article className="panel statements-panel">
                <div className="statements-topline">
                  <div><h2>Imported statements</h2></div>
                  <button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={16} /> Add statements</button>
                </div>
                <div className="statement-summary-strip">
                  <div><span>Statements</span><strong>{liveStatements.length}</strong></div>
                  <div><span>Imported rows</span><strong>{liveTransactions.length}</strong></div>
                  <div><span>Self-transfers paired</span><strong>{selfTransferCount}</strong></div>
                  <div
                    className={`summary-stat-box ${duplicateCount > 0 ? 'stat-clickable' : ''}`}
                    onClick={() => {
                      if (duplicateCount > 0) {
                        const firstWithDups = liveStatements.find((s) => {
                          return liveTransactions.some((t) => t.sourceStatementId === s.id && (t.isDuplicate || t.duplicateConfirmedDistinct))
                        })
                        if (firstWithDups) {
                          setReviewingDuplicateStatement(firstWithDups)
                        }
                      }
                    }}
                    role={duplicateCount > 0 ? 'button' : undefined}
                    tabIndex={duplicateCount > 0 ? 0 : undefined}
                    title={duplicateCount > 0 ? 'Click to review duplicates in a popup window' : undefined}
                  >
                    <span>Held out as duplicates</span>
                    <strong>{duplicateCount}</strong>
                  </div>
                  <div className="statement-currency-pill">
                    <span>Currency</span>
                    <Select value={activeCurrency} onValueChange={handleCurrencyChange}>
                      <SelectTrigger className="shadcn-currency-trigger-compact" aria-label="Statement display currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectGroup>
                          <SelectLabel>Currency</SelectLabel>
                          {Array.from(new Set(['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CHF', 'SGD', 'HKD', 'AED', 'ZAR', 'MXN', ...availableCurrencies, activeCurrency])).map((code) => (
                            <SelectItem key={code} value={code}>
                              {code} ({currencyName(code)})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {liveStatements.length ? (
                  <div className="statement-list">
                    {liveStatements.slice().sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map((statement) => {
                      const statementDuplicates = liveTransactions.filter(
                        (t) => t.sourceStatementId === statement.id && (t.isDuplicate || t.duplicateConfirmedDistinct)
                      )
                      return (
                        <div className="statement-card-container" key={statement.id}>
                          <div className="statement-row">
                            <div className={`statement-file-icon ${statement.isDemo ? 'statement-sample-icon' : ''}`}><FileStack size={16} /></div>
                            <div className="statement-file-main">
                              <div className="statement-name-row">
                                <strong>{statement.fileName}</strong>
                                {statement.isDemo && <span className="demo-mini-tag">SAMPLE</span>}
                                <span className="statement-format">{statement.parser}</span>
                              </div>
                              <div className="statement-sub-row">
                                <span>{statement.bankName} · {(statement.fileSize / 1024).toFixed(0)} KB</span>
                                {(() => {
                                  const isActionable = (w: string) => /could not be parsed|skipped|had values in both debit and credit/i.test(w)
                                  const actionable = statement.warnings?.filter(isActionable) || []
                                  const info = statement.warnings?.filter((w) => !isActionable(w)) || []
                                  return (
                                    <>
                                      {actionable.map((warning) => (
                                        <span className="statement-warning" key={warning}><AlertCircle size={11} />{warning}</span>
                                      ))}
                                      {info.length > 0 && (
                                        <details className="statement-info-details">
                                          <summary><Info size={11} /> {info.length} parsing {info.length === 1 ? 'detail' : 'details'}</summary>
                                          <ul>
                                            {info.map((n) => <li key={n}>{n}</li>)}
                                          </ul>
                                        </details>
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            </div>
                            <div className="statement-row-stat"><strong>{statement.transactionCount}</strong><span>transactions</span></div>
                            <button
                              type="button"
                              className={`statement-row-stat statement-row-duplicates ${statementDuplicates.length > 0 ? 'stat-clickable' : ''}`}
                              onClick={() => {
                                if (statementDuplicates.length > 0) {
                                  setReviewingDuplicateStatement(statement)
                                }
                              }}
                              disabled={statementDuplicates.length === 0}
                              title={statementDuplicates.length > 0 ? 'Click to review duplicates in a popup window' : 'No duplicates in this statement'}
                            >
                              <strong>{statement.duplicateCount}</strong>
                              <span>duplicates</span>
                            </button>
                            <div className="statement-row-stat"><strong>{statement.skippedCount}</strong><span>skipped</span></div>
                            <button className="icon-button statement-remove" aria-label={`Remove ${statement.fileName}`} title="Remove statement and its transactions" onClick={() => removeStatement(statement)}><X size={14} /></button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="statements-empty"><span className="empty-icon"><FileClock size={21} /></span><h3>No statements yet</h3><button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={16} /> Upload statements</button></div>
                )}
              </article>
            </section>
          )}

          {activePage === 'settings' && (
            <section className="settings-layout">
              {/* Left Column: Account & Storage Sync */}
              <div className="settings-col">
                <AccountManagementPanel
                  currentSession={session}
                  driveConnected={driveConnected}
                  onConnectDrive={() => {
                    const btn = document.querySelector('.gdrive-connect-row .button-primary') as HTMLButtonElement | null
                    if (btn) {
                      btn.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      btn.click()
                    }
                  }}
                  onUpdateSession={(updated) => {
                    setSession(updated)
                    saveActiveSession(updated)
                  }}
                  onOpenAuthModal={(mode) => setAuthModal({ open: true, mode })}
                  onLogout={handleLogout}
                  onToast={(msg) => {
                    setToast(msg)
                    window.setTimeout(() => setToast(''), 3000)
                  }}
                />

                <article className="panel currency-settings-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Primary Currency</h2>
                      <p>Default currency for cash flow totals, spending breakdown, and statements.</p>
                    </div>
                    <div className="currency-selector-wrap">
                      <Select value={activeCurrency} onValueChange={handleCurrencyChange}>
                        <SelectTrigger className="shadcn-currency-trigger" aria-label="Display and import default currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                          <SelectGroup>
                            <SelectLabel>Currency</SelectLabel>
                            {Array.from(new Set(['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CHF', 'SGD', 'HKD', 'AED', 'ZAR', 'MXN', ...availableCurrencies, activeCurrency])).map((code) => (
                              <SelectItem key={code} value={code}>
                                {code} ({currencyName(code)})
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </article>

                <GoogleDriveSyncPanel
                  currentSnapshot={currentSnapshot}
                  currentSession={session}
                  onRestoreSnapshot={handleRestoreSnapshot}
                  onResetData={handleResetData}
                  isExternalSyncing={isDriveSyncing}
                  onConnectionChange={(connected) => {
                    setDriveConnected(connected)
                    if (connected) {
                      const user = getStoredUser()
                      if (user && session?.mode !== 'google') {
                        const updated = {
                          mode: 'google' as const,
                          name: user.name || session?.name || 'Google User',
                          email: user.email,
                          picture: user.picture || session?.picture,
                          accountId: `google-${user.email.toLowerCase()}`,
                        }
                        setSession(updated)
                        saveActiveSession(updated)
                      }
                    }
                  }}
                  onToast={(msg) => {
                    setToast(msg)
                    window.setTimeout(() => setToast(''), 3500)
                  }}
                />
              </div>

              {/* Right Column: Categories & Learned Rules */}
              <div className="settings-col">
                <article className="panel categories-management-panel">
                  <div className="correction-header">
                    <div>
                      <h2>Categories</h2>
                    </div>
                    <div className="category-header-actions">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={handleResetCategories}
                        title="Reset built-in categories to default"
                      >
                        <RotateCcw size={13} /> Reset defaults
                      </button>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={handleReclassifyAll}
                        title="Re-run classification rules across all loaded transactions"
                      >
                        <Sparkles size={13} /> Re-classify all
                      </button>
                    </div>
                  </div>

                  <form
                    className="add-category-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (handleAddCategory(newCategoryName)) {
                        setNewCategoryName('')
                      }
                    }}
                  >
                    <input
                      type="text"
                      className="add-category-input"
                      placeholder="Add custom category (e.g. Investments, Pets, Gym, Subscriptions)…"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <button type="submit" className="button button-primary button-small" disabled={!newCategoryName.trim()}>
                      <Plus size={14} /> Add category
                    </button>
                  </form>

                  <div className="category-section-block category-section-card">
                    <button
                      type="button"
                      className="category-section-toggle"
                      onClick={() => setCustomCategoriesOpen((prev) => !prev)}
                      aria-expanded={customCategoriesOpen}
                    >
                      <div className="category-toggle-title">
                        <ChevronRight
                          size={15}
                          className={`category-toggle-chevron ${customCategoriesOpen ? 'is-open' : ''}`}
                        />
                        <strong>Custom categories</strong>
                      </div>
                      <span className="category-toggle-count">{customCategories.length} added</span>
                    </button>
                    {customCategoriesOpen && (
                      <div className="category-section-content">
                        {customCategories.length > 0 ? (
                          <div className="custom-category-grid">
                            {customCategories.map((cat) => {
                              const usageCount = liveTransactions.filter((t) => t.category === cat).length
                              return (
                                <div className="custom-category-card" key={cat}>
                                  <div className="custom-category-left">
                                    <span className="category-dot" style={{ backgroundColor: getCategoryColor(cat) }} />
                                    <strong>{cat}</strong>
                                  </div>
                                  <div className="custom-category-right">
                                    <span className="category-usage-badge">{usageCount} {usageCount === 1 ? 'row' : 'rows'}</span>
                                    <button
                                      type="button"
                                      className="category-delete-btn"
                                      title={`Delete category "${cat}"`}
                                      aria-label={`Delete category "${cat}"`}
                                      onClick={() => {
                                        if (usageCount > 0) {
                                          if (!window.confirm(`"${cat}" is currently assigned to ${usageCount} transaction${usageCount === 1 ? '' : 's'}.\n\nDeleting this category will move those transactions to "Unknown" (Needs category) so you can re-assign them.\n\nDo you want to proceed?`)) {
                                            return
                                          }
                                        }
                                        handleDeleteCategory(cat)
                                      }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="custom-category-empty">
                            <FolderPlus size={18} />
                            <span>No custom categories yet. Add labels like <em>Investments</em>, <em>Pets</em>, or <em>Subscriptions</em> above.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="category-section-block category-section-card">
                    <button
                      type="button"
                      className="category-section-toggle"
                      onClick={() => setBuiltinCategoriesOpen((prev) => !prev)}
                      aria-expanded={builtinCategoriesOpen}
                    >
                      <div className="category-toggle-title">
                        <ChevronRight
                          size={15}
                          className={`category-toggle-chevron ${builtinCategoriesOpen ? 'is-open' : ''}`}
                        />
                        <strong>Active built-in categories</strong>
                      </div>
                      <span className="category-toggle-count">{getActiveBuiltinCategories().filter((c) => c !== 'Other' && c !== 'Unknown').length} active</span>
                    </button>
                    {builtinCategoriesOpen && (
                      <div className="category-section-content">
                        <div className="default-category-chips">
                          {getActiveBuiltinCategories().filter((c) => c !== 'Other' && c !== 'Unknown').map((cat) => {
                            const usageCount = liveTransactions.filter((t) => t.category === cat).length
                            return (
                              <span className="default-category-chip active-builtin-chip" key={cat}>
                                <span className="category-dot" style={{ backgroundColor: getCategoryColor(cat) }} />
                                <span>{cat}</span>
                                {usageCount > 0 && <small className="chip-count">({usageCount})</small>}
                                <button
                                  type="button"
                                  className="chip-remove-btn"
                                  title={`Remove built-in category "${cat}"`}
                                  aria-label={`Remove built-in category "${cat}"`}
                                  onClick={() => {
                                    if (usageCount > 0) {
                                      if (!window.confirm(`"${cat}" is currently assigned to ${usageCount} transaction${usageCount === 1 ? '' : 's'}.\n\nRemoving this category will move those transactions to "Unknown" (Needs category) so you can re-assign them.\n\nDo you want to proceed?`)) {
                                        return
                                      }
                                    }
                                    handleDisableBuiltin(cat)
                                  }}
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {disabledCategories.length > 0 && (
                    <div className="category-section-block category-section-card">
                      <button
                        type="button"
                        className="category-section-toggle"
                        onClick={() => setRemovedCategoriesOpen((prev) => !prev)}
                        aria-expanded={removedCategoriesOpen}
                      >
                        <div className="category-toggle-title">
                          <ChevronRight
                            size={15}
                            className={`category-toggle-chevron ${removedCategoriesOpen ? 'is-open' : ''}`}
                          />
                          <strong>Removed built-in categories</strong>
                        </div>
                        <span className="category-toggle-count">{disabledCategories.length} inactive</span>
                      </button>
                      {removedCategoriesOpen && (
                        <div className="category-section-content">
                          <div className="default-category-chips">
                            {disabledCategories.map((cat) => (
                              <span className="default-category-chip disabled-builtin-chip" key={cat}>
                                <span className="category-dot disabled-category-dot" style={{ backgroundColor: getCategoryColor(cat) }} />
                                <span className="disabled-category-name">{cat}</span>
                                <button
                                  type="button"
                                  className="chip-restore-btn"
                                  title={`Restore "${cat}" to active categories`}
                                  onClick={() => handleEnableBuiltin(cat)}
                                >
                                  <Plus size={12} /> Restore
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>

                <article className="panel corrections-panel">
                  <div className="correction-header"><div><h2>Saved Rules</h2></div><span className="correction-count">{Object.keys(savedCorrections).length}</span></div>
                  {Object.keys(savedCorrections).length ? (
                    <>
                      <div className="correction-list">{Object.entries(savedCorrections).sort(([a], [b]) => a.localeCompare(b)).map(([merchant, category]) => (
                        <div className="correction-row" key={merchant}><div className="merchant-initial correction-initial">{merchant.slice(0, 1).toUpperCase()}</div><strong>{titleCase(merchant)}</strong><ArrowRight size={13} /><span className={`category-chip category-chip-${categorySlug(category)}`}>{category}</span></div>
                      ))}</div>
                      <button className="button button-danger-quiet" onClick={() => { if (window.confirm('Clear all saved merchant category corrections from this browser?')) { clearSavedCorrections(); setSavedCorrections({}) } }}>Clear rules</button>
                    </>
                  ) : (
                    <div className="corrections-empty"><span className="empty-icon"><Sparkles size={18} /></span><strong>No saved rules yet</strong><span>Categorizing merchants will automatically remember them here.</span></div>
                  )}
                </article>
              </div>
            </section>
          )}
        </div>
      </main>

      <MobileBottomNav
        activePage={activePage}
        onNavigate={setActivePage}
        unknownCount={unknownRows.length}
        statementCount={activeRealStatements.length}
        onOpenUpload={() => setUploadOpen(true)}
      />

      {/* Login & Sign Up Modal */}
      {authModal.open && (
        <div className="auth-modal-backdrop" onClick={() => setAuthModal({ open: false, mode: 'login' })}>
          <div className="auth-modal-container" onClick={(e) => e.stopPropagation()}>
            <WelcomeLogin
              initialMode={authModal.mode}
              onClose={() => setAuthModal({ open: false, mode: 'login' })}
              onLogin={(newSession) => {
                setSession(newSession)
                saveActiveSession(newSession)
                setDriveConnected(Boolean(getStoredToken()))
                setAuthModal({ open: false, mode: 'login' })
                if (newSession.mode === 'demo') {
                  setShowDemo(true)
                } else {
                  setShowDemo(false)
                }
              }}
              onToast={(msg) => {
                setToast(msg)
                window.setTimeout(() => setToast(''), 3500)
              }}
            />
          </div>
        </div>
      )}

      {uploadOpen && <UploadDialog open={uploadOpen} defaultCurrency={activeCurrency} onClose={() => setUploadOpen(false)} onImport={importStatements} />}
      {reviewingDuplicateStatement && (
        <DuplicatesReviewModal
          open={Boolean(reviewingDuplicateStatement)}
          statement={reviewingDuplicateStatement}
          duplicates={liveTransactions.filter(
            (t) => t.sourceStatementId === reviewingDuplicateStatement.id && (t.isDuplicate || t.duplicateConfirmedDistinct)
          )}
          liveTransactions={liveTransactions}
          liveStatements={liveStatements}
          categories={categories}
          currencyCode={activeCurrency}
          onToggleDuplicate={toggleDuplicate}
          onChangeCategory={changeCategory}
          onClose={() => setReviewingDuplicateStatement(null)}
        />
      )}
      {toast && <div className="toast-message" role="status"><CheckIcon />{toast}</div>}
    </div>
  )
}

function CheckIcon() {
  return <span className="toast-check"><ShieldCheck size={14} /></span>
}

export default App
