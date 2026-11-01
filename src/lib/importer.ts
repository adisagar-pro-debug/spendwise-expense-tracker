import Papa from 'papaparse'
import type { ParsedStatement, StagedTransaction } from '../types'
import { classifyMerchant } from './categories'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_PDF_PAGES = 200

type Matrix = unknown[][]
type Field = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'type' | 'currency'

interface ColumnMap {
  indexes: Partial<Record<Field, number>>
  headerRow: number
  amountOnlyHeader: string
}

const aliases: Record<Field, RegExp> = {
  date: /^(date|transactiondate|posteddate|postingdate|valuedate|transdate)$/,
  description: /^(description|transactiondescription|narration|payee|merchant|details|particulars|memo|transaction|name)$/,
  amount: /^(amount|transactionamount|value|transactionvalue|withdrawalamount|paymentamount)$/,
  debit: /^(debit|debits|withdrawal|withdrawals|moneyout|outflow|dr)$/,
  credit: /^(credit|credits|deposit|deposits|moneyin|inflow|cr)$/,
  type: /^(type|transactiontype|drcr|debitcredit|direction|crdr)$/,
  currency: /^(currency|currencycode|ccy)$/,
}

function cleanHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

function mapHeader(row: unknown[], index: number): ColumnMap | null {
  const indexes: Partial<Record<Field, number>> = {}
  let amountOnlyHeader = ''
  row.forEach((value, columnIndex) => {
    const header = cleanHeader(value)
    if (!header) return
    for (const field of Object.keys(aliases) as Field[]) {
      if (aliases[field].test(header) && indexes[field] === undefined) {
        indexes[field] = columnIndex
        if (field === 'amount') amountOnlyHeader = header
      }
    }
  })
  if (indexes.date === undefined || indexes.description === undefined) return null
  if (indexes.amount === undefined && indexes.debit === undefined && indexes.credit === undefined) return null
  return { indexes, headerRow: index, amountOnlyHeader }
}

function findHeader(rows: Matrix): ColumnMap | null {
  for (let index = 0; index < Math.min(rows.length, 14); index += 1) {
    const result = mapHeader(rows[index], index)
    if (result) return result
  }
  return null
}

function parseDate(value: unknown, dateOrder: 'MDY' | 'DMY' = 'MDY'): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 20_000 && value < 90_000) {
    const parsed = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = String(value ?? '').trim()
  if (!text) return null

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const numeric = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\b|$)/)
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? Number(numeric[3]) + (Number(numeric[3]) >= 70 ? 1900 : 2000) : Number(numeric[3])
    const first = Number(numeric[1])
    const second = Number(numeric[2])
    if (first > 12 && second <= 12) return validDate(year, second, first)
    return dateOrder === 'DMY' ? validDate(year, second, first) : validDate(year, first, second)
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function isAmbiguousNumericDate(value: unknown): boolean {
  const match = String(value ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\b|$)/)
  if (!match) return false
  const first = Number(match[1])
  const second = Number(match[2])
  return first > 0 && first <= 12 && second > 0 && second <= 12 && first !== second
}

function isUnambiguousDayFirstDate(value: unknown): boolean {
  const match = String(value ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\b|$)/)
  return Boolean(match && Number(match[1]) > 12 && Number(match[2]) <= 12)
}

function validDate(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month - 1, day))
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function currencyCodeFrom(value: unknown): string | null {
  const text = String(value ?? '').trim().toUpperCase()
  const code = text.match(/\b(USD|EUR|GBP|INR|CAD|AUD|NZD|JPY|CHF|SGD|HKD|AED|ZAR|MXN)\b/)
  if (code) return code[1]
  if (text.includes('₹')) return 'INR'
  if (text.includes('€')) return 'EUR'
  if (text.includes('£')) return 'GBP'
  if (text.includes('¥') || text.includes('￥')) return 'JPY'
  if (text.includes('C$')) return 'CAD'
  if (text.includes('A$')) return 'AUD'
  if (text.includes('$')) return 'USD'
  return null
}

function parseAmount(value: unknown): { value: number; currencyCode: string | null } | null {
  if (typeof value === 'number' && Number.isFinite(value)) return { value, currencyCode: null }
  const raw = String(value ?? '').trim()
  if (!raw || raw === '-' || raw === '—') return null
  const currencyCode = currencyCodeFrom(raw)
  const negativeByBrackets = /^\(.*\)$/.test(raw)
  let cleaned = raw.replace(/[^\d,\.\-+]/g, '')
  if (!cleaned || !/\d/.test(cleaned)) return null
  const lastComma = cleaned.lastIndexOf(',')
  const lastPoint = cleaned.lastIndexOf('.')
  if (lastComma >= 0 && lastPoint >= 0) {
    const decimalIndex = Math.max(lastComma, lastPoint)
    const integer = cleaned.slice(0, decimalIndex).replace(/[,.]/g, '')
    const fraction = cleaned.slice(decimalIndex + 1).replace(/[,.]/g, '')
    cleaned = `${integer}.${fraction}`
  } else if (lastComma >= 0) {
    const digitsAfterComma = cleaned.length - lastComma - 1
    if (digitsAfterComma > 0 && digitsAfterComma <= 2) cleaned = `${cleaned.slice(0, lastComma).replace(/,/g, '')}.${cleaned.slice(lastComma + 1)}`
    else cleaned = cleaned.replace(/,/g, '')
  } else if (lastPoint >= 0 && cleaned.length - lastPoint - 1 === 3) {
    cleaned = cleaned.replace(/\./g, '')
  }
  const number = Number(cleaned)
  if (!Number.isFinite(number)) return null
  return { value: negativeByBrackets ? -Math.abs(number) : number, currencyCode }
}

