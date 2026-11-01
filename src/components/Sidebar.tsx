import { Download, FileStack, LayoutDashboard, ListFilter, LockKeyhole, LogOut, Settings2 } from 'lucide-react'
import type { UserSession } from './WelcomeLogin'

export type PageKey = 'overview' | 'transactions' | 'statements' | 'settings'

interface SidebarProps {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  unknownCount: number
  statementCount: number
  userSession?: UserSession | null
  onLogout?: () => void
  canInstallPwa?: boolean
  onInstallPwa?: () => void
}

const navigation: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'transactions', label: 'Transactions', icon: ListFilter },
  { key: 'statements', label: 'Statements', icon: FileStack },
  { key: 'settings', label: 'Preferences', icon: Settings2 },
]

export default function Sidebar({
  activePage,
  onNavigate,
  unknownCount,
  statementCount,
  userSession,
  onLogout,
  canInstallPwa,
  onInstallPwa,
}: SidebarProps) {
  const displayName = userSession?.name || 'Alex'
  const displayEmail = userSession?.email || (userSession?.mode === 'google' ? 'Google Account' : 'Personal workspace')
  const initial = displayName.charAt(0).toUpperCase() || 'A'

  return (
    <aside className="sidebar">
      <button className="brand-lockup" onClick={() => onNavigate('overview')} aria-label="Spendwise overview">
        <img className="brand-symbol" src="/logo.svg" alt="" />
        <span className="brand-name">spendwise<span className="brand-period">.</span></span>
      </button>

      <div className="workspace-switcher">
        {userSession?.picture ? (
          <img src={userSession.picture} alt="" className="workspace-avatar-img" />
        ) : (
          <div className="workspace-avatar">{initial}</div>
        )}
        <div className="workspace-text">
          <span>{userSession?.mode === 'google' ? 'Google Drive space' : 'Personal space'}</span>
          <strong>{displayName}’s finances</strong>
        </div>
        <span className="workspace-dot" />
      </div>

      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Primary navigation">
        {navigation.map(({ key, label, icon: Icon }) => {
          const count = key === 'transactions' && unknownCount > 0 ? unknownCount : key === 'statements' && statementCount > 0 ? statementCount : 0
          return (
            <button key={key} className={`nav-link ${activePage === key ? 'nav-link-active' : ''}`} onClick={() => onNavigate(key)}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {count > 0 && <span className={`nav-count ${key === 'transactions' && unknownCount > 0 ? 'nav-count-attention' : ''}`}>{count > 99 ? '99+' : count}</span>}
            </button>
          )
        })}
      </nav>

      {canInstallPwa && onInstallPwa && (
        <button
          type="button"
          className="sidebar-pwa-install-btn"
          onClick={onInstallPwa}
          title="Install Spendwise as a desktop or mobile application"
        >
          <Download size={15} />
          <span>Install Spendwise App</span>
        </button>
      )}

      <div className="sidebar-bottom">
        <div className="sidebar-storage-badge" title={userSession?.mode === 'google' ? 'Google Drive sync active' : 'Stored locally in browser IndexedDB'}>
          <LockKeyhole size={12} />
          <span>{userSession?.mode === 'google' ? 'Google Drive' : 'Local Storage'}</span>
        </div>
        <div className="sidebar-profile">
          {userSession?.picture ? (
            <img src={userSession.picture} alt="" className="profile-avatar-img" />
          ) : (
            <div className="profile-avatar">{initial}</div>
          )}
          <div className="profile-copy">
            <strong>{displayName}</strong>
            <span title={displayEmail}>{displayEmail}</span>
          </div>
          {onLogout && (
            <button
              type="button"
              className="profile-logout-btn"
              onClick={onLogout}
              title="Sign out / switch workspace profile"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
