import type { Transaction } from '../types'

/**
 * Parses an ISO date string (YYYY-MM-DD) into a timestamp at UTC midnight.
 */
function toTimestamp(dateStr: string): number {
  const parts = dateStr.split('-').map(Number)
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return Date.UTC(parts[0], parts[1] - 1, parts[2])
  }
  return new Date(dateStr).getTime()
}

/**
 * Checks if two transactions can form a valid self-transfer pair:
 * - One is a debit (< 0) and one is a credit (> 0)
 * - Absolute amounts match (within 1 cent/paise)
 * - Same currency
 * - Within 2 calendar days of each other (to account for NEFT/IMPS/weekend clearance)
 * - Originating from different statements or clearly marked internal legs
 */
export function canPairSelfTransfer(a: Transaction, b: Transaction): boolean {
  if (a.id === b.id) return false
  if (a.isDuplicate || b.isDuplicate) return false
  if (a.currencyCode !== b.currencyCode) return false

  // Must be opposite directions (one debit, one credit)
  if (!((a.amount < 0 && b.amount > 0) || (a.amount > 0 && b.amount < 0))) {
    return false
  }

  // Exact absolute amount match
  const absDiff = Math.abs(Math.abs(a.amount) - Math.abs(b.amount))
  if (absDiff > 0.01) return false

  // Must be from different statements (e.g., KVB vs HDFC)
  // Or if same statement, must have transfer clues
  if (a.sourceStatementId === b.sourceStatementId) {
    const isTransferA = a.category === 'Transfers' || /transfer|self|own account|sweep|closure/i.test(a.description)
    const isTransferB = b.category === 'Transfers' || /transfer|self|own account|sweep|closure/i.test(b.description)
    if (!isTransferA && !isTransferB) return false
  }

  // Date proximity check: <= 2 days (172800000 ms)
  const timeA = toTimestamp(a.date)
  const timeB = toTimestamp(b.date)
  const dayDiff = Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24)
  if (dayDiff > 2.05) return false

  return true
}

/**
 * Runs across all loaded transactions and pairs opposing debit/credit legs.
 * Respects user's manual unlinking (selfTransferConfirmedDistinct).
 */
export function detectSelfTransfers(transactions: Transaction[]): Transaction[] {
  // Reset existing automatic pairings (preserving user's confirmed manual overrides)
  const pool = transactions.map((t) => {
    if (t.selfTransferConfirmedDistinct) {
      return { ...t, isSelfTransfer: false, selfTransferPairId: undefined }
    }
    return { ...t, isSelfTransfer: false, selfTransferPairId: undefined }
  })

  const debits = pool.filter((t) => !t.isDuplicate && !t.selfTransferConfirmedDistinct && t.amount < 0)
  const credits = pool.filter((t) => !t.isDuplicate && !t.selfTransferConfirmedDistinct && t.amount > 0)

  const pairedCredits = new Set<string>()
  const pairs = new Map<string, string>() // debitId -> creditId

  // Sort debits so that we process them chronologically
  debits.sort((a, b) => a.date.localeCompare(b.date))

  for (const debit of debits) {
    // Find candidate matching credits
    const candidates = credits.filter((credit) => {
      if (pairedCredits.has(credit.id)) return false
      return canPairSelfTransfer(debit, credit)
    })

    if (candidates.length === 0) continue

    // Best candidate is the one closest in time (lowest day diff)
    const timeDebit = toTimestamp(debit.date)
    candidates.sort((c1, c2) => {
      const diff1 = Math.abs(toTimestamp(c1.date) - timeDebit)
      const diff2 = Math.abs(toTimestamp(c2.date) - timeDebit)
      return diff1 - diff2
    })

    const bestCredit = candidates[0]
    pairedCredits.add(bestCredit.id)
    pairs.set(debit.id, bestCredit.id)
    pairs.set(bestCredit.id, debit.id)
  }

  return pool.map((t) => {
    const pairId = pairs.get(t.id)
    if (pairId) {
      return {
        ...t,
        isSelfTransfer: true,
        selfTransferPairId: pairId,
        // If not already categorized by user, set category to 'Transfers'
        category: (t.category === 'Unknown' || t.classificationMethod !== 'manual') ? 'Transfers' : t.category,
      }
    }
    return t
  })
}

/**
 * Toggles a transaction's self-transfer status:
 * If it was paired, breaks the pair and marks both as selfTransferConfirmedDistinct.
 * If it was unlinked, removes the manual flag so re-pairing can occur.
 */
export function toggleSelfTransferPair(transactions: Transaction[], target: Transaction): Transaction[] {
  const isCurrentlyPaired = target.isSelfTransfer && !target.selfTransferConfirmedDistinct
  const pairId = target.selfTransferPairId

  return transactions.map((t) => {
    if (t.id === target.id || (pairId && t.id === pairId)) {
      if (isCurrentlyPaired) {
        // Break pair
        return {
          ...t,
          isSelfTransfer: false,
          selfTransferConfirmedDistinct: true,
          selfTransferPairId: undefined,
        }
      } else {
        // Re-enable pairing eligibility
        return {
          ...t,
          selfTransferConfirmedDistinct: false,
        }
      }
    }
    return t
  })
}