function rowValue(row: unknown[], index: number | undefined): unknown {
  return index === undefined ? '' : row[index] ?? ''
}

function getDirection(typeValue: unknown): 'debit' | 'credit' | null {
  const value = String(typeValue ?? '').toLowerCase().trim()
  if (/\b(cr|credit|deposit|incoming|inflow|refund|reversal|payment received|cashback|salary|payroll|pension|interest|benefit|rebate)\b/.test(value)) return 'credit'
  if (/\b(dr|debit|purchase|withdrawal|outgoing|outflow|payment)\b/.test(value)) return 'debit'
  return null
}

function parseMatrix(
  rows: Matrix,
  file: File,
  parser: ParsedStatement['parser'],
  id: string,
  additionalWarnings: string[] = [],
  defaultCurrency = 'USD',
): ParsedStatement {
  const map = findHeader(rows)
  if (!map) {
    return {
      id, fileName: file.name, fileSize: file.size, parser, transactions: [],
      warnings: additionalWarnings,
      skippedRows: 0,
      errors: ['Could not identify date, description, and amount columns. Use a CSV or Excel file with a recognizable header row.'],
    }
  }

  const rawRows = rows.slice(map.headerRow + 1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
  const amountSamples = rawRows
    .map((row) => parseAmount(rowValue(row, map.indexes.amount))?.value)
    .filter((amount): amount is number => amount !== undefined)
  const hasSignedAmountSignals = amountSamples.some((amount) => amount < 0)
  const hasSeparateSides = map.indexes.debit !== undefined || map.indexes.credit !== undefined
  const amountHeader = map.amountOnlyHeader
  const amountDefaultsToCredit = /^(deposit|deposits)$/.test(amountHeader)
  const amountDefaultsToDebit = /^(withdrawal|withdrawals|debit|debits)$/.test(amountHeader)
  const warnings = [...additionalWarnings]

  const transactions: StagedTransaction[] = []
  let skippedRows = 0
  let ambiguousDirectionRows = 0
  let ambiguousDateRows = 0
  let inferredDayFirstRows = 0
  for (const [index, row] of rawRows.entries()) {
    const originalDate = String(rowValue(row, map.indexes.date) ?? '').trim()
    const dateAmbiguous = isAmbiguousNumericDate(originalDate)
    if (dateAmbiguous) ambiguousDateRows += 1
    else if (isUnambiguousDayFirstDate(originalDate)) inferredDayFirstRows += 1
    const date = parseDate(originalDate)
    const description = String(rowValue(row, map.indexes.description)).trim().replace(/\s+/g, ' ')
    const debitRaw = map.indexes.debit === undefined ? null : parseAmount(rowValue(row, map.indexes.debit))
    const creditRaw = map.indexes.credit === undefined ? null : parseAmount(rowValue(row, map.indexes.credit))
    const amountRaw = map.indexes.amount === undefined ? null : parseAmount(rowValue(row, map.indexes.amount))
    const direction = getDirection(`${rowValue(row, map.indexes.type)} ${rowValue(row, map.indexes.description)}`)
    const rowCurrency = currencyCodeFrom(rowValue(row, map.indexes.currency))
    const directionAmbiguous = Boolean(
      amountRaw && amountRaw.value > 0 && !hasSignedAmountSignals && !hasSeparateSides
      && !amountDefaultsToCredit && !amountDefaultsToDebit && direction === null,
    )
    let amount: number | null = null
    let currencyCode = rowCurrency ?? debitRaw?.currencyCode ?? creditRaw?.currencyCode ?? amountRaw?.currencyCode ?? defaultCurrency

    if (debitRaw && Math.abs(debitRaw.value) > 0) {
      amount = -Math.abs(debitRaw.value)
      currencyCode = rowCurrency ?? debitRaw.currencyCode ?? currencyCode
    } else if (creditRaw && Math.abs(creditRaw.value) > 0) {
      amount = Math.abs(creditRaw.value)
      currencyCode = rowCurrency ?? creditRaw.currencyCode ?? currencyCode
    } else if (amountRaw) {
      if (amountRaw.value < 0) amount = amountRaw.value
      else if (direction === 'credit' || amountDefaultsToCredit || (hasSignedAmountSignals && direction !== 'debit' && !amountDefaultsToDebit)) amount = Math.abs(amountRaw.value)
      else amount = -Math.abs(amountRaw.value)
      currencyCode = rowCurrency ?? amountRaw.currencyCode ?? currencyCode
    }

    if (!date || !description || amount === null || amount === 0) {
      // Header repeats, running balance lines, and page notes are expected in many exports.
      const normalized = description.toLowerCase()
      if (normalized && /^(?:opening balance|closing balance|beginning balance|ending balance|total|page \d+|balance brought forward|balance carried forward)/.test(normalized)) continue
      skippedRows += 1
      continue
    }

    const classification = classifyMerchant(description)
    const issue = map.indexes.debit !== undefined && map.indexes.credit !== undefined && debitRaw && creditRaw
      ? 'Both debit and credit columns contain values; verify this row.'
      : undefined
    transactions.push({
      id: `${id}-row-${index}`,
      date,
      description,
      merchant: classification.merchant,
      amount,
      currencyCode,
      category: classification.category,
      confidence: classification.confidence,
      classificationMethod: classification.method,
      directionAmbiguous,
      dateAmbiguous,
      originalDate: dateAmbiguous ? originalDate : undefined,
      issue,
    })
    if (directionAmbiguous) ambiguousDirectionRows += 1
  }

  if (ambiguousDirectionRows) warnings.push(`${ambiguousDirectionRows} positive amount${ambiguousDirectionRows === 1 ? '' : 's'} had no clear debit/credit clue and default to spending; choose their direction in the preview.`)
  if (ambiguousDateRows) warnings.push('Ambiguous numeric dates default to MM/DD/YYYY. Choose MM/DD or DD/MM in the preview if your bank uses a day-first format.')
  if (inferredDayFirstRows) warnings.push(`${inferredDayFirstRows} numeric date${inferredDayFirstRows === 1 ? '' : 's'} beginning with a day greater than 12 were interpreted as DD/MM/YYYY.`)
  if (skippedRows > 0) warnings.push(`${skippedRows} non-empty row${skippedRows === 1 ? '' : 's'} could not be read as a dated transaction and were skipped.`)
  if (transactions.length === 0 && warnings.length === additionalWarnings.length) warnings.push('No transaction rows were identified below the detected header.')
  return {
    id,
    fileName: file.name,
    fileSize: file.size,
    parser,
    transactions,
    warnings: [...new Set(warnings)],
    skippedRows,
    errors: transactions.length ? [] : ['No valid transactions were extracted. Check the file columns and date/amount format.'],
  }
}

async function parseCsv(file: File, id: string, defaultCurrency: string): Promise<ParsedStatement> {
  try {
    const result = Papa.parse<unknown[]>(await file.text(), {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
    })
    const warnings = result.errors.length
      ? [`The CSV parser reported ${result.errors.length} formatting issue${result.errors.length === 1 ? '' : 's'}; review the extracted rows.`]
      : []
    return parseMatrix(result.data as Matrix, file, 'CSV', id, warnings, defaultCurrency)
  } catch (error) {
    return {
      id, fileName: file.name, fileSize: file.size, parser: 'CSV', transactions: [], warnings: [], skippedRows: 0,
      errors: [`Could not read this CSV: ${error instanceof Error ? error.message : 'Unknown CSV error.'}`],
    }
  }
}

async function parseSpreadsheet(file: File, id: string, defaultCurrency: string): Promise<ParsedStatement> {
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) throw new Error('No worksheet was found.')
    const sheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
    const warnings = workbook.SheetNames.length > 1
      ? [`Only the first worksheet (“${firstSheetName}”) was processed. Other worksheets were not imported.`]
      : []
    return parseMatrix(rows as Matrix, file, 'Excel', id, warnings, defaultCurrency)
  } catch (error) {
    return {
      id, fileName: file.name, fileSize: file.size, parser: 'Excel', transactions: [], warnings: [], skippedRows: 0,
      errors: [`Could not read this spreadsheet: ${error instanceof Error ? error.message : 'Unknown workbook error.'}`],
    }
  }
}

