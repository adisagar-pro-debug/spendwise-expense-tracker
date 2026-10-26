import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string
  note: string
  icon: ReactNode
  tone?: 'default' | 'accent' | 'warm'
  trend?: string
}

export default function StatCard({ label, value, note, icon, tone = 'default', trend }: StatCardProps) {
  return (
    <article className={`stat-card stat-card-${tone}`}>
      <div className="stat-topline">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-footline">
        {trend && <span className="stat-trend">{trend}</span>}
        <span>{note}</span>
      </div>
    </article>
  )
}
