import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, ChevronRight, Cloud, Download, ExternalLink,
  FileUp, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react'
import {
  clearStoredAuth, disconnectGoogleDrive, exportSnapshotToFile,
  getStoredClientId, getStoredToken, getStoredUser, getLastSyncedAt,
  importSnapshotFromFile, pullSnapshotFromDrive, pushSnapshotToDrive,
  requestGoogleLogin, setStoredClientId,
} from '../lib/driveSync'
import { clearLocalSnapshot, saveLocalSnapshot } from '../lib/storage'
import { relativeDate } from '../lib/format'
import { isDeveloperAccount } from '../lib/accounts'
import type { GoogleUserInfo, SpendwiseSnapshot, UserSession } from '../types'

interface GoogleDriveSyncPanelProps {
  currentSnapshot: SpendwiseSnapshot
  onRestoreSnapshot: (snapshot: SpendwiseSnapshot) => void
  onResetData: () => void
  onToast: (msg: string) => void
  isExternalSyncing?: boolean
  onConnectionChange?: (connected: boolean) => void
  currentSession?: UserSession | null
}

export default function GoogleDriveSyncPanel({
  currentSnapshot,
  onRestoreSnapshot,
  onResetData,
  onToast,
  isExternalSyncing = false,
  onConnectionChange,
  currentSession,
}: GoogleDriveSyncPanelProps) {
  const [clientId, setClientId] = useState(() => getStoredClientId())
  const [clientIdDraft, setClientIdDraft] = useState(() => getStoredClientId())
  const [showConfig, setShowConfig] = useState(() => !getStoredClientId())
  const [isConnected, setIsConnected] = useState(() => Boolean(getStoredToken()))
  const [user, setUser] = useState<GoogleUserInfo | null>(() => getStoredUser())
  const [lastSynced, setLastSynced] = useState<string | null>(() => getLastSyncedAt())
  const [isLocalSyncing, setIsLocalSyncing] = useState(false)
  const isSyncing = isLocalSyncing || isExternalSyncing
  const [backupCollapsed, setBackupCollapsed] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDev = isDeveloperAccount(currentSession?.email || user?.email)

  useEffect(() => {
    const token = getStoredToken()
    setIsConnected(Boolean(token))
    setUser(getStoredUser())
    setLastSynced(getLastSyncedAt())
  }, [])

  useEffect(() => {
    if (!isExternalSyncing) {
      setLastSynced(getLastSyncedAt())
    }
  }, [isExternalSyncing])

  const handleSaveClientId = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setStoredClientId(clientIdDraft)
    setClientId(clientIdDraft.trim())
    onToast(clientIdDraft.trim() ? 'Google Client ID saved' : 'Google Client ID removed')
    if (clientIdDraft.trim()) {
      setShowConfig(false)
    }
  }

  const handleConnect = async () => {
    if (!clientId.trim()) {
      setShowConfig(true)
      onToast('Please enter your Google Cloud OAuth Client ID first')
      return
    }

    setIsLocalSyncing(true)
    try {
      const res = await requestGoogleLogin(clientId)
      setIsConnected(true)
      setUser(res.user)
      onConnectionChange?.(true)
      onToast(`Connected to Google Drive as ${res.user.email}`)

      // Immediate first sync: check if Drive has data
      try {
        const driveData = await pullSnapshotFromDrive()
        if (driveData && driveData.transactions.length > 0) {
          const driveTime = new Date(driveData.updatedAt || 0).getTime()
          const localTime = new Date(currentSnapshot.updatedAt || 0).getTime()
          if (driveTime > localTime && currentSnapshot.transactions.length === 0) {
            onRestoreSnapshot(driveData)
            await saveLocalSnapshot(driveData)
            onToast('Restored your latest data from Google Drive!')
          } else {
            // Push current snapshot to Drive
            await pushSnapshotToDrive(currentSnapshot)
            onToast('Uploaded current data to Google Drive')
          }
        } else {
          // Drive is empty, push local data
          await pushSnapshotToDrive(currentSnapshot)
          onToast('Synced workspace to Google Drive')
        }
        setLastSynced(new Date().toISOString())
      } catch (syncErr) {
        console.warn('Initial sync warning:', syncErr)
      }
    } catch (err) {
      console.error('Google connect error:', err)
      onToast(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsLocalSyncing(false)
    }
  }

  const handleDisconnect = () => {
    if (window.confirm('Disconnect from Google Drive? Your local data will remain safe on your device.')) {
      disconnectGoogleDrive()
      setIsConnected(false)
      setUser(null)
      onConnectionChange?.(false)
      onToast('Disconnected from Google Drive')
    }
  }

  const handleSyncNow = async () => {
    if (!isConnected) return
    setIsLocalSyncing(true)
    try {
      // 1. Pull latest from Drive
      const driveData = await pullSnapshotFromDrive()
      if (driveData) {
        const driveTime = new Date(driveData.updatedAt || 0).getTime()
        const localTime = new Date(currentSnapshot.updatedAt || 0).getTime()

        // If Drive is newer than local, restore it
        if (driveTime > localTime) {
          onRestoreSnapshot(driveData)
          await saveLocalSnapshot(driveData)
          setLastSynced(new Date().toISOString())
          onToast('Updated from Google Drive (cloud was newer)')
          setIsLocalSyncing(false)
          return
        }
      }

      // 2. Otherwise push local to Drive
      await pushSnapshotToDrive(currentSnapshot)
      setLastSynced(new Date().toISOString())
      onToast('Synced with Google Drive')
    } catch (err) {
      console.error('Sync error:', err)
      onToast(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsLocalSyncing(false)
    }
  }

  const handleExportBackup = () => {
    exportSnapshotToFile(currentSnapshot)
    onToast('Backup file downloaded to your device')
  }

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const imported = await importSnapshotFromFile(file)
      if (window.confirm(`Restore backup from "${file.name}" with ${imported.transactions.length} transactions? This will update your workspace.`)) {
        onRestoreSnapshot(imported)
        await saveLocalSnapshot(imported)
        onToast(`Restored ${imported.transactions.length} transactions from backup`)
      }
    } catch (err) {
      onToast(`Import error: ${err instanceof Error ? err.message : 'Invalid backup'}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <article className="panel gdrive-sync-panel">
      <div className="correction-header">
        <div>
          <h2>Storage & Cloud Sync</h2>
        </div>
        <div className="gdrive-status-badge-wrap">
          {isConnected ? (
            <span className="gdrive-badge connected">
              <span className="gdrive-dot connected-dot" /> Connected to Drive
            </span>
          ) : (
            <span className="gdrive-badge disconnected">
              <span className="gdrive-dot disconnected-dot" /> Offline (IndexedDB)
            </span>
          )}
        </div>
      </div>

      <div className="gdrive-body-grid">
        {/* Left card: Google Drive Sync */}
        <div className="gdrive-card">
          <div className="gdrive-card-header">
            <div className="gdrive-icon-wrap">
              <Cloud size={20} className={isConnected ? 'cloud-active' : ''} />
            </div>
            <div>
              <h3>Google Drive Sync</h3>
            </div>
          </div>

          {isConnected ? (
            <div className="gdrive-connected-view">
              <div className="gdrive-user-row">
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="gdrive-avatar" />
                ) : (
                  <div className="gdrive-avatar-placeholder">{user?.name ? user.name[0].toUpperCase() : 'G'}</div>
                )}
                <div className="gdrive-user-meta">
                  <strong>{user?.name || 'Google User'}</strong>
                  <span>{user?.email}</span>
                </div>
              </div>

              <div className="gdrive-sync-meta-row">
                <span className="sync-timestamp">
                  {lastSynced ? `Last synced: ${relativeDate(lastSynced)}` : 'Not synced yet'}
                </span>
                <span className="sync-scope-pill" title="Changes auto-sync to your private Google Drive appDataFolder in the background">
                  <ShieldCheck size={13} /> Auto-sync active
                </span>
              </div>

              <div className="gdrive-action-buttons">
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                >
                  {isSyncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                  <span>{isSyncing ? 'Syncing...' : 'Sync now'}</span>
                </button>
                <button
                  type="button"
                  className="button button-danger-quiet button-small"
                  onClick={handleDisconnect}
                  disabled={isSyncing}
                >
                  Disconnect
                </button>
                {isDev && (
                  <button
                    type="button"
                    className="button button-quiet button-small"
                    onClick={() => setShowConfig((prev) => !prev)}
                    title="Developer: Configure OAuth Client ID"
                  >
                    <KeyRound size={13} />
                    <span>{showConfig ? 'Hide Client ID' : 'Client ID Settings'}</span>
                  </button>
                )}
              </div>

              {isDev && showConfig && (
                <div className="gdrive-config-box" style={{ marginTop: '14px' }}>
                  <form onSubmit={handleSaveClientId} className="client-id-form">
                    <label htmlFor="google-client-id-input-connected">
                      <strong>Google Cloud OAuth Client ID (Developer)</strong>
                      <span>Active Client ID:</span>
                    </label>
                    <div className="client-id-input-wrap">
                      <input
                        id="google-client-id-input-connected"
                        type="text"
                        className="input"
                        placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                        value={clientIdDraft}
                        onChange={(e) => setClientIdDraft(e.target.value)}
                      />
                      <button type="submit" className="button button-secondary button-small">
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <div className="gdrive-disconnected-view">
              <p className="gdrive-explainer">
                Sign in with Google to automatically back up your bank statements and sync changes to your phone in real time.
              </p>

              <div className="gdrive-connect-row">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleConnect}
                  disabled={isSyncing}
                >
                  {isSyncing ? <Loader2 size={16} className="spin" /> : <Cloud size={16} />}
                  <span>Connect Google Drive</span>
                </button>

                {isDev && (
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => setShowConfig((prev) => !prev)}
                    title="Developer Account: Configure OAuth Client ID"
                  >
                    <KeyRound size={14} />
                    <span>{showConfig ? 'Hide Client ID' : 'Client ID Settings'}</span>
                  </button>
                )}
              </div>

              {isDev && showConfig && (
                <div className="gdrive-config-box">
                  <form onSubmit={handleSaveClientId} className="client-id-form">
                    <label htmlFor="google-client-id-input">
                      <strong>Google Cloud OAuth Client ID (Developer)</strong>
                      <span>Used to authenticate with Google Identity Services:</span>
                    </label>
                    <div className="client-id-input-wrap">
                      <input
                        id="google-client-id-input"
                        type="text"
                        className="input"
                        placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                        value={clientIdDraft}
                        onChange={(e) => setClientIdDraft(e.target.value)}
                      />
                      <button type="submit" className="button button-secondary button-small">
                        Save
                      </button>
                    </div>
                  </form>

                  <div className="client-id-guide">
                    <strong>Quick setup in 2 minutes:</strong>
                    <ol>
                      <li>Visit the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console <ExternalLink size={12} /></a> and create a free project.</li>
                      <li>Go to <em>APIs & Services → Credentials</em> and click <em>Create Credentials → OAuth client ID</em>.</li>
                      <li>Select <strong>Web application</strong> and add <code>http://localhost:3000</code> to <strong>Authorized JavaScript origins</strong>.</li>
                      <li>Enable the <strong>Google Drive API</strong> in <em>Enabled APIs & Services</em>.</li>
                      <li>Paste the generated Client ID above and click Connect!</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right card: File Backup & Portability */}
        <div className={`gdrive-card ${backupCollapsed ? 'gdrive-card-collapsed' : ''}`}>
          <button
            type="button"
            className="gdrive-card-header gdrive-card-toggle"
            onClick={() => setBackupCollapsed((prev) => !prev)}
            aria-expanded={!backupCollapsed}
          >
            <div className="gdrive-icon-wrap">
              <Download size={18} />
            </div>
            <div className="gdrive-header-text">
              <h3>Offline Backup & Portability</h3>
              <p>Manual JSON backup files, data restore, and local reset</p>
            </div>
            <div className="gdrive-toggle-chevron-wrap">
              <ChevronRight
                size={16}
                className={`gdrive-toggle-chevron ${!backupCollapsed ? 'is-open' : ''}`}
              />
            </div>
          </button>

          {!backupCollapsed && (
            <div className="backup-card-body">
              <div className="backup-stats-row">
                <div className="backup-stat">
                  <strong>{currentSnapshot.statements.length}</strong>
                  <span>Statements</span>
                </div>
                <div className="backup-stat">
                  <strong>{currentSnapshot.transactions.length}</strong>
                  <span>Transactions</span>
                </div>
                <div className="backup-stat">
                  <strong>{currentSnapshot.customCategories.length}</strong>
                  <span>Custom categories</span>
                </div>
                <div className="backup-stat">
                  <strong>{Object.keys(currentSnapshot.merchantCorrections).length}</strong>
                  <span>Learned rules</span>
                </div>
              </div>

              <div className="backup-actions-grid">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleExportBackup}
                  title="Download JSON file containing your complete Spendwise history"
                >
                  <Download size={15} />
                  <span>Export Backup (.json)</span>
                </button>

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  title="Restore from a previously exported JSON backup"
                >
                  <FileUp size={15} />
                  <span>Restore Backup (.json)</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={handleImportFileChange}
                />
              </div>

              <div className="backup-reset-row">
                <button
                  type="button"
                  className="button button-danger-quiet button-small"
                  onClick={() => {
                    if (window.confirm('Clear all local data and reset Spendwise to demo state? This cannot be undone.')) {
                      clearLocalSnapshot()
                      clearStoredAuth()
                      onResetData()
                      onToast('Workspace reset to clean state')
                    }
                  }}
                >
                  <Trash2 size={13} /> Reset local workspace
                </button>
                <span className="backup-offline-note">
                  <CheckCircle2 size={13} /> Saved in local IndexedDB
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
