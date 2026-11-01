import { FileStack, LayoutDashboard, ListFilter, Plus, Settings2 } from 'lucide-react'
import type { PageKey } from './Sidebar'

interface MobileBottomNavProps {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  unknownCount: number
  statementCount: number
  onOpenUpload: () => void
}

export default function MobileBottomNav({
  activePage,
  onNavigate,
  unknownCount,
  onOpenUpload,
}: MobileBottomNavProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <button
        type="button"
        className={`mobile-tab-btn ${activePage === 'overview' ? 'mobile-tab-active' : ''}`}
        onClick={() => onNavigate('overview')}
      >
        <LayoutDashboard size={20} strokeWidth={1.9} />
        <span>Home</span>
      </button>

      <button
        type="button"
        className={`mobile-tab-btn ${activePage === 'transactions' ? 'mobile-tab-active' : ''}`}
        onClick={() => onNavigate('transactions')}
      >
        <div className="tab-icon-wrap">
          <ListFilter size={20} strokeWidth={1.9} />
          {unknownCount > 0 && <span className="mobile-badge">{unknownCount > 99 ? '99+' : unknownCount}</span>}
        </div>
        <span>Transactions</span>
      </button>

      <button
        type="button"
        className="mobile-fab-btn"
        onClick={onOpenUpload}
        aria-label="Upload statements"
        title="Upload statements"
      >
        <Plus size={22} strokeWidth={2.4} />
      </button>

      <button
        type="button"
        className={`mobile-tab-btn ${activePage === 'statements' ? 'mobile-tab-active' : ''}`}
        onClick={() => onNavigate('statements')}
      >
        <FileStack size={20} strokeWidth={1.9} />
        <span>Statements</span>
      </button>

      <button
        type="button"
        className={`mobile-tab-btn ${activePage === 'settings' ? 'mobile-tab-active' : ''}`}
        onClick={() => onNavigate('settings')}
      >
        <Settings2 size={20} strokeWidth={1.9} />
        <span>Settings</span>
      </button>
    </nav>
  )
}
