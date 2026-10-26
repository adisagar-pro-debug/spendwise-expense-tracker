import { BarChart3, CircleHelp, FileStack, LayoutDashboard, ListFilter, LockKeyhole, Settings2 } from 'lucide-react'

export type PageKey = 'overview' | 'transactions' | 'statements' | 'settings'

interface SidebarProps {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  unknownCount: number
  statementCount: number
}

const navigation: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'transactions', label: 'Transactions', icon: ListFilter },
  { key: 'statements', label: 'Statements', icon: FileStack },
  { key: 'settings', label: 'Preferences', icon: Settings2 },
]

export default function Sidebar({ activePage, onNavigate, unknownCount, statementCount }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button className="brand-lockup" onClick={() => onNavigate('overview')} aria-label="Spendwise overview">
        <img className="brand-symbol" src="/logo.svg" alt="" />
        <span className="brand-name">spendwise<span className="brand-period">.</span></span>
      </button>

      <div className="workspace-switcher">
        <div className="workspace-avatar">A</div>
        <div className="workspace-text"><span>Personal space</span><strong>Alex's finances</strong></div>
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

      <div className="sidebar-bottom">
        <div className="side-help"><CircleHelp size={16} /><span>Help center</span></div>
        <div className="privacy-card">
          <span className="privacy-icon"><LockKeyhole size={15} /></span>
          <div><strong>Private, by design</strong><span>Your statements stay on this device.</span></div>
        </div>
        <div className="sidebar-profile">
          <div className="profile-avatar">A</div>
          <div className="profile-copy"><strong>Alex Morgan</strong><span>Personal account</span></div>
          <BarChart3 size={16} className="profile-mark" />
        </div>
      </div>
    </aside>
  )
}
