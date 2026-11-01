import type { GoogleUserInfo, SpendwiseSnapshot } from '../types'

const CLIENT_ID_STORAGE_KEY = 'spendwise.google_client_id'
const TOKEN_STORAGE_KEY = 'spendwise.gdrive_token'
const TOKEN_EXPIRES_KEY = 'spendwise.gdrive_token_expires'
const USER_STORAGE_KEY = 'spendwise.gdrive_user'
const LAST_SYNCED_KEY = 'spendwise.gdrive_last_synced'
const FILE_ID_KEY = 'spendwise.gdrive_file_id'
const DRIVE_FILENAME = 'spendwise-data.json'

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void
          }
          revoke: (token: string, done: () => void) => void
        }
      }
    }
  }
}

export function getStoredClientId(): string {
  if (typeof window === 'undefined') return ''
  return (
    window.localStorage.getItem(CLIENT_ID_STORAGE_KEY) ||
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    ''
  )
}

export function setStoredClientId(id: string): void {
  if (typeof window === 'undefined') return
  if (!id.trim()) {
    window.localStorage.removeItem(CLIENT_ID_STORAGE_KEY)
  } else {
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, id.trim())
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || window.localStorage.getItem(TOKEN_STORAGE_KEY)
  const expiresAt = Number(window.localStorage.getItem(TOKEN_EXPIRES_KEY) || 0)
  if (!token) return null
  if (expiresAt && Date.now() > expiresAt) {
    clearStoredAuth()
    return null
  }
  return token
}

export function getStoredUser(): GoogleUserInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getLastSyncedAt(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(LAST_SYNCED_KEY)
}

export function setLastSyncedAt(timestamp: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LAST_SYNCED_KEY, timestamp)
}

export function clearStoredAuth(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(TOKEN_EXPIRES_KEY)
  window.localStorage.removeItem(USER_STORAGE_KEY)
  window.localStorage.removeItem(FILE_ID_KEY)
}

export function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Window not available'))
    if (window.google?.accounts?.oauth2) return resolve()

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity client script')))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity client script'))
    document.head.appendChild(script)
  })
}

export async function fetchUserInfo(token: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch user info: ${res.statusText}`)
  }
  const data = await res.json()
  return {
    email: data.email || 'Google User',
    name: data.name || data.email || 'User',
    picture: data.picture,
  }
}

export function requestGoogleLogin(clientId?: string): Promise<{ token: string; user: GoogleUserInfo }> {
  return new Promise((resolve, reject) => {
    const effectiveClientId = clientId || getStoredClientId()
    if (!effectiveClientId) {
      return reject(new Error('Google Client ID is missing. Please provide your Google Cloud OAuth Client ID.'))
    }

    loadGsiScript().then(() => {
      if (!window.google?.accounts?.oauth2) {
        return reject(new Error('Google Identity Services library failed to initialize.'))
      }

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: effectiveClientId,
        scope: 'https://www.googleapis.com/auth/drive.appdata email profile',
        callback: async (response) => {
          if (response.error || !response.access_token) {
            return reject(new Error(response.error || 'Access denied by user.'))
          }
          const token = response.access_token
          const expiresIn = response.expires_in || 3600
          const expiresAt = Date.now() + (expiresIn - 60) * 1000

          window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
          window.localStorage.setItem(TOKEN_EXPIRES_KEY, String(expiresAt))

          try {
            const user = await fetchUserInfo(token)
            window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
            resolve({ token, user })
          } catch {
            const fallbackUser: GoogleUserInfo = { email: 'Connected Account', name: 'Google User' }
            window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(fallbackUser))
            resolve({ token, user: fallbackUser })
          }
        },
      })

      client.requestAccessToken({ prompt: 'consent' })
    }).catch(reject)
  })
}

export function disconnectGoogleDrive(): void {
  const token = getStoredToken()
  if (token && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {})
    } catch {
      // Ignore revocation failure
    }
  }
  clearStoredAuth()
}

export async function findDriveDataFile(token: string): Promise<{ id: string; modifiedTime: string } | null> {
  const cachedId = typeof window !== 'undefined' ? window.localStorage.getItem(FILE_ID_KEY) : null
  if (cachedId) {
    // Quick test if cachedId is still valid
    const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cachedId}?fields=id,name,modifiedTime,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (checkRes.ok) {
      const data = await checkRes.json()
      if (!data.trashed && data.name === DRIVE_FILENAME) {
        return { id: data.id, modifiedTime: data.modifiedTime }
      }
    }
  }

  const query = encodeURIComponent(`name = '${DRIVE_FILENAME}' and trashed = false`)
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Failed to query Google Drive: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  const file = data.files?.[0]
  if (file?.id) {
    window.localStorage.setItem(FILE_ID_KEY, file.id)
    return { id: file.id, modifiedTime: file.modifiedTime }
  }
  return null
}

export async function pullSnapshotFromDrive(): Promise<SpendwiseSnapshot | null> {
  const token = getStoredToken()
  if (!token) throw new Error('Not connected to Google Drive.')

  const file = await findDriveDataFile(token)
  if (!file) return null

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Failed to download data from Google Drive: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  if (!json || typeof json !== 'object' || !Array.isArray(json.transactions)) {
    throw new Error('Downloaded file has an invalid or corrupted Spendwise format.')
  }
  setLastSyncedAt(new Date().toISOString())
  return json as SpendwiseSnapshot
}

export async function pushSnapshotToDrive(snapshot: SpendwiseSnapshot): Promise<void> {
  const token = getStoredToken()
  if (!token) throw new Error('Not connected to Google Drive.')

  const existingFile = await findDriveDataFile(token)
  const bodyContent = JSON.stringify(snapshot, null, 2)

  if (existingFile) {
    // Update existing file content via PATCH media
    const url = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: bodyContent,
    })
    if (!res.ok) {
      throw new Error(`Failed to update file on Google Drive: ${res.status} ${res.statusText}`)
    }
  } else {
    // Create new file via multipart upload inside appDataFolder
    const metadata = {
      name: DRIVE_FILENAME,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    }
    const boundary = '-------spendwise_boundary_314159'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      bodyContent +
      closeDelimiter

    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    })
    if (!res.ok) {
      throw new Error(`Failed to create file on Google Drive: ${res.status} ${res.statusText}`)
    }
    const created = await res.json()
    if (created?.id) {
      window.localStorage.setItem(FILE_ID_KEY, created.id)
    }
  }

  setLastSyncedAt(new Date().toISOString())
}

export function exportSnapshotToFile(snapshot: SpendwiseSnapshot): void {
  const jsonStr = JSON.stringify(snapshot, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const dateStr = new Date().toISOString().slice(0, 10)
  anchor.href = url
  anchor.download = `spendwise-backup-${dateStr}.json`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function importSnapshotFromFile(file: File): Promise<SpendwiseSnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result || '')
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.transactions)) {
          return reject(new Error('Invalid Spendwise backup file. Missing transactions array.'))
        }
        resolve(parsed as SpendwiseSnapshot)
      } catch (err) {
        reject(new Error(`Failed to read backup JSON: ${err instanceof Error ? err.message : 'Invalid JSON'}`))
      }
    }
    reader.onerror = () => reject(new Error('Error reading backup file from disk.'))
    reader.readAsText(file)
  })
}