interface PdfTextPart {
  x: number
  y: number
  text: string
  width?: number
}

interface PdfTextLine {
  y: number
  parts: PdfTextPart[]
  text: string
}

interface PdfPageText {
  lines: PdfTextLine[]
  columns: PdfTableColumnBounds | null
}

export interface PdfTableColumnBounds {
  dateStart: number
  dateEnd: number
  descriptionStart: number
  descriptionEnd: number
  withdrawalStart?: number
  withdrawalEnd?: number
  depositStart?: number
  depositEnd?: number
  amountStart?: number
  amountEnd?: number
  balanceStart?: number
  balanceEnd?: number
}

function pdfLineItems(items: unknown[]): PdfTextLine[] {
  const textItems = items.filter((item): item is { str: string; transform: number[]; width?: number } => {
    return Boolean(item && typeof item === 'object' && 'str' in item && 'transform' in item && String((item as { str?: unknown }).str ?? '').trim())
  })
  const sorted = textItems.sort((a, b) => {
    const yDifference = (b.transform[5] ?? 0) - (a.transform[5] ?? 0)
    return yDifference || (a.transform[4] ?? 0) - (b.transform[4] ?? 0)
  })
  const lines: Array<{ y: number; parts: PdfTextPart[] }> = []
  for (const item of sorted) {
    const y = item.transform[5] ?? 0
    const last = lines[lines.length - 1]
    if (!last || Math.abs(last.y - y) > 2.25) lines.push({ y, parts: [] })
    lines[lines.length - 1].parts.push({
      x: item.transform[4] ?? 0,
      y,
      text: item.str.trim(),
      width: typeof item.width === 'number' ? item.width : 25,
    })
  }
  return lines.map((line) => {
    const parts = line.parts.sort((a, b) => a.x - b.x)
    return { y: line.y, parts, text: parts.map((part) => part.text).join(' ').replace(/\s+/g, ' ').trim() }
  }).filter((line) => line.text)
}

const monthPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const pdfDateStart = new RegExp(`^(?:\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}|${monthPattern}\\s+\\d{1,2},?\\s+\\d{2,4}|\\d{1,2}\\s+${monthPattern}\\s+\\d{2,4})\\b`, 'i')
const pdfMoney = /(?:\(\s*)?[-+]?(?:USD|EUR|GBP|INR|CAD|AUD|\$|€|£|₹|¥)?\s*\d[\d,]*(?:\.\d{2})?(?:\s*\))?/gi

function cleanHeaderPart(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isDateColumnLabel(text: string): boolean {
  const c = cleanHeaderPart(text)
  return /^(txn\s*date|trans(action)?\s*date|date|posting\s*date|posted\s*date|value\s*date)$/.test(c)
}

function isDescColumnLabel(text: string): boolean {
  const c = cleanHeaderPart(text)
  return /^(narration|particulars|description|details|transaction\s*details|memo|payee|merchant)$/.test(c)
}

function isDebitColumnLabel(text: string): boolean {
  const c = cleanHeaderPart(text)
  return /^(withdrawal(\s*amount)?|debit(\s*amount)?|dr(\s*amount)?|money\s*out|outflow)$/.test(c)
}

function isCreditColumnLabel(text: string): boolean {
  const c = cleanHeaderPart(text)
  return /^(deposit(\s*amount)?|credit(\s*amount)?|cr(\s*amount)?|money\s*in|inflow)$/.test(c)
}

function isBalanceColumnLabel(text: string): boolean {
  const c = cleanHeaderPart(text)
  return /^(closing\s*balance|balance|running\s*balance|available\s*balance)$/.test(c)
}

function isAmountColumnLabel(text: string): boolean {
  const c = cleanHeaderPart(text)
  return /^(amount|transaction\s*amount|value)$/.test(c)
}

function testHeaderParts(parts: Array<{ x: number; text: string; width?: number }>): PdfTableColumnBounds | null {
  const primaryDate = parts.find((p) => /^(txn\s*date|trans(action)?\s*date|date)/i.test(cleanHeaderPart(p.text))) ?? parts.find((p) => isDateColumnLabel(p.text))
  const primaryDesc = parts.find((p) => isDescColumnLabel(p.text))
  const debitPart = parts.find((p) => isDebitColumnLabel(p.text))
  const creditPart = parts.find((p) => isCreditColumnLabel(p.text))
  const balancePart = parts.find((p) => isBalanceColumnLabel(p.text))
  const amountPart = parts.find((p) => isAmountColumnLabel(p.text))

  if (!primaryDate || !primaryDesc) return null
  if (!debitPart && !creditPart && !amountPart) return null

  type ColType = 'date' | 'description' | 'debit' | 'credit' | 'balance' | 'amount' | 'other'
  const colList: Array<{ type: ColType; x: number; width: number; endX: number }> = []

  for (const part of parts) {
    const w = part.width || 25
    const endX = part.x + w
    if (part === primaryDate) colList.push({ type: 'date', x: part.x, width: w, endX })
    else if (part === primaryDesc) colList.push({ type: 'description', x: part.x, width: w, endX })
    else if (part === debitPart) colList.push({ type: 'debit', x: part.x, width: w, endX })
    else if (part === creditPart) colList.push({ type: 'credit', x: part.x, width: w, endX })
    else if (part === balancePart) colList.push({ type: 'balance', x: part.x, width: w, endX })
    else if (part === amountPart) colList.push({ type: 'amount', x: part.x, width: w, endX })
    else colList.push({ type: 'other', x: part.x, width: w, endX })
  }

  colList.sort((a, b) => a.x - b.x)

  const bounds: Partial<PdfTableColumnBounds> = {}
  for (let idx = 0; idx < colList.length; idx++) {
    const col = colList[idx]
    const prev = colList[idx - 1]
    const next = colList[idx + 1]

    let startX = 0
    let endX = 9999

    if (col.type === 'description') {
      startX = prev ? Math.min(prev.endX + 4, (prev.x + col.x) / 2) : 0
      endX = next ? next.x - 4 : 9999
    } else if (col.type === 'date') {
      startX = idx === 0 ? 0 : (prev.x + col.x) / 2
      endX = next ? Math.min(next.x - 4, (col.endX + next.x) / 2) : 9999
    } else {
      startX = prev ? (prev.type === 'description' ? prev.x + (col.x - prev.x) * 0.7 : (prev.x + col.x) / 2) : 0
      endX = next ? (col.x + next.x) / 2 : 9999
    }

    if (col.type === 'date' && bounds.dateStart === undefined) {
      bounds.dateStart = startX
      bounds.dateEnd = endX
    } else if (col.type === 'description' && bounds.descriptionStart === undefined) {
      bounds.descriptionStart = startX
      bounds.descriptionEnd = endX
    } else if (col.type === 'debit' && bounds.withdrawalStart === undefined) {
      bounds.withdrawalStart = startX
      bounds.withdrawalEnd = endX
    } else if (col.type === 'credit' && bounds.depositStart === undefined) {
      bounds.depositStart = startX
      bounds.depositEnd = endX
    } else if (col.type === 'balance' && bounds.balanceStart === undefined) {
      bounds.balanceStart = startX
      bounds.balanceEnd = endX
    } else if (col.type === 'amount' && bounds.amountStart === undefined) {
      bounds.amountStart = startX
      bounds.amountEnd = endX
    }
  }

  if (
    bounds.dateStart !== undefined
    && bounds.descriptionStart !== undefined
    && (bounds.withdrawalStart !== undefined || bounds.depositStart !== undefined || bounds.amountStart !== undefined)
  ) {
    return {
      dateStart: bounds.dateStart,
      dateEnd: bounds.dateEnd!,
      descriptionStart: bounds.descriptionStart,
      descriptionEnd: bounds.descriptionEnd!,
      withdrawalStart: bounds.withdrawalStart,
      withdrawalEnd: bounds.withdrawalEnd,
      depositStart: bounds.depositStart,
      depositEnd: bounds.depositEnd,
      amountStart: bounds.amountStart,
      amountEnd: bounds.amountEnd,
      balanceStart: bounds.balanceStart,
      balanceEnd: bounds.balanceEnd,
    }
  }

  return null
}

function detectPdfTableColumns(lines: PdfTextLine[]): PdfTableColumnBounds | null {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const l1 = lines[i]
    const l2 = lines[i + 1]

    // Test single line
    const singleBounds = testHeaderParts(l1.parts)
    if (singleBounds) return singleBounds

    // Test merged two-line header (e.g. Txn / Date, Brn / Code, Ref / No)
    if (l2 && Math.abs(l1.y - l2.y) < 18) {
      const mergedParts: Array<{ x: number; text: string; width?: number }> = []
      const allParts = [...l1.parts, ...l2.parts].sort((a, b) => a.x - b.x)
      for (const part of allParts) {
        const existing = mergedParts.find((m) => Math.abs(m.x - part.x) < 25)
        if (existing) {
          existing.text = `${existing.text} ${part.text}`.trim()
          existing.width = Math.max(existing.width ?? 0, (part.x + (part.width || 0)) - existing.x)
        } else {
          mergedParts.push({ x: part.x, text: part.text, width: part.width || 25 })
        }
      }
      const mergedBounds = testHeaderParts(mergedParts)
      if (mergedBounds) return mergedBounds
    }
  }
  return null
}

