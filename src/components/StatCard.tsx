import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  note: string
  icon: ReactNode
  tone?: 'default' | 'accent' | 'warm'
  trend?: string
  onClick?: () => void
  actionHint?: string
}

export default function StatCard({
  label,
  value,
  note,
  icon,
  tone = 'default',
  trend,
  onClick,
  actionHint = 'View transactions',
}: StatCardProps) {
  const isClickable = Boolean(onClick)

  return (
    <article
      className={`stat-card stat-card-${tone} ${isClickable ? 'stat-card-clickable' : ''}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      } : undefined}
      aria-label={isClickable ? `${label}: ${value}. Click to ${actionHint.toLowerCase()}` : undefined}
    >
      <div className="stat-topline">
        <span className="stat-label">{label}</span>
        <div className="stat-icon-group">
          {isClickable && <ArrowUpRight size={14} className="stat-card-arrow" />}
          <span className="stat-icon">{icon}</span>
        </div>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-footline">
        {trend && <span className="stat-trend">{trend}</span>}
        <span>{note}</span>
      </div>
    </article>
  )
}
