import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { AlertCircle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CheckCheck, RotateCcw, Search, ShieldAlert, X } from 'lucide-react'
import { CATEGORIES, confidenceLabel } from '../lib/categories'
import { formatDate, formatMoney } from '../lib/format'
import { getCategoryColor } from '../lib/presentation'
import type { Category, Statement, Transaction } from '../types'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './ui/select'

const QUICK_CATEGORIES: Category[] = [
  'Transfers',
  'Dining',
  'Groceries',
  'Shopping',
  'Bills & utilities',
  'Income',
]

interface TransactionsTableProps {
  transactions: Transaction[]
  statements: Statement[]
  onChangeCategory: (transaction: Transaction, category: Category) => void
  onBatchChangeCategory?: (transactions: Transaction[], category: Category) => void
  onToggleDuplicate: (transaction: Transaction) => void
  onToggleSelfTransfer?: (transaction: Transaction) => void
  showStatement?: boolean
  compact?: boolean
  allFilteredTransactions?: Transaction[]
  resetSelectionKey?: string | number
  availableCategories?: Category[]
  currencyCode?: string
}

export default function TransactionsTable({
  transactions,
  statements,
  onChangeCategory,
  onBatchChangeCategory,
  onToggleDuplicate,
  onToggleSelfTransfer,
  showStatement = false,
  compact = false,
  allFilteredTransactions,
  resetSelectionKey,
  availableCategories,
  currencyCode,
}: TransactionsTableProps) {
  const statementById = new Map(statements.map((statement) => [statement.id, statement.bankName]))
  const categoryList = availableCategories && availableCategories.length > 0 ? availableCategories : CATEGORIES
  const enableSelection = Boolean(onBatchChangeCategory && !compact)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSelectedIds(new Set())
    setLastClickedIndex(null)
  }, [resetSelectionKey])

  const isAllPageSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id))
  const isSomePageSelected = transactions.some((t) => selectedIds.has(t.id))

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isSomePageSelected && !isAllPageSelected
    }
  }, [isSomePageSelected, isAllPageSelected])

  const handleToggleAllPage = () => {
    const next = new Set(selectedIds)
    if (isAllPageSelected) {
      for (const t of transactions) next.delete(t.id)
    } else {
      for (const t of transactions) next.add(t.id)
    }
    setSelectedIds(next)
  }

  const handleSelectRow = (id: string, index: number, isShift: boolean) => {
    const next = new Set(selectedIds)

    if (isShift && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index)
      const end = Math.max(lastClickedIndex, index)
      const shouldSelect = !selectedIds.has(id)
      for (let i = start; i <= end; i++) {
        const row = transactions[i]
        if (row) {
          if (shouldSelect) next.add(row.id)
          else next.delete(row.id)
        }
      }
    } else {
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
    }

    setSelectedIds(next)
    setLastClickedIndex(index)
  }

  const handleSelectAllFiltered = () => {
    if (!allFilteredTransactions) return
    const next = new Set<string>()
    for (const t of allFilteredTransactions) next.add(t.id)
    setSelectedIds(next)
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
    setLastClickedIndex(null)
  }

  const handleApplyCategory = (category: Category) => {
    if (!onBatchChangeCategory || selectedIds.size === 0) return
    const pool = allFilteredTransactions && allFilteredTransactions.length > 0
      ? allFilteredTransactions
      : transactions
    const poolMap = new Map(pool.map((t) => [t.id, t]))
    const targets = Array.from(selectedIds)
      .map((id) => poolMap.get(id))
      .filter((t): t is Transaction => Boolean(t))

    if (targets.length > 0) {
      onBatchChangeCategory(targets, category)
    }
    handleClearSelection()
  }

  if (!transactions.length) {
    return (
      <div className="empty-table-state">
        <span className="empty-icon"><Search size={20} /></span>
        <strong>No transactions match those filters</strong>
        <span>Try a different search or clear a filter to see more.</span>
      </div>
    )
  }

  return (
    <div className="transaction-table-wrapper">
      {enableSelection && selectedIds.size > 0 && (
        <div className="batch-action-bar" role="region" aria-label="Batch actions">
          <div className="batch-bar-left">
            <div className="batch-selection-pill">
              <CheckCheck size={16} />
              <span><strong>{selectedIds.size}</strong> selected</span>
            </div>
            {allFilteredTransactions && allFilteredTransactions.length > transactions.length && (
              selectedIds.size < allFilteredTransactions.length ? (
                <button
                  type="button"
                  className="batch-select-all-btn"
                  onClick={handleSelectAllFiltered}
                >
                  Select all {allFilteredTransactions.length} matching rows
                </button>
              ) : (
                <span className="batch-all-selected-note">All {allFilteredTransactions.length} rows selected</span>
              )
            )}
          </div>

          <div className="batch-bar-actions">
            <span className="batch-action-label">Assign:</span>
            <div className="batch-quick-pills">
              {QUICK_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="batch-pill-btn"
                  onClick={() => handleApplyCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            <Select value="" onValueChange={(val) => handleApplyCategory(val as Category)}>
              <SelectTrigger className="shadcn-batch-trigger" aria-label="Assign more categories">
                <SelectValue placeholder="More categories…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>All categories</SelectLabel>
                  {categoryList.filter((c) => c !== 'Unknown').map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <button
              type="button"
              className="batch-clear-btn"
              onClick={handleClearSelection}
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <div className={`table-scroll ${compact ? 'table-scroll-compact' : 'table-scroll-ledger'}`}>
        <table className={`transaction-table ${compact ? 'transaction-table-compact' : ''}`}>
          <thead>
            <tr>
              {enableSelection && (
                <th className="col-select">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    className="table-checkbox"
                    checked={isAllPageSelected}
                    onChange={handleToggleAllPage}
                    aria-label="Select all transactions on this page"
                  />
                </th>
              )}
              <th className="col-date">Date</th>
              <th className="col-merchant">Transaction</th>
              {showStatement && <th className="col-source">Statement</th>}
              <th className="col-category">Category</th>
              <th className="col-confidence">Confidence</th>
              <th className="col-amount align-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction, index) => {
              const unknown = transaction.category === 'Unknown'
              const confidence = confidenceLabel(transaction.confidence)
              const isSelected = selectedIds.has(transaction.id)

              return (
                <tr
                  key={transaction.id}
                  className={`${transaction.isDuplicate ? 'transaction-row-duplicate' : ''} ${isSelected ? 'transaction-row-selected' : ''}`}
                >
                  {enableSelection && (
                    <td
                      className="col-select-cell"
                      onClick={(e: MouseEvent) => {
                        handleSelectRow(transaction.id, index, e.shiftKey)
                      }}
                    >
                      <input
                        type="checkbox"
                        className="table-checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        aria-label={`Select ${transaction.merchant}`}
                      />
                    </td>
                  )}
                  <td className="table-date">{formatDate(transaction.date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td>
                    <div className="merchant-cell">
                      <div className={`merchant-initial ${unknown ? 'merchant-initial-unknown' : ''}`}>{transaction.merchant.slice(0, 1).toUpperCase()}</div>
                      <div className="merchant-copy">
                        <div className="merchant-primary-line">
                          <strong title={transaction.description}>{transaction.merchant}</strong>
                          {transaction.isDemo && <span className="demo-mini-tag">SAMPLE</span>}
                          {(transaction.isDuplicate || transaction.duplicateConfirmedDistinct) && (
                            <button className={`duplicate-badge ${transaction.duplicateConfirmedDistinct ? 'duplicate-kept' : ''}`} onClick={() => onToggleDuplicate(transaction)} title={transaction.isDuplicate ? `Likely duplicate of ${transaction.duplicateOf ?? 'another row'}. Select to include this transaction in totals.` : 'This possible duplicate is included in totals. Select to hold it out again.'}>
                              <RotateCcw size={11} /> {transaction.isDuplicate ? 'Duplicate · Include?' : 'Included · Re-check?'}
                            </button>
                          )}
                          {(transaction.isSelfTransfer || transaction.selfTransferConfirmedDistinct) && (
                            <button
                              type="button"
                              className={`self-transfer-badge ${transaction.selfTransferConfirmedDistinct ? 'self-transfer-unlinked' : ''}`}
                              onClick={() => onToggleSelfTransfer?.(transaction)}
                              title={transaction.selfTransferConfirmedDistinct
                                ? 'Unlinked transfer: currently counted in totals. Click to re-pair as self-transfer.'
                                : 'Paired self-transfer between accounts: neutralized from spending & income totals. Click to unlink.'
                              }
                            >
                              <ArrowLeftRight size={10} /> {transaction.selfTransferConfirmedDistinct ? 'Transfer · Unlinked' : 'Self-transfer'}
                            </button>
                          )}
                        </div>
                        {transaction.description !== transaction.merchant && <span className="merchant-secondary" title={transaction.description}>{transaction.description}</span>}
                        {transaction.issue && <span className="row-issue" title={transaction.issue}><AlertCircle size={11} /> Verify extracted amount</span>}
                        {transaction.directionChoice && <span className="row-direction" title="This row had no clear debit/credit clue; the positive amount meaning was selected in the import preview.">Sign chosen: {transaction.directionChoice}</span>}
                      </div>
                    </div>
                  </td>
                  {showStatement && <td className="table-source">{statementById.get(transaction.sourceStatementId) ?? '—'}</td>}
                  <td>
                    <div className="category-control">
                      <span className="category-dot" style={{ backgroundColor: getCategoryColor(transaction.category) }} />
                      <Select
                        value={transaction.category}
                        onValueChange={(val) => onChangeCategory(transaction, val as Category)}
                      >
                        <SelectTrigger
                          className={`shadcn-category-trigger ${unknown ? 'category-select-unknown' : ''}`}
                          aria-label={`Change category for ${transaction.merchant}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Categories</SelectLabel>
                            {categoryList.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </td>
                  <td>
                    {unknown ? <span className="confidence-pill confidence-unknown"><ShieldAlert size={12} /> Unknown</span> : (
                      <span className={`confidence-pill confidence-${confidence.toLowerCase()}`}><span className="confidence-dot" />{confidence}</span>
                    )}
                  </td>
                  <td className={`amount-cell align-right ${transaction.amount > 0 ? 'amount-in' : ''}`}>
                    {transaction.amount > 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    <strong>{formatMoney(transaction.amount, currencyCode || transaction.currencyCode)}</strong>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