function pdfTextInColumn(line: PdfTextLine, startX: number, endX: number): string {
  return line.parts
    .filter((part) => part.x >= startX && part.x < endX)
    .map((part) => part.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectPdfCurrency(lines: PdfTextLine[], bankName?: string | null): string | null {
  const codePattern = '(USD|EUR|GBP|INR|CAD|AUD|NZD|JPY|CHF|SGD|HKD|AED|ZAR|MXN)'
  const labeledCurrency = new RegExp(`\\b(?:account\\s+)?currency(?:\\s+code)?\\b\\s*[:\\-]?\\s*${codePattern}\\b`, 'i')
  for (const line of lines) {
    const match = line.text.match(labeledCurrency)
    if (match) return currencyCodeFrom(match[1])
  }

  // Check for Indian bank, IFSC code, UPI, Indian lakh formatting, or Rupee symbols
  const allText = lines.slice(0, 100).map((l) => l.text).join(' ')
  const isIndianBank = bankName && /karur vysya|hdfc|state bank|sbi|icici|axis|kotak|baroda|punjab national|pnb|canara|union bank|idbi|indian bank/i.test(bankName)
  const hasIndianClues = /\b(IFSC|MICR|UPI[-/]|NEFT|IMPS|RTGS|KVBL|HDFC|SBIN|ICIC|UTIB|BARB0|PUNB|CNRB)\b/i.test(allText)
    || /\b\d{1,2},\d{2},\d{3}(?:\.\d{2})?\b/.test(allText)
    || /\b(Tamil Nadu|Chennai|Mumbai|Delhi|Bengaluru|Bangalore|Kolkata|Hyderabad|Pune|Ahmedabad)\b/i.test(allText)
    || /\b(?:Rs\.?|INR|₹)\b/i.test(allText)

  if (isIndianBank || hasIndianClues) {
    return 'INR'
  }

  return null
}

function isUnambiguousMonthFirstDate(value: unknown): boolean {
  const match = String(value ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\b|$)/)
  return Boolean(match && Number(match[1]) <= 12 && Number(match[2]) > 12)
}

function inferredPdfDateOrder(dates: string[]): 'MDY' | 'DMY' | undefined {
  const dayFirst = dates.filter(isUnambiguousDayFirstDate).length
  const monthFirst = dates.filter(isUnambiguousMonthFirstDate).length
  if (dayFirst > 0 && monthFirst === 0) return 'DMY'
  if (monthFirst > 0 && dayFirst === 0) return 'MDY'
  return undefined
}

function parseColumnPdf(
  fileName: string,
  fileSize: number,
  id: string,
  defaultCurrency: string,
  pages: PdfPageText[],
  detectedCurrency: string | null,
): ParsedStatement {
  const rawRows: Array<{ originalDate: string; description: string; amount: number; currencyCode: string; issue?: string }> = []
  const dateValues: string[] = []
  let skippedRows = 0
  let bothSideRows = 0

  for (const page of pages) {
    const columns = page.columns
    if (!columns) continue
    const dateStart = columns.dateStart
    const dateEnd = columns.dateEnd
    const descriptionStart = columns.descriptionStart
    const descriptionEnd = columns.descriptionEnd

    const datedLines = page.lines.flatMap((line, index) => {
      const dateCell = line.parts.find((part) => part.x >= dateStart - 8 && part.x < dateEnd + 8 && pdfDateStart.test(part.text))
      const dateMatch = dateCell?.text.match(pdfDateStart)
      return dateMatch ? [{ line, index, originalDate: dateMatch[0].trim() }] : []
    })

    for (const [rowIndex, dated] of datedLines.entries()) {
      const { line, originalDate } = dated

      const withdrawal = columns.withdrawalStart !== undefined && columns.withdrawalEnd !== undefined
        ? parseAmount(pdfTextInColumn(line, columns.withdrawalStart, columns.withdrawalEnd))
        : null
      const deposit = columns.depositStart !== undefined && columns.depositEnd !== undefined
        ? parseAmount(pdfTextInColumn(line, columns.depositStart, columns.depositEnd))
        : null
      const amountSingle = columns.amountStart !== undefined && columns.amountEnd !== undefined
        ? parseAmount(pdfTextInColumn(line, columns.amountStart, columns.amountEnd))
        : null

      const withdrawalAmount = Math.abs(withdrawal?.value ?? 0)
      const depositAmount = Math.abs(deposit?.value ?? 0)

      const previousDateY = datedLines[rowIndex - 1]?.line.y ?? Number.POSITIVE_INFINITY
      const nextDateY = datedLines[rowIndex + 1]?.line.y ?? Number.NEGATIVE_INFINITY
      const upperBoundary = Number.isFinite(previousDateY)
        ? Math.min((previousDateY + line.y) / 2, line.y + 16)
        : line.y + 16
      const lowerBoundary = Number.isFinite(nextDateY)
        ? Math.max((line.y + nextDateY) / 2, line.y - 16)
        : line.y - 16
      const narrationLines = page.lines
        .filter((candidate) => candidate.y <= upperBoundary && candidate.y > lowerBoundary)
        .map((candidate) => ({ y: candidate.y, text: pdfTextInColumn(candidate, descriptionStart, descriptionEnd) }))
        .filter((candidate) => candidate.text)
        .sort((a, b) => b.y - a.y)
      const description = narrationLines.map((candidate) => candidate.text).join(' ').replace(/[|•]+/g, ' ').replace(/\s+/g, ' ').trim()

      const isBalanceSummary = /^(?:opening balance|closing balance|beginning balance|ending balance|balance b\/f|b\/f\b|b\/f\.\.\.|total)/i.test(description)
      if (isBalanceSummary) {
        continue
      }

      if (!description) {
        skippedRows += 1
        continue
      }

      if (withdrawalAmount === 0 && depositAmount === 0 && (!amountSingle || amountSingle.value === 0)) {
        continue
      }

      dateValues.push(originalDate)

      let amount = depositAmount - withdrawalAmount
      if (amount === 0 && amountSingle) {
        const dir = getDirection(description)
        amount = amountSingle.value < 0 ? amountSingle.value : dir === 'credit' ? amountSingle.value : -Math.abs(amountSingle.value)
      }

      const bothSides = withdrawalAmount > 0 && depositAmount > 0
      if (bothSides) bothSideRows += 1
      rawRows.push({
        originalDate,
        description: description || 'Unlabeled transaction',
        amount,
        currencyCode: withdrawal?.currencyCode ?? deposit?.currencyCode ?? amountSingle?.currencyCode ?? detectedCurrency ?? defaultCurrency,
        issue: [
          bothSides ? 'Both withdrawal and deposit columns contain values; the displayed amount is their net. Verify this row.' : undefined,
          !description ? 'A dated transaction amount was retained but no narration could be associated; review the source statement.' : undefined,
        ].filter(Boolean).join(' ') || undefined,
      })
    }
  }

  const dateFormatMode = inferredPdfDateOrder(dateValues) ?? (detectedCurrency === 'INR' ? 'DMY' : undefined)
  const ambiguousDateRows = dateValues.filter(isAmbiguousNumericDate).length
  const inferredDayFirstRows = dateValues.filter(isUnambiguousDayFirstDate).length
  const transactions: StagedTransaction[] = []
  rawRows.forEach((row, index) => {
    const date = parseDate(row.originalDate, dateFormatMode ?? 'MDY')
    if (!date) {
      skippedRows += 1
      return
    }
    const classification = classifyMerchant(row.description)
    const dateAmbiguous = isAmbiguousNumericDate(row.originalDate)
    transactions.push({
      id: `${id}-pdf-${index}`,
      date,
      description: row.description,
      merchant: classification.merchant,
      amount: row.amount,
      currencyCode: row.currencyCode,
      category: classification.category,
      confidence: classification.confidence,
      classificationMethod: classification.method,
      dateAmbiguous,
      originalDate: dateAmbiguous ? row.originalDate : undefined,
      issue: row.issue,
    })
  })

  const warnings = [
    'PDFs are parsed from embedded text only. Scanned/image-only pages cannot be read; review every extracted row against the source statement.',
    'Debit and credit values were read from their labeled columns; the running balance was not treated as a transaction amount.',
  ]
  if (detectedCurrency) {
    const evidence = detectedCurrency === 'INR' ? 'statement metadata / bank identifiers' : 'its labeled currency field'
    warnings.push(`Statement currency ${detectedCurrency} was detected from ${evidence} and applied to amounts without an explicit symbol.`)
  }
  if (ambiguousDateRows) {
    const format = dateFormatMode === 'DMY' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'
    const evidence = dateFormatMode ? 'based on unambiguous dates elsewhere in the statement' : 'because no unambiguous date-order evidence was found'
    warnings.push(`${ambiguousDateRows} ambiguous numeric PDF date${ambiguousDateRows === 1 ? '' : 's'} were interpreted as ${format} ${evidence}; review or change the order in the preview.`)
  }
  if (inferredDayFirstRows) warnings.push(`${inferredDayFirstRows} numeric PDF date${inferredDayFirstRows === 1 ? '' : 's'} beginning with a day greater than 12 were interpreted as DD/MM/YYYY.`)
  if (bothSideRows) warnings.push(`${bothSideRows} PDF row${bothSideRows === 1 ? '' : 's'} had values in both debit and credit columns and were imported as a net amount for review.`)
  if (skippedRows) warnings.push(`${skippedRows} dated PDF row${skippedRows === 1 ? '' : 's'} could not be parsed and were skipped.`)
  return {
    id, fileName, fileSize, parser: 'PDF', transactions,
    warnings, skippedRows, dateFormatMode,
    errors: transactions.length ? [] : ['No transactions could be extracted from the PDF text. It may be scanned or use an unsupported table layout; try a CSV export from your bank.'],
  }
}

function parseUnstructuredPdf(
  fileName: string,
  fileSize: number,
  id: string,
  defaultCurrency: string,
  lines: PdfTextLine[],
  detectedCurrency: string | null,
): ParsedStatement {
  const transactions: StagedTransaction[] = []
  let skippedRows = 0
  let linesWithMultipleAmounts = 0
  let ambiguousDirectionRows = 0
  let ambiguousDateRows = 0
  let inferredDayFirstRows = 0
  for (const [index, pdfLine] of lines.entries()) {
    const line = pdfLine.text
    if (!pdfDateStart.test(line)) continue
    const dateMatch = line.match(pdfDateStart)
    if (!dateMatch) continue
    const originalDate = dateMatch[0]
    const dateAmbiguous = isAmbiguousNumericDate(originalDate)
    if (dateAmbiguous) ambiguousDateRows += 1
    else if (isUnambiguousDayFirstDate(originalDate)) inferredDayFirstRows += 1
    const date = parseDate(originalDate)
    const remaining = line.slice(dateMatch[0].length).trim()
    const amounts = [...remaining.matchAll(pdfMoney)]
    if (!date || amounts.length === 0) {
      skippedRows += 1
      continue
    }
    if (amounts.length > 1) linesWithMultipleAmounts += 1
    const chosen = amounts.length > 1 ? amounts[amounts.length - 2] : amounts[amounts.length - 1]
    const chosenText = chosen[0]
    const parsed = parseAmount(chosenText)
    const description = remaining.slice(0, chosen.index).replace(/[|•]+/g, ' ').trim().replace(/\s+/g, ' ')
    if (!description || !parsed || parsed.value === 0) {
      skippedRows += 1
      continue
    }
    const direction = getDirection(description)
    const directionAmbiguous = parsed.value > 0 && direction === null
    const amount = parsed.value < 0 ? parsed.value : direction === 'credit' ? parsed.value : -Math.abs(parsed.value)
    const classification = classifyMerchant(description)
    transactions.push({
      id: `${id}-pdf-${index}`,
      date,
      description,
      merchant: classification.merchant,
      amount,
      currencyCode: parsed.currencyCode ?? detectedCurrency ?? defaultCurrency,
      category: classification.category,
      confidence: classification.confidence,
      classificationMethod: classification.method,
      directionAmbiguous,
      dateAmbiguous,
      originalDate: dateAmbiguous ? originalDate : undefined,
      issue: amounts.length > 1 ? 'Multiple amounts are present on this PDF line; the earlier amount was selected because the last often represents a balance. Verify this row.' : undefined,
    })
    if (directionAmbiguous) ambiguousDirectionRows += 1
  }

  const warnings = [
    'PDFs are parsed from embedded text only. Scanned/image-only pages cannot be read; review every extracted row against the source statement.',
  ]
  if (detectedCurrency) {
    const evidence = detectedCurrency === 'INR' ? 'statement metadata / bank identifiers' : 'its labeled currency field'
    warnings.push(`Statement currency ${detectedCurrency} was detected from ${evidence} and applied to amounts without an explicit symbol.`)
  }
  if (ambiguousDirectionRows) warnings.push(`${ambiguousDirectionRows} positive PDF amount${ambiguousDirectionRows === 1 ? '' : 's'} lacked a direction clue and default to spending; choose their direction in the preview.`)
  if (ambiguousDateRows) warnings.push('Ambiguous numeric PDF dates default to MM/DD/YYYY. Choose MM/DD or DD/MM in the preview if your bank uses a day-first format.')
  if (inferredDayFirstRows) warnings.push(`${inferredDayFirstRows} numeric PDF date${inferredDayFirstRows === 1 ? '' : 's'} beginning with a day greater than 12 were interpreted as DD/MM/YYYY.`)
  if (linesWithMultipleAmounts) warnings.push(`${linesWithMultipleAmounts} PDF line${linesWithMultipleAmounts === 1 ? '' : 's'} contained multiple amounts; the earlier amount was selected for review.`)
  if (skippedRows) warnings.push(`${skippedRows} dated PDF line${skippedRows === 1 ? '' : 's'} could not be parsed and were skipped.`)
  return {
    id, fileName, fileSize, parser: 'PDF', transactions,
    warnings: [...new Set(warnings)], skippedRows,
    errors: transactions.length ? [] : ['No transactions could be extracted from the PDF text. It may be scanned or use an unsupported table layout; try a CSV export from your bank.'],
  }
}

function detectPdfBankName(lines: PdfTextLine[]): string | null {
  for (const line of lines.slice(0, 35)) {
    const text = line.text.toLowerCase()
    if (text.includes('hdfc bank')) return 'HDFC Bank'
    if (text.includes('karur vysya bank') || text.includes('kvb')) return 'Karur Vysya Bank'
    if (text.includes('state bank of india') || text.includes('sbi')) return 'State Bank of India'
    if (text.includes('icici bank')) return 'ICICI Bank'
    if (text.includes('axis bank')) return 'Axis Bank'
    if (text.includes('kotak mahindra') || text.includes('kotak')) return 'Kotak Mahindra Bank'
    if (text.includes('bank of baroda') || text.includes('bob')) return 'Bank of Baroda'
    if (text.includes('punjab national bank') || text.includes('pnb')) return 'Punjab National Bank'
    if (text.includes('canara bank')) return 'Canara Bank'
    if (text.includes('union bank of india')) return 'Union Bank of India'
    if (text.includes('idbi bank')) return 'IDBI Bank'
    if (text.includes('indian bank')) return 'Indian Bank'
  }
  return null
}

export function parsePdfTextPages(
  fileName: string,
  fileSize: number,
  id: string,
  defaultCurrency: string,
  pageItems: unknown[][],
): ParsedStatement {
  const pages: PdfPageText[] = []
  let activeColumns: PdfTableColumnBounds | null = null
  for (const items of pageItems) {
    const lines = pdfLineItems(items)
    activeColumns = detectPdfTableColumns(lines) ?? activeColumns
    pages.push({ lines, columns: activeColumns })
  }
  const lines = pages.flatMap((page) => page.lines)
  const bankName = detectPdfBankName(lines)
  const detectedCurrency = detectPdfCurrency(lines, bankName)
  if (pages.some((page) => page.columns)) {
    const parsed = parseColumnPdf(fileName, fileSize, id, defaultCurrency, pages, detectedCurrency)
    return { ...parsed, bankName: bankName ?? undefined }
  }
  const parsed = parseUnstructuredPdf(fileName, fileSize, id, defaultCurrency, lines, detectedCurrency)
  return { ...parsed, bankName: bankName ?? undefined }
}

async function parsePdf(file: File, id: string, defaultCurrency: string): Promise<ParsedStatement> {
  try {
    const [pdfjsLib, pdfWorker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default
    const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
    if (document.numPages > MAX_PDF_PAGES) {
      await document.destroy()
      return {
        id, fileName: file.name, fileSize: file.size, parser: 'PDF', transactions: [], warnings: [], skippedRows: 0,
        errors: [`This PDF has ${document.numPages} pages; the browser importer supports up to ${MAX_PDF_PAGES} pages per file. Split it into smaller statements and try again.`],
      }
    }
    const pageItems: unknown[][] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      pageItems.push(content.items as unknown[])
    }
    await document.destroy()
    return parsePdfTextPages(file.name, file.size, id, defaultCurrency, pageItems)
  } catch (error) {
    return {
      id, fileName: file.name, fileSize: file.size, parser: 'PDF', transactions: [], warnings: [], skippedRows: 0,
      errors: [`Could not read this PDF: ${error instanceof Error ? error.message : 'Unknown PDF error.'}`],
    }
  }
}

export async function parseStatementFile(file: File, defaultCurrency = 'USD'): Promise<ParsedStatement> {
  const id = crypto.randomUUID()
  if (file.size > MAX_FILE_BYTES) {
    return {
      id, fileName: file.name, fileSize: file.size, parser: 'CSV', transactions: [], warnings: [], skippedRows: 0,
      errors: ['This file exceeds the 20 MB browser import limit. Export a smaller date range or split the statement.'],
    }
  }
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') return parseCsv(file, id, defaultCurrency)
  if (extension === 'xls' || extension === 'xlsx') return parseSpreadsheet(file, id, defaultCurrency)
  if (extension === 'pdf') return parsePdf(file, id, defaultCurrency)
  return {
    id, fileName: file.name, fileSize: file.size, parser: 'CSV', transactions: [], warnings: [], skippedRows: 0,
    errors: ['Unsupported file type. Choose a CSV, TSV, XLS, XLSX, or text-based PDF statement.'],
  }
}
