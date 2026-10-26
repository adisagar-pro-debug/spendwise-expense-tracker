import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, ArrowRight, BadgeCheck, BarChart3, CalendarDays,
  ChartNoAxesColumnIncreasing, ChevronDown, ChevronRight, CircleArrowDown, CircleArrowUp, CloudOff, Download,
  FileCheck2, FileClock, FileStack, Filter, Landmark, LockKeyhole, Plus, RotateCcw, Search, ShieldAlert, ShieldCheck,
  Sparkles, WalletCards, X,
} from 'lucide-react'
import Sidebar, { type PageKey } from './components/Sidebar'
import StatCard from './components/StatCard'
import TransactionsTable from './components/TransactionsTable'
import UploadDialog from './components/UploadDialog'
import { demoStatements, demoTransactions } from './data/demo-data'
import { CATEGORIES, clearSavedCorrections, getSavedCorrections, normalizeMerchant, saveMerchantCorrection } from './lib/categories'
import { formatDate, formatMoney, localISODate, relativeDate, titleCase, csvEscape } from './lib/format'
import { CATEGORY_COLORS, categorySlug } from './lib/presentation'
import type { Category, ParsedStatement, Statement, Transaction } from './types'

const DashboardCharts = lazy(() => import('./components/DashboardCharts'))
const PERIODS = ['This month', 'Last month', 'Last 3 months', 'Last 6 months'] as const
type Period = typeof PERIODS[number]
type ClassificationFilter = 'all' | 'unknown' | 'manual' | 'review' | 'duplicates'

function monthStart(monthsAgo: number): string {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - monthsAgo)
  return localISODate(date)
}

