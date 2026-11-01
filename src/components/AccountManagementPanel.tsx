import { useState } from 'react'
import {
  ArrowRightLeft, Check, Cloud, CloudOff, Database, Edit3, LogOut,
  Mail, User, UserPlus,
} from 'lucide-react'
import { getStoredAccounts, upsertAccount } from '../lib/accounts'
import type { UserAccount, UserSession } from '../types'

interface AccountManagementPanelProps {
  currentSession: UserSession | null
  onUpdateSession: (updated: UserSession) => void
  onOpenAuthModal: (mode: 'login' | 'signup') => void
  onLogout: () => void
  onToast: (msg: string) => void
  driveConnected?: boolean
  onConnectDrive?: () => void
}

export default function AccountManagementPanel({
  currentSession,
  onUpdateSession,
  onOpenAuthModal,
  onLogout,
  onToast,
  driveConnected = false,
  onConnectDrive,
}: AccountManagementPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(currentSession?.name || '')
  const [emailDraft, setEmailDraft] = useState(currentSession?.email || '')
  const [savedAccounts] = useState<UserAccount[]>(() => getStoredAccounts())

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    const name = nameDraft.trim() || 'Alex'
    const email = emailDraft.trim() || undefined

    if (currentSession) {
      const updated: UserSession = {
        ...currentSession,
        name,
        email,
      }
      onUpdateSession(updated)

      if (currentSession.accountId) {
        upsertAccount({
          id: currentSession.accountId,
          name,
          email,
          picture: currentSession.picture,
          mode: currentSession.mode,
          createdAt: new Date().toISOString(),
        })
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('spendwise.user_name', name)
      }
    }

    setIsEditing(false)
    onToast('Profile updated')
  }

  const initial = currentSession?.name ? currentSession.name.charAt(0).toUpperCase() : 'U'
  const isGoogle = currentSession?.mode === 'google'

  return (
    <article className="panel account-management-panel">
      <div className="correction-header">
        <div>
          <h2>Account</h2>
        </div>
        <div className="account-top-actions">
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => onOpenAuthModal('login')}
          >
            <ArrowRightLeft size={13} /> Switch account
          </button>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => onOpenAuthModal('signup')}
          >
            <UserPlus size={13} /> Add account
          </button>
        </div>
      </div>

      <div className="account-profile-card">
        <div className="account-avatar-col">
          {currentSession?.picture ? (
            <img src={currentSession.picture} alt="" className="account-avatar-large-img" />
          ) : (
            <div className="account-avatar-large">{initial}</div>
          )}
        </div>

        <div className="account-info-col">
          {isEditing ? (
            <form onSubmit={handleSaveProfile} className="profile-edit-form">
              <div className="form-row">
                <label htmlFor="account-edit-name">Display Name</label>
                <div className="input-with-icon">
                  <User size={14} />
                  <input
                    id="account-edit-name"
                    type="text"
                    className="input"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="account-edit-email">Email Address</label>
                <div className="input-with-icon">
                  <Mail size={14} />
                  <input
                    id="account-edit-email"
                    type="email"
                    className="input"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="e.g. alex@example.com"
                  />
                </div>
              </div>

              <div className="profile-edit-buttons">
                <button type="submit" className="button button-primary button-small">
                  <Check size={13} /> Save changes
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="account-name-badge-row">
                <h3 className="account-name-title">{currentSession?.name || 'Guest User'}</h3>
                <span className={`account-mode-pill ${isGoogle ? (driveConnected ? 'mode-google' : 'mode-warning') : 'mode-local'}`}>
                  {isGoogle ? (driveConnected ? <Cloud size={12} /> : <CloudOff size={12} />) : <Database size={12} />}
                  <span>
                    {isGoogle
                      ? driveConnected
                        ? 'Google Drive Synced'
                        : 'Drive Disconnected'
                      : currentSession?.mode === 'demo'
                      ? 'Sample Demo'
                      : 'Local Offline Workspace'}
                  </span>
                </span>
              </div>

              <div className="account-details-list">
                <div className="account-detail-item">
                  <span className="detail-label">Email:</span>
                  <span className="detail-value">{currentSession?.email || 'None configured (Local only)'}</span>
                </div>
                <div className="account-detail-item">
                  <span className="detail-label">Storage:</span>
                  <span className="detail-value account-storage-value">
                    <span>
                      {isGoogle
                        ? driveConnected
                          ? 'Google Drive + IndexedDB'
                          : 'On-Device IndexedDB (Drive offline)'
                        : 'On-Device IndexedDB'}
                    </span>
                    {isGoogle && !driveConnected && onConnectDrive && (
                      <button
                        type="button"
                        className="button button-primary button-tiny"
                        onClick={onConnectDrive}
                        title="Connect Google Drive to start syncing"
                      >
                        <Cloud size={12} /> Connect Drive
                      </button>
                    )}
                  </span>
                </div>
              </div>

              <div className="account-card-bottom-actions">
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => {
                    setNameDraft(currentSession?.name || '')
                    setEmailDraft(currentSession?.email || '')
                    setIsEditing(true)
                  }}
                >
                  <Edit3 size={13} /> Edit profile
                </button>

                <button
                  type="button"
                  className="button button-danger-quiet button-small"
                  onClick={onLogout}
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {savedAccounts.length > 1 && (
        <div className="saved-accounts-management-strip">
          <span className="saved-strip-title">Other accounts on this device:</span>
          <div className="saved-strip-list">
            {savedAccounts
              .filter((acc) => acc.id !== currentSession?.accountId)
              .map((acc) => (
                <div key={acc.id} className="saved-strip-chip">
                  <span>{acc.name}</span>
                  <small>({acc.mode === 'google' ? 'Google' : 'Local'})</small>
                  <button
                    type="button"
                    className="button-link-inline"
                    onClick={() => {
                      onUpdateSession({
                        mode: acc.mode,
                        name: acc.name,
                        email: acc.email,
                        picture: acc.picture,
                        accountId: acc.id,
                      })
                      onToast(`Switched account to ${acc.name}`)
                    }}
                  >
                    Switch
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </article>
  )
}
