import { useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { formatDate, formatMoney } from '../lib/format'
import { transactionDuplicateMatch } from '../lib/presentation'
import type { Category, Statement, Transaction } from '../types'

interface DuplicatesReviewModalProps {
  open: boolean
  statement: Statement | null
  duplicates: Transaction[]
  liveTransactions: Transaction[]
  liveStatements: Statement[]
  categories: Category[]
  currencyCode?: string
  onToggleDuplicate: (transaction: Transaction) => void
  onChangeCategory: (transaction: Transaction, category: Category) => void
  onClose: () => void
}

export default function DuplicatesReviewModal({
  open,
  statement,
  duplicates,
  liveTransactions,
  liveStatements,
  categories,
  currencyCode,
  onToggleDuplicate,
  onChangeCategory,
  onClose,
}: DuplicatesReviewModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !statement) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="duplicates-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicates-modal-title"
      >
        <div className="duplicates-modal-header">
          <div>
            <h3 id="duplicates-modal-title">Review Duplicates</h3>
            <p className="duplicates-modal-sub">
              {statement.fileName} · <strong>{duplicates.length}</strong> flagged duplicate{duplicates.length === 1 ? '' : 's'}. Compare each transaction below.
            </p>
          </div>
          <button
            type="button"
            className="icon-button duplicates-modal-close"
            onClick={onClose}
            aria-label="Close duplicates popup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="duplicates-modal-body">
          {duplicates.length === 0 ? (
            <div className="duplicates-modal-empty">
              <Check size={28} />
              <h4>All duplicates resolved</h4>
              <p>There are no active duplicates held out in this statement.</p>
            </div>
          ) : (
            <div className="duplicates-drawer-pairs-list">
              {duplicates.map((tx) => {
                const original =
                  liveTransactions.find((o) => o.id === tx.duplicateOf) ||
                  liveTransactions.find((o) => o.id !== tx.id && !o.isDuplicate && transactionDuplicateMatch(o, tx))
                const originalStmt = liveStatements.find((s) => s.id === original?.sourceStatementId)

                return (
                  <div className="dup-pair-card" key={tx.id}>
                    <div className="dup-pair-topbar">
                      <div className="dup-pair-summary">
                        <span className="dup-pair-date">{formatDate(tx.date)}</span>
                        <span className="dup-pair-merchant">{tx.merchant}</span>
                        <span className={`dup-pair-amount ${tx.amount > 0 ? 'amount-in' : ''}`}>
                          {formatMoney(tx.amount, currencyCode || tx.currencyCode)}
                        </span>
                      </div>
                      <div className="dup-pair-actions">
                        <button
                          type="button"
                          className={`button button-small ${tx.isDuplicate ? 'button-primary' : 'button-secondary'}`}
                          onClick={() => onToggleDuplicate(tx)}
                          title={tx.isDuplicate ? 'Include this copy in totals too' : 'Hold out this copy as a duplicate'}
                        >
                          {tx.isDuplicate ? 'Keep both in totals' : 'Exclude this duplicate'}
                        </button>
                      </div>
                    </div>

                    <div className="dup-pair-comparison">
                      {/* 1. Original copy that is kept in totals */}
                      <div className="dup-row-item dup-row-kept">
                        <div className="dup-row-col-status">
                          <span className="dup-badge dup-badge-kept">✓ Kept in totals</span>
                          <span className="dup-copy-num">First imported</span>
                        </div>
                        <div className="dup-row-col-source" title={originalStmt?.fileName || 'Earlier statement'}>
                          <strong>{originalStmt?.fileName || 'Earlier statement'}</strong>
                          <span>{originalStmt?.bankName || 'Imported statement'}</span>
                        </div>
                        <div className="dup-row-col-desc">
                          <span className="dup-row-full-desc" title={original?.description || tx.description}>
                            {original?.description || tx.description}
                          </span>
                        </div>
                        <div className="dup-row-col-cat">
                          <span className="dup-cat-badge">{original?.category || tx.category}</span>
                        </div>
                        <div className={`dup-row-col-amount align-right ${(original?.amount ?? tx.amount) > 0 ? 'amount-in' : ''}`}>
                          {formatMoney(original?.amount ?? tx.amount, currencyCode || tx.currencyCode)}
                        </div>
                      </div>

                      {/* 2. Duplicate candidate from this statement */}
                      <div className={`dup-row-item ${tx.isDuplicate ? 'dup-row-excluded' : 'dup-row-kept-too'}`}>
                        <div className="dup-row-col-status">
                          {tx.isDuplicate ? (
                            <span className="dup-badge dup-badge-held">⊘ Excluded duplicate</span>
                          ) : (
                            <span className="dup-badge dup-badge-kept">✓ Kept too</span>
                          )}
                          <span className="dup-copy-num">This upload</span>
                        </div>
                        <div className="dup-row-col-source" title={statement.fileName}>
                          <strong>{statement.fileName}</strong>
                          <span>{statement.bankName} (Current)</span>
                        </div>
                        <div className="dup-row-col-desc">
                          <span className="dup-row-full-desc" title={tx.description}>
                            {tx.description}
                          </span>
                        </div>
                        <div className="dup-row-col-cat">
                          <Select
                            value={tx.category}
                            onValueChange={(val) => onChangeCategory(tx, val as Category)}
                          >
                            <SelectTrigger className="shadcn-category-trigger-small" aria-label={`Category for ${tx.description}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {categories.map((cat) => (
                                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className={`dup-row-col-amount align-right ${tx.amount > 0 ? 'amount-in' : ''}`}>
                          {formatMoney(tx.amount, currencyCode || tx.currencyCode)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="duplicates-modal-footer">
          <div className="duplicates-modal-status">
            <span>
              {duplicates.filter((d) => d.isDuplicate).length} currently excluded · {duplicates.filter((d) => !d.isDuplicate).length} kept
            </span>
          </div>
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  )
}