function startForPeriod(period: Period): string {
  return monthStart(period === 'This month' ? 0 : period === 'Last month' ? 1 : period === 'Last 3 months' ? 2 : 5)
}

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
  const [activePage, setActivePage] = useState<PageKey>('overview')
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions)
  const [statements, setStatements] = useState<Statement[]>(demoStatements)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('This month')
  const [currency, setCurrencyState] = useState('USD')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statementFilter, setStatementFilter] = useState('all')
  const [classificationFilter, setClassificationFilter] = useState<ClassificationFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [transactionPage, setTransactionPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [showDemo, setShowDemo] = useState(true)
  const [toast, setToast] = useState('')
  const [savedCorrections, setSavedCorrections] = useState(getSavedCorrections)

  const setCurrency = (value: string) => {
    setCurrencyState(value)
  }

  const liveTransactions = useMemo(() => showDemo ? transactions : transactions.filter((transaction) => !transaction.isDemo), [transactions, showDemo])
  const liveStatements = useMemo(() => showDemo ? statements : statements.filter((statement) => !statement.isDemo), [statements, showDemo])
  const selectableCurrencies = useMemo(() => Array.from(new Set(liveTransactions.map((transaction) => transaction.currencyCode))).sort(), [liveTransactions])
  const availableCurrencies = selectableCurrencies
  const activeCurrency = currency
  const analysisRows = useMemo(() => liveTransactions.filter((transaction) => !transaction.isDuplicate && transaction.currencyCode === activeCurrency), [liveTransactions, activeCurrency])
  const unknownRows = useMemo(() => analysisRows.filter((transaction) => transaction.category === 'Unknown').sort((a, b) => b.date.localeCompare(a.date)), [analysisRows])
  const activeImportedStatements = liveStatements.filter((statement) => !statement.isDemo)
  const sampleActive = showDemo && liveStatements.some((statement) => statement.isDemo)

  const periodRows = useMemo(() => {
    const start = startForPeriod(period)
    const today = new Date()
    const end = period === 'Last month'
      ? localISODate(new Date(today.getFullYear(), today.getMonth(), 0))
      : localISODate(today)
    return analysisRows.filter((transaction) => transaction.date >= start && transaction.date <= end)
  }, [analysisRows, period])
  const expenseRows = periodRows.filter((transaction) => transaction.amount < 0)
  const incomeRows = periodRows.filter((transaction) => transaction.amount > 0)
  const spend = expenseRows.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
  const income = incomeRows.reduce((sum, transaction) => sum + transaction.amount, 0)
  const cashFlow = income - spend
  const needsReviewCount = unknownRows.length + analysisRows.filter((transaction) => transaction.confidence > 0 && transaction.confidence < 0.8).length
  const duplicateCount = liveTransactions.filter((transaction) => transaction.isDuplicate).length

  const trendData = useMemo(() => {
    const today = new Date()
    const buckets = Array.from({ length: 6 }, (_, index) => {
      const monthsBack = 5 - index
      const monthDate = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1)
      const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
      const rows = analysisRows.filter((transaction) => transaction.date.slice(0, 7) === key)
      return {
        month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monthDate),
        income: rows.filter((transaction) => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0),
        spending: rows.filter((transaction) => transaction.amount < 0).reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
      }
    })
    return buckets
  }, [analysisRows])

  const categoryData = useMemo(() => {
    const sums = new Map<Category, number>()
    for (const transaction of periodRows) {
      if (transaction.amount >= 0) continue
      sums.set(transaction.category, (sums.get(transaction.category) ?? 0) + Math.abs(transaction.amount))
    }
    return Array.from(sums, ([name, value]) => ({ name, value, color: CATEGORY_COLORS[name] })).sort((a, b) => b.value - a.value)
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
        bankName: bankNameFromFile(file.fileName),
        importedAt: new Date().toISOString(),
        transactionCount: rows.length,
        duplicateCount: rows.filter((row) => row.isDuplicate).length,
        skippedCount: file.skippedRows,
        fileSize: file.fileSize,
        parser: file.parser,
        warnings: file.warnings,
      })
    }

    const importedCurrencies = Array.from(new Set(files.flatMap((file) => file.transactions.map((row) => row.currencyCode))))
    if (importedCurrencies.length && !importedCurrencies.includes(currency)) setCurrency(importedCurrencies[0])

    setTransactions(nextTransactions)
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
    setTransactions(rechecked)
    const remainingCurrencies = Array.from(new Set(rechecked.map((transaction) => transaction.currencyCode)))
    if (remainingCurrencies.length && !remainingCurrencies.includes(currency)) setCurrency(remainingCurrencies[0])
    setToast('Statement and its transaction rows removed')
    window.setTimeout(() => setToast(''), 3000)
  }

  const allFiltersActive = Boolean(search || categoryFilter !== 'all' || statementFilter !== 'all' || classificationFilter !== 'all' || fromDate || toDate || minAmount || maxAmount)
  const filteredTransactions = useMemo(() => liveTransactions
    .filter((transaction) => transaction.currencyCode === activeCurrency)
    .filter((transaction) => {
      if (!search.trim()) return true
      const needle = search.trim().toLowerCase()
      return transaction.description.toLowerCase().includes(needle) || transaction.merchant.toLowerCase().includes(needle) || transaction.category.toLowerCase().includes(needle)
    })
    .filter((transaction) => categoryFilter === 'all' || transaction.category === categoryFilter)
    .filter((transaction) => statementFilter === 'all' || transaction.sourceStatementId === statementFilter)
    .filter((transaction) => classificationFilter === 'all'
      || (classificationFilter === 'unknown' && transaction.category === 'Unknown')
      || (classificationFilter === 'manual' && (transaction.classificationMethod === 'manual' || transaction.classificationMethod === 'saved correction'))
      || (classificationFilter === 'review' && transaction.confidence > 0 && transaction.confidence < 0.8 && !transaction.isDuplicate)
      || (classificationFilter === 'duplicates' && transaction.isDuplicate))
    .filter((transaction) => !fromDate || transaction.date >= fromDate)
    .filter((transaction) => !toDate || transaction.date <= toDate)
    .filter((transaction) => !minAmount || Math.abs(transaction.amount) >= Number(minAmount))
    .filter((transaction) => !maxAmount || Math.abs(transaction.amount) <= Number(maxAmount))
    .sort((a, b) => b.date.localeCompare(a.date)), [
    liveTransactions, activeCurrency, search, categoryFilter, statementFilter, classificationFilter, fromDate, toDate, minAmount, maxAmount,
  ])

  useEffect(() => {
    setTransactionPage(1)
  }, [activeCurrency, search, categoryFilter, statementFilter, classificationFilter, fromDate, toDate, minAmount, maxAmount, pageSize])

  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / pageSize))
  const safeTransactionPage = Math.min(transactionPage, pageCount)
  const pageStart = filteredTransactions.length ? (safeTransactionPage - 1) * pageSize : 0
  const pageTransactions = filteredTransactions.slice(pageStart, pageStart + pageSize)

  const clearFilters = () => {
    setSearch('')
    setCategoryFilter('all')
    setStatementFilter('all')
    setClassificationFilter('all')
    setFromDate('')
    setToDate('')
    setMinAmount('')
    setMaxAmount('')
  }

  const exportTransactions = () => {
    const columns = ['Date', 'Description', 'Merchant', 'Amount', 'Currency', 'Category', 'Confidence', 'Classification', 'Sign choice', 'Date order', 'Statement', 'Duplicate', 'Sample data']
    const exportRows = activePage === 'transactions' ? filteredTransactions : liveTransactions.filter((transaction) => transaction.currencyCode === activeCurrency)
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
    overview: 'Your money, in focus.',
    transactions: 'All transactions',
    statements: 'Your statements',
    settings: 'Your preferences',
  }
  const pageDescription: Record<PageKey, string> = {
    overview: `${period === 'This month' ? 'This month' : period} at a glance. Every number traces back to a statement.`,
    transactions: 'Search, filter, review, and correct every imported transaction.',
    statements: 'Manage the statement files and source records behind your analysis.',
    settings: 'Make the tracker work the way you do.',
  }

  const visibleRecent = analysisRows.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
  const activeRealStatements = activeImportedStatements

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} unknownCount={unknownRows.length} statementCount={activeRealStatements.length} />
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{activePage === 'overview' ? 'Overview' : activePage === 'transactions' ? 'Transactions' : activePage === 'statements' ? 'Statements' : 'Preferences'}</strong></div>
          <div className="topbar-actions">
            <label className="currency-chooser"><span>Currency</span><select value={activeCurrency} onChange={(event) => setCurrency(event.target.value)} aria-label="Display and import default currency">{Array.from(new Set(['USD', 'CAD', 'EUR', 'GBP', 'INR', 'AUD', 'NZD', 'JPY', 'CHF', 'SGD', 'HKD', 'AED', 'ZAR', 'MXN', ...availableCurrencies, activeCurrency])).map((code) => <option value={code} key={code}>{code}</option>)}</select><ChevronDown size={12} /></label>
            <div className="local-status"><span className="local-status-dot" /><span>Private workspace</span></div>
            <button className="button button-primary top-upload" onClick={() => setUploadOpen(true)}><Plus size={16} /> Add statements</button>
            <button className="mobile-upload-button" onClick={() => setUploadOpen(true)} aria-label="Add statements"><Plus size={18} /></button>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading-row">
            <div className="page-heading-copy">
              <div className="eyebrow"><span className="eyebrow-mark" /> PERSONAL FINANCE · {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()}</div>
              <h1>{activePage === 'overview' ? `${periodGreeting()}, Alex.` : pageTitle[activePage]}</h1>
              <p>{activePage === 'overview' ? 'Your spending has a story. Here’s the latest chapter.' : pageDescription[activePage]}</p>
            </div>
            {activePage === 'overview' && (
              <div className="heading-controls">
                <label className="period-select-wrap"><CalendarDays size={15} /><select value={period} onChange={(event) => setPeriod(event.target.value as Period)} aria-label="Choose dashboard date range">{PERIODS.map((item) => <option value={item} key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
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
              <div><strong>Sample dashboard</strong><span> A few made-up transactions let you explore the view. Your statement import will replace them.</span></div>
              <button className="sample-dismiss" onClick={() => { setShowDemo(false); setTransactions((current) => current.filter((transaction) => !transaction.isDemo)); setStatements((current) => current.filter((statement) => !statement.isDemo)) }}>Clear sample</button>
            </div>
          )}

          {activePage === 'overview' && (
            <>
              <section className="stat-grid" aria-label="Cash flow summary">
                <StatCard label="TOTAL SPENDING" value={formatMoney(spend, activeCurrency, true)} note={`${expenseRows.length} purchases · ${period.toLowerCase()}`} icon={<CircleArrowDown size={17} />} tone="warm" />
                <StatCard label="TOTAL INCOME" value={formatMoney(income, activeCurrency, true)} note={`${incomeRows.length} deposits · ${period.toLowerCase()}`} icon={<CircleArrowUp size={17} />} />
                <StatCard label="NET CASH FLOW" value={formatMoney(cashFlow, activeCurrency, true)} note={cashFlow >= 0 ? 'More in than out' : 'Spending exceeds income'} icon={<WalletCards size={17} />} tone="accent" />
                <StatCard label="TRANSACTIONS" value={String(periodRows.length)} note={`${needsReviewCount} need a category review`} icon={<ChartNoAxesColumnIncreasing size={17} />} />
              </section>

              {availableCurrencies.length > 1 && (
                <div className="currency-notice"><AlertCircle size={14} /> Statements contain multiple currencies. Dashboard totals show <strong>{activeCurrency} ({currencyName(activeCurrency)})</strong> only; no currency conversion is applied.</div>
              )}

              <Suspense fallback={<section className="analytics-grid"><div className="panel chart-loading">Preparing your charts…</div></section>}>
                <DashboardCharts
                  trendData={trendData}
                  categoryData={categoryData}
                  spend={spend}
                  currencyCode={activeCurrency}
                  period={period}
                  unknownCount={unknownRows.length}
                  analyzedCount={analysisRows.length}
                  onCategoryClick={(category) => { setCategoryFilter(category); setActivePage('transactions') }}
                  onSeeTransactions={() => { setCategoryFilter('all'); setActivePage('transactions') }}
                  onUpload={() => setUploadOpen(true)}
                />
              </Suspense>

              <section className="lower-grid">
                <article className="panel recent-panel">
                  <div className="panel-heading panel-heading-simple">
                    <div><div className="section-kicker">LATEST ACTIVITY</div><h2>Recent transactions</h2></div>
                    <button className="view-all-link" onClick={() => setActivePage('transactions')}>View all <ArrowRight size={14} /></button>
                  </div>
                  <TransactionsTable transactions={visibleRecent} statements={liveStatements} onChangeCategory={changeCategory} onToggleDuplicate={toggleDuplicate} compact />
                </article>

                <div className="right-rail">
                  <article className="review-card">
                    <div className="review-card-heading"><span className="review-icon"><ShieldAlert size={16} /></span><span className="review-counter">{unknownRows.length}</span></div>
                    <div className="review-card-title">Needs a closer look</div>
                    <p>Unrecognized merchants stay marked Unknown until you assign a category in the transaction list.</p>
                    {unknownRows.length ? (
                      <div className="unknown-list">
                        {unknownRows.slice(0, 3).map((transaction) => (
                          <div className="unknown-item" key={transaction.id}>
                            <div className="unknown-item-copy"><strong>{transaction.merchant}</strong><span>{relativeDate(transaction.date)} · {formatMoney(transaction.amount, transaction.currencyCode)}</span></div>
                          </div>
                        ))}
                        {unknownRows.length > 3 && <button className="view-unknown-link" onClick={() => { setClassificationFilter('unknown'); setActivePage('transactions') }}>{unknownRows.length - 3} more to review <ArrowRight size={13} /></button>}
                      </div>
                    ) : (
                      <div className="all-clear-note"><BadgeCheck size={16} /><span>Nothing is waiting for a category.</span></div>
                    )}
                    {unknownRows.length > 0 && <button className="review-all-button" onClick={() => { setClassificationFilter('unknown'); setActivePage('transactions') }}>Review categories <ArrowRight size={14} /></button>}
                  </article>

                  <article className="panel merchants-panel">
                    <div className="panel-heading panel-heading-simple">
                      <div><div className="section-kicker">TOP MERCHANTS</div><h2>Where you shop</h2></div>
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

              <footer className="page-footer"><span><ShieldCheck size={14} /> Your statements are parsed locally. No statement data is uploaded.</span><span>Spendwise · personal finance, made clear</span></footer>
            </>
          )}

          {activePage === 'transactions' && (
            <section className="panel ledger-panel">
              <div className="ledger-toolbar">
                <div className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a merchant or description…" aria-label="Search transactions" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</div>
                <div className="ledger-result-count"><span>{filteredTransactions.length}</span> of {liveTransactions.filter((transaction) => transaction.currencyCode === activeCurrency).length} rows</div>
                {allFiltersActive && <button className="clear-filters-button" onClick={clearFilters}><X size={13} /> Clear filters</button>}
              </div>
              <div className="filter-toolbar">
                <label className="filter-control"><Filter size={13} /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select><ChevronDown size={12} /></label>
                <label className="filter-control"><Landmark size={13} /><select value={statementFilter} onChange={(event) => setStatementFilter(event.target.value)} aria-label="Filter by statement"><option value="all">All statements</option>{liveStatements.map((statement) => <option value={statement.id} key={statement.id}>{statement.bankName}</option>)}</select><ChevronDown size={12} /></label>
                <label className="filter-control"><ShieldCheck size={13} /><select value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value as ClassificationFilter)} aria-label="Filter by classification status"><option value="all">All classifications</option><option value="unknown">Needs category</option><option value="manual">Manual corrections</option><option value="review">Low confidence</option><option value="duplicates">Likely duplicates</option></select><ChevronDown size={12} /></label>
                <div className="date-filter-group"><CalendarDays size={13} /><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Start date" /><span>to</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="End date" /></div>
                <div className="amount-filter-group"><span>Amount</span><input type="number" min="0" step="0.01" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} placeholder="Min" aria-label="Minimum amount" /><span>–</span><input type="number" min="0" step="0.01" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} placeholder="Max" aria-label="Maximum amount" /></div>
              </div>
              {classificationFilter === 'duplicates' && <div className="duplicate-explanation"><RotateCcw size={14} /> Likely duplicate rows are excluded from totals by default. Select a duplicate badge to include a transaction that is legitimate.</div>}
              <TransactionsTable transactions={pageTransactions} statements={liveStatements} onChangeCategory={changeCategory} onToggleDuplicate={toggleDuplicate} showStatement />
              <div className="ledger-pagination" aria-label="Transaction pages">
                <span className="ledger-page-range">{filteredTransactions.length ? `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, filteredTransactions.length)} of ${filteredTransactions.length}` : 'No transactions'}</span>
                <label className="page-size-control">Rows per page<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="Rows per page"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
                <div className="page-buttons"><button className="button button-secondary button-small" onClick={() => setTransactionPage((page) => Math.max(1, page - 1))} disabled={safeTransactionPage <= 1} aria-label="Previous page">Previous</button><span>Page {safeTransactionPage} of {pageCount}</span><button className="button button-secondary button-small" onClick={() => setTransactionPage((page) => Math.min(pageCount, page + 1))} disabled={safeTransactionPage >= pageCount} aria-label="Next page">Next</button></div>
              </div>
              <div className="ledger-footer"><span>Dates and amounts are shown as extracted · verify statement rows flagged for review</span><span>Unknown categories remain unassigned until you choose one.</span></div>
            </section>
          )}

          {activePage === 'statements' && (
            <section className="statements-layout">
              <article className="panel statements-panel">
                <div className="statements-topline">
                  <div><div className="section-kicker">SOURCE RECORDS</div><h2>Imported statements</h2><p>One upload can contain one or more statements. Files themselves are not retained.</p></div>
                  <button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={16} /> Add statements</button>
                </div>
                <div className="statement-summary-strip">
                  <div><span>Statements</span><strong>{liveStatements.length}</strong></div>
                  <div><span>Imported rows</span><strong>{liveTransactions.length}</strong></div>
                  <div><span>Held out as duplicates</span><strong>{duplicateCount}</strong></div>
                  <div><span>Source currencies</span><strong>{availableCurrencies.length}</strong></div>
                </div>
                {liveStatements.length ? (
                  <div className="statement-list">
                    {liveStatements.slice().sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map((statement) => (
                      <div className="statement-row" key={statement.id}>
                        <div className={`statement-file-icon ${statement.isDemo ? 'statement-sample-icon' : ''}`}><FileStack size={18} /></div>
                        <div className="statement-file-main">
                          <div className="statement-name-row"><strong>{statement.fileName}</strong>{statement.isDemo && <span className="demo-mini-tag">SAMPLE</span>}<span className="statement-format">{statement.parser}</span></div>
                          <span>{statement.bankName} · Added {formatDate(statement.importedAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })} · {(statement.fileSize / 1024).toFixed(0)} KB</span>
                          {statement.warnings?.map((warning) => <span className="statement-warning" key={warning}><AlertCircle size={12} />{warning}</span>)}
                        </div>
                        <div className="statement-row-stat"><strong>{statement.transactionCount}</strong><span>transactions</span></div>
                        <div className="statement-row-stat statement-row-duplicates"><strong>{statement.duplicateCount}</strong><span>duplicates</span></div>
                        <div className="statement-row-stat"><strong>{statement.skippedCount}</strong><span>skipped</span></div>
                        <button className="icon-button statement-remove" aria-label={`Remove ${statement.fileName}`} title="Remove statement and its transactions" onClick={() => removeStatement(statement)}><X size={15} /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="statements-empty"><span className="empty-icon"><FileClock size={21} /></span><h3>No statements yet</h3><p>Import multiple CSV, Excel, or PDF statements to build one clear view of your finances.</p><button className="button button-primary" onClick={() => setUploadOpen(true)}><Plus size={16} /> Upload statements</button></div>
                )}
              </article>
              <aside className="panel statement-help-card">
                <span className="help-card-icon"><CloudOff size={18} /></span><h3>Your files stay yours</h3><p>Statements are parsed in your browser. Only transaction records in this tab are used for analysis; the original files are not uploaded or stored.</p>
                <div className="supported-formats"><strong>Supported files</strong><span><FileCheck2 size={14} /> CSV & TSV exports</span><span><FileCheck2 size={14} /> Excel spreadsheets</span><span><FileCheck2 size={14} /> Text-based PDF statements</span></div>
                <p className="scan-note"><AlertCircle size={13} /> Scanned image-only PDFs aren’t supported. CSV exports provide the most reliable extraction.</p>
              </aside>
            </section>
          )}

          {activePage === 'settings' && (
            <section className="settings-layout">
              <article className="panel settings-panel">
                <div className="section-kicker">LOCAL DATA</div><h2>Privacy, by design</h2><p className="settings-intro">Spendwise reads statements in this browser. There’s no account connection, no statement upload, and no transaction database behind this workspace.</p>
                <div className="settings-feature-list">
                  <div className="settings-feature"><span className="settings-feature-icon"><LockKeyhole size={16} /></span><div><strong>Statement files</strong><span>Parsed in this tab only. The original files are discarded after import.</span></div><span className="settings-value">NOT STORED</span></div>
                  <div className="settings-feature"><span className="settings-feature-icon"><BarChart3 size={16} /></span><div><strong>Transactions</strong><span>Held in this tab’s memory and removed on refresh or when you close it.</span></div><span className="settings-value">THIS TAB</span></div>
                  <div className="settings-feature"><span className="settings-feature-icon"><BadgeCheck size={16} /></span><div><strong>Category corrections</strong><span>Merchant names and your chosen categories are saved in this browser to improve future imports.</span></div><span className="settings-value">THIS BROWSER</span></div>
                  <div className="settings-feature"><span className="settings-feature-icon"><CalendarDays size={16} /></span><div><strong>Display currency</strong><span>Amounts are filtered by currency. No exchange rate or currency conversion is applied.</span></div><span className="settings-value">{activeCurrency}</span></div>
                </div>
                <div className="settings-note"><ShieldCheck size={15} /> Statement files and transaction rows stay on this device. No transaction details are sent to a search provider.</div>
              </article>
              <article className="panel corrections-panel">
                <div className="correction-header"><div><div className="section-kicker">LEARNING FROM YOU</div><h2>Saved category corrections</h2><p>New statements will reuse these merchant choices.</p></div><span className="correction-count">{Object.keys(savedCorrections).length}</span></div>
                {Object.keys(savedCorrections).length ? (
                  <>
                    <div className="correction-list">{Object.entries(savedCorrections).sort(([a], [b]) => a.localeCompare(b)).map(([merchant, category]) => (
                      <div className="correction-row" key={merchant}><div className="merchant-initial correction-initial">{merchant.slice(0, 1).toUpperCase()}</div><strong>{titleCase(merchant)}</strong><ArrowRight size={13} /><span className={`category-chip category-chip-${categorySlug(category)}`}>{category}</span></div>
                    ))}</div>
                    <button className="button button-danger-quiet" onClick={() => { if (window.confirm('Clear all saved merchant category corrections from this browser?')) { clearSavedCorrections(); setSavedCorrections({}) } }}>Forget saved corrections</button>
                  </>
                ) : (
                  <div className="corrections-empty"><span className="empty-icon"><Sparkles size={18} /></span><strong>No saved corrections yet</strong><span>Change a transaction category and we’ll remember that merchant choice for the next import.</span></div>
                )}
              </article>
            </section>
          )}
        </div>
      </main>

      {uploadOpen && <UploadDialog open={uploadOpen} defaultCurrency={activeCurrency} onClose={() => setUploadOpen(false)} onImport={importStatements} />}
      {toast && <div className="toast-message" role="status"><CheckIcon />{toast}</div>}
    </div>
  )
}

function CheckIcon() {
  return <span className="toast-check"><ShieldCheck size={14} /></span>
}

export default App
