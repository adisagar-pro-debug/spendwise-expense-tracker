import { useCallback, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { AlertCircle, ArrowDownLeft, ArrowUpRight, BadgeCheck, Check, ChevronDown, FileSpreadsheet, FileText, Info, LoaderCircle, Upload, X } from 'lucide-react'
import { getAllCategories, saveMerchantCorrection } from '../lib/categories'
import { formatMoney, formatDate } from '../lib/format'
import type { Category, ParsedStatement, StagedTransaction } from '../types'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface UploadDialogProps {
  open: boolean
  defaultCurrency: string
  onClose: () => void
  onImport: (files: ParsedStatement[]) => void
}

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function dateWithOrder(source: string, mode: 'MDY' | 'DMY'): string | null {
  const match = source.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (!match) return null
  const first = Number(match[1])
  const second = Number(match[2])
  const shortYear = Number(match[3])
  const year = shortYear < 100 ? shortYear + (shortYear >= 70 ? 1900 : 2000) : shortYear
  const month = mode === 'MDY' ? first : second
  const day = mode === 'MDY' ? second : first
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function UploadDialog({ open, defaultCurrency, onClose, onImport }: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<ParsedStatement[]>([])
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [loadError, setLoadError] = useState('')

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const batch = Array.from(fileList)
    if (!batch.length) return
    setReading(true)
    setLoadError('')
    try {
      const { parseStatementFile } = await import('../lib/importer')
      const parsed = await Promise.all(batch.map((file) => parseStatementFile(file, defaultCurrency)))
      setFiles((current) => [...current, ...parsed])
    } catch (error) {
      setLoadError(`The browser could not load its statement reader: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      setReading(false)
    }
  }, [defaultCurrency])

  if (!open) return null

  const readyFiles = files.filter((file) => file.transactions.length > 0)
  const transactionCount = readyFiles.reduce((total, file) => total + file.transactions.length, 0)

  const updateCategory = (fileId: string, transactionId: string, category: Category) => {
    const merchant = files.find((file) => file.id === fileId)?.transactions.find((transaction) => transaction.id === transactionId)?.merchant
    if (merchant) saveMerchantCorrection(merchant, category)
    setFiles((current) => current.map((file) => file.id !== fileId ? file : {
      ...file,
      transactions: file.transactions.map((transaction) => transaction.id !== transactionId ? transaction : {
        ...transaction,
        category,
        confidence: category === 'Unknown' ? 0 : 1,
        classificationMethod: category === 'Unknown' ? 'unknown' : 'manual',
      }),
    }))
  }

  const updateAmountMode = (fileId: string, mode: 'spending' | 'income') => {
    setFiles((current) => current.map((file) => file.id !== fileId ? file : {
      ...file,
      positiveAmountMode: mode,
      transactions: file.transactions.map((row) => row.directionAmbiguous
        ? { ...row, amount: mode === 'income' ? Math.abs(row.amount) : -Math.abs(row.amount) }
        : row),
    }))
  }

  const updateDateMode = (fileId: string, mode: 'MDY' | 'DMY') => {
    setFiles((current) => current.map((file) => file.id !== fileId ? file : {
      ...file,
      dateFormatMode: mode,
      transactions: file.transactions.map((row) => {
        if (!row.dateAmbiguous || !row.originalDate) return row
        const date = dateWithOrder(row.originalDate, mode)
        return date ? { ...row, date } : row
      }),
    }))
  }

  const commitImport = () => {
    const resolvedFiles = readyFiles.map((file) => ({
      ...file,
      transactions: file.transactions.map((row) => ({
        ...row,
        directionChoice: row.directionAmbiguous ? file.positiveAmountMode ?? 'spending' : undefined,
        dateOrderChoice: row.dateAmbiguous ? file.dateFormatMode ?? 'MDY' : undefined,
        directionAmbiguous: undefined,
        dateAmbiguous: undefined,
        originalDate: undefined,
      })),
      warnings: file.warnings.map((warning) => {
        if (warning.includes('default to spending')) {
          return warning.replace(/default to spending.*$/, `were treated as ${file.positiveAmountMode ?? 'spending'} during review.`)
        }
        if (warning.includes('default to MM/DD/YYYY')) {
          return `Ambiguous numeric dates were interpreted as ${file.dateFormatMode ?? 'MDY'} during review.`
        }
        return warning
      }),
    }))
    onImport(resolvedFiles)
    setFiles([])
  }

  const dropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void addFiles(event.dataTransfer.files)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="import-dialog" aria-labelledby="import-title" role="dialog" aria-modal="true">
        <header className="dialog-header">
          <h2 id="import-title">Import Statements</h2>
          <button className="icon-button close-button" aria-label="Close import dialog" onClick={onClose}><X size={18} /></button>
        </header>

        <div
          className={`drop-zone ${dragging ? 'drop-zone-active' : ''} ${files.length ? 'drop-zone-compact' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
          onDrop={dropFiles}
        >
          <div className="drop-icon"><Upload size={20} /></div>
          <div className="drop-copy">
            <strong>Drop files here or browse</strong>
            <span>CSV, Excel, or PDF</span>
          </div>
          <button className="button button-secondary button-small" onClick={() => inputRef.current?.click()} disabled={reading}>Browse files</button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            multiple
            accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf"
            onChange={(event) => {
              if (event.currentTarget.files) void addFiles(event.currentTarget.files)
              event.currentTarget.value = ''
            }}
          />
        </div>

        {reading && <div className="parsing-state"><LoaderCircle className="spin" size={17} /> Reading statements…</div>}
        {loadError && <div className="import-error-message import-loader-error"><AlertCircle size={14} />{loadError}</div>}

        {files.length > 0 && (
          <div className="import-file-list">
            <div className="import-list-heading">
              <div><strong>{files.length} {files.length === 1 ? 'statement' : 'statements'}</strong><span> · {transactionCount} transactions ready to review</span></div>
              <button className="text-button" onClick={() => setFiles([])}>Remove all</button>
            </div>
            {files.map((file) => (
              <article className={`file-review-card ${file.errors.length ? 'file-review-error' : ''}`} key={file.id}>
                <div className="file-review-top">
                  <div className={`file-type-icon ${file.errors.length ? 'file-type-error' : ''}`}>
                    {file.parser === 'PDF' ? <FileText size={17} /> : <FileSpreadsheet size={17} />}
                  </div>
                  <div className="file-review-name">
                    <strong title={file.fileName}>{file.fileName}</strong>
                    <span>{file.parser} · {readableBytes(file.fileSize)}</span>
                  </div>
                  <div className="file-ready-count">
                    {file.errors.length ? <><AlertCircle size={14} /> Needs attention</> : <><Check size={14} /> {file.transactions.length} rows</>}
                  </div>
                  <button className="icon-button file-remove" title={`Remove ${file.fileName}`} aria-label={`Remove ${file.fileName}`} onClick={() => setFiles((current) => current.filter((entry) => entry.id !== file.id))}><X size={15} /></button>
                </div>

                {file.errors.map((error) => <div className="import-error-message" key={error}><AlertCircle size={14} />{error}</div>)}
                {(() => {
                  const isActionable = (w: string) => /could not be parsed|skipped|had values in both debit and credit|unmarked positive/i.test(w)
                  const actionableWarnings = file.warnings.filter(isActionable)
                  const infoNotes = file.warnings.filter((w) => !isActionable(w))

                  return (
                    <>
                      {actionableWarnings.map((warning) => (
                        <div className="import-warning-message" key={warning}><AlertCircle size={14} />{warning}</div>
                      ))}

                      {!file.errors.length && !actionableWarnings.length && file.transactions.length > 0 && (
                        <div className="import-success-message">
                          <BadgeCheck size={14} />
                          <span>All <strong>{file.transactions.length}</strong> transactions extracted cleanly ({file.bankName ?? 'Bank Statement'} · {file.transactions[0]?.currencyCode ?? 'INR'})</span>
                        </div>
                      )}

                      {infoNotes.length > 0 && (
                        <details className="import-info-details">
                          <summary><Info size={12} /> Extraction notes ({infoNotes.length})</summary>
                          <ul>
                            {infoNotes.map((note) => (
                              <li key={note}>{note}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )
                })()}
                {file.transactions.some((row) => row.directionAmbiguous) && (
                  <div className="convention-control">
                    <span><strong>Unmarked positive amounts</strong><small>Some rows have no debit/credit clue. Choose how to count them.</small></span>
                    <Select value={file.positiveAmountMode ?? 'spending'} onValueChange={(val) => updateAmountMode(file.id, val as 'spending' | 'income')}>
                      <SelectTrigger className="shadcn-dialog-trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spending">Treat as spending</SelectItem>
                        <SelectItem value="income">Treat as income</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {file.transactions.some((row) => row.dateAmbiguous) && (
                  <div className="convention-control">
                    <span><strong>Ambiguous numeric dates</strong><small>For dates like 04/05, choose your bank's order.</small></span>
                    <Select value={file.dateFormatMode ?? 'MDY'} onValueChange={(val) => updateDateMode(file.id, val as 'MDY' | 'DMY')}>
                      <SelectTrigger className="shadcn-dialog-trigger">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MDY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DMY">DD/MM/YYYY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {file.transactions.length > 0 && (
                  <details className="preview-details">
                    <summary>Review sample rows <ChevronDown size={14} /></summary>
                    <div className="preview-scroll">
                      <table className="preview-table">
                        <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="align-right">Amount</th></tr></thead>
                        <tbody>
                          {file.transactions.slice(0, 6).map((transaction: StagedTransaction) => (
                            <tr key={transaction.id}>
                              <td>{formatDate(transaction.date)}</td>
                              <td className="preview-description" title={transaction.description}>{transaction.description}{transaction.issue && <span className="row-issue preview-row-issue" title={transaction.issue}><AlertCircle size={11} /> Check</span>}</td>
                              <td>
                                <Select
                                  value={transaction.category}
                                  onValueChange={(val) => updateCategory(file.id, transaction.id, val as Category)}
                                >
                                  <SelectTrigger
                                    className={`shadcn-category-trigger ${transaction.category === 'Unknown' ? 'category-select-unknown' : ''}`}
                                    aria-label={`Category for ${transaction.description}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {getAllCategories().map((category) => (
                                        <SelectItem key={category} value={category}>{category}</SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className={`align-right amount-cell ${transaction.amount > 0 ? 'amount-in' : ''}`}>{transaction.amount > 0 ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}{formatMoney(transaction.amount, transaction.currencyCode || defaultCurrency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {file.transactions.length > 6 && <div className="preview-more">+ {file.transactions.length - 6} more transaction rows</div>}
                    </div>
                    {file.transactions.some((row) => row.issue) && (
                      <p className="preview-issue-note"><AlertCircle size={13} /> Flagged rows need review before import.</p>
                    )}
                  </details>
                )}
              </article>
            ))}
          </div>
        )}

        <footer className="dialog-footer">
          <span>{files.length > 0 ? `${transactionCount} rows across ${readyFiles.length} file${readyFiles.length === 1 ? '' : 's'}` : ''}</span>
          <div className="dialog-actions">
            <button className="button button-quiet" onClick={onClose}>Cancel</button>
            <button className="button button-primary" disabled={!readyFiles.length || reading} onClick={commitImport}>
              Import{transactionCount > 0 ? ` ${transactionCount} rows` : ''} <ArrowUpRight size={15} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
