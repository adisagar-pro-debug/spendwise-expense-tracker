import type { UserAccount, UserSession } from '../types'

const ACCOUNTS_STORAGE_KEY = 'spendwise.accounts.v1'
const SESSION_STORAGE_KEY = 'spendwise.session'

export function getStoredAccounts(): UserAccount[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UserAccount[]) : []
  } catch {
    return []
  }
}

export function saveStoredAccounts(accounts: UserAccount[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
  } catch {
    // Ignore storage quota
  }
}

export function upsertAccount(account: Omit<UserAccount, 'lastActiveAt'>): UserAccount {
  const current = getStoredAccounts()
  const existingIdx = current.findIndex((a) => a.id === account.id || (account.email && a.email?.toLowerCase() === account.email.toLowerCase()))

  const updated: UserAccount = {
    ...account,
    lastActiveAt: new Date().toISOString(),
  }

  let next: UserAccount[]
  if (existingIdx >= 0) {
    next = [...current]
    next[existingIdx] = { ...current[existingIdx], ...updated }
  } else {
    next = [updated, ...current]
  }

  saveStoredAccounts(next)
  return updated
}

export function deleteStoredAccount(id: string): void {
  const current = getStoredAccounts()
  saveStoredAccounts(current.filter((a) => a.id !== id))
}

export function getActiveSession(): UserSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UserSession) : null
  } catch {
    return null
  }
}

export function saveActiveSession(session: UserSession | null): void {
  if (typeof window === 'undefined') return
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    // Ignore storage issues
  }
}

export function isDeveloperAccount(email?: string | null): boolean {
  if (typeof window === 'undefined') return false
  if (email && /adisagar|admin|dev/i.test(email)) return true
  try {
    const sessionRaw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (sessionRaw) {
      const sess = JSON.parse(sessionRaw) as UserSession
      if (sess?.email && /adisagar|admin|dev/i.test(sess.email)) return true
    }
    if (window.localStorage.getItem('spendwise.developer_mode') === 'true') return true
  } catch {
    // ignore
  }
  if (import.meta.env.DEV) return true
  return false
}

export function setDeveloperMode(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) {
      window.localStorage.setItem('spendwise.developer_mode', 'true')
    } else {
      window.localStorage.removeItem('spendwise.developer_mode')
    }
  } catch {
    // ignore
  }
}
