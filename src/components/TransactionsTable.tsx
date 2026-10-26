import { AlertCircle, ArrowDownLeft, ArrowUpRight, RotateCcw, Search, ShieldAlert } from 'lucide-react'
import { CATEGORIES, confidenceLabel } from '../lib/categories'
import { formatDate, formatMoney } from '../lib/format'
import type { Category, Statement, Transaction } from '../types'

interface TransactionsTableProps {
  transactions: Transaction[]
  statements: Statement[]
  onChangeCategory: (transaction: Transaction, category: Category) => void
  onToggleDuplicate: (transaction: Transaction) => void
  showStatement?: boolean
  compact?: boolean
}

export default function TransactionsTable({ transactions, statements, onChangeCategory, onToggleDuplicate, showStatement = false, compact = false }: TransactionsTableProps) {
  const statementById = new Map(statements.map((statement) => [statement.id, statement.bankName]))
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
    <div className="table-scroll">
      <table className={`transaction-table ${compact ? 'transaction-table-compact' : ''}`}>
        <thead>
          <tr>
            <th className="col-date">Date</th>
            <th className="col-merchant">Transaction</th>
            {showStatement && <th className="col-source">Statement</th>}
            <th className="col-category">Category</th>
            <th className="col-confidence">Confidence</th>
            <th className="col-amount align-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const unknown = transaction.category === 'Unknown'
            const confidence = confidenceLabel(transaction.confidence)
            return (
              <tr key={transaction.id} className={transaction.isDuplicate ? 'transaction-row-duplicate' : ''}>
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
                      </div>
                      {transaction.description !== transaction.merchant && <span className="merchant-secondary" title={transaction.description}>{transaction.description}</span>}
                      {transaction.issue && <span className="row-issue" title={transaction.issue}><AlertCircle size={11} /> Verify extracted amount</span>}
                      {transaction.directionChoice && <span className="row-direction" title="This row had no clear debit/credit clue; the positive amount meaning was selected in the import preview.">Sign chosen: {transaction.directionChoice}</span>}
                    </div>
                  </div>
                </td>
                {showStatement && <td className="table-source">{statementById.get(transaction.sourceStatementId) ?? '—'}</td>}
                <td>
                  <label className="category-control">
                    <span className={`category-dot category-dot-${transaction.category.replace(/[^a-z]/gi, '').toLowerCase()}`} />
                    <select
                      className={`category-select table-category-select ${unknown ? 'category-select-unknown' : ''}`}
                      value={transaction.category}
                      aria-label={`Change category for ${transaction.merchant}`}
                      onChange={(event) => onChangeCategory(transaction, event.target.value as Category)}
                    >
                      {CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}
                    </select>
                  </label>
                </td>
                <td>
                  {unknown ? <span className="confidence-pill confidence-unknown"><ShieldAlert size={12} /> Unknown</span> : (
                    <span className={`confidence-pill confidence-${confidence.toLowerCase()}`}><span className="confidence-dot" />{confidence}</span>
                  )}
                </td>
                <td className={`amount-cell align-right ${transaction.amount > 0 ? 'amount-in' : ''}`}>
                  {transaction.amount > 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                  <strong>{formatMoney(transaction.amount, transaction.currencyCode)}</strong>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
