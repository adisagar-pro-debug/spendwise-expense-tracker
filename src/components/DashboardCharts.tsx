import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ArrowRight, BarChart3 } from 'lucide-react'
import { formatMoney } from '../lib/format'
import type { Category } from '../types'

interface TrendPoint {
  month: string
  income: number
  spending: number
}

interface CategoryPoint {
  name: Category
  value: number
  color: string
}

interface DashboardChartsProps {
  trendData: TrendPoint[]
  categoryData: CategoryPoint[]
  spend: number
  currencyCode: string
  period: string
  unknownCount: number
  analyzedCount: number
  onCategoryClick: (category: Category) => void
  onSeeTransactions: () => void
  onUpload: () => void
}

function ChartTooltip({ active, payload, label, currencyCode }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string }>; label?: string; currencyCode: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry, index) => (
        <div className="chart-tooltip-line" key={entry.name ?? index}>
          <span className="tooltip-color" style={{ backgroundColor: entry.color }} />
          <span>{entry.name}</span>
          <b>{formatMoney(Number(entry.value ?? 0), currencyCode)}</b>
        </div>
      ))}
    </div>
  )
}

function formatTooltipAmount(value: number | undefined, currency: string): string {
  return formatMoney(value ?? 0, currency, true)
}

export default function DashboardCharts({ trendData, categoryData, spend, currencyCode, period, unknownCount, analyzedCount, onCategoryClick, onSeeTransactions, onUpload }: DashboardChartsProps) {
  return (
    <section className="analytics-grid">
      <article className="panel spending-panel">
        <div className="panel-heading">
          <div><div className="section-kicker">CASH FLOW</div><h2>Income & spending</h2><p>Your last six months at a glance</p></div>
          <div className="chart-legend"><span><i className="legend-dot legend-income" />Income</span><span><i className="legend-dot legend-spending" />Spending</span></div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 16, right: 12, left: -9, bottom: 0 }}>
              <defs>
                <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e6a985" stopOpacity={0.28} /><stop offset="95%" stopColor="#e6a985" stopOpacity={0.015} /></linearGradient>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#63b894" stopOpacity={0.22} /><stop offset="95%" stopColor="#63b894" stopOpacity={0.015} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9ede9" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#98a19d', fontSize: 11, fontFamily: 'DM Sans' }} dy={10} />
              <YAxis tickFormatter={(value) => formatTooltipAmount(Number(value), currencyCode)} axisLine={false} tickLine={false} tick={{ fill: '#98a19d', fontSize: 10, fontFamily: 'DM Mono' }} width={51} />
              <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
              <Area type="monotone" dataKey="income" name="Income" stroke="#238c6a" strokeWidth={2.3} fill="url(#incomeGradient)" activeDot={{ r: 4, strokeWidth: 2 }} />
              <Area type="monotone" dataKey="spending" name="Spending" stroke="#db8d68" strokeWidth={2.3} fill="url(#spendGradient)" activeDot={{ r: 4, strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-footer"><span><i className="chart-footer-mark" /> No duplicates included</span><span>{analyzedCount} analyzed transactions</span></div>
      </article>

      <article className="panel category-panel">
        <div className="panel-heading">
          <div><div className="section-kicker">SPENDING BREAKDOWN</div><h2>Where it goes</h2><p>Categories for {period.toLowerCase()}</p></div>
          <button className="panel-menu" onClick={onSeeTransactions} aria-label="See all transactions"><ArrowRight size={15} /></button>
        </div>
        {categoryData.length > 0 ? (
          <>
            <div className="donut-layout">
              <div className="donut-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={75} paddingAngle={2} stroke="none" cornerRadius={3}>
                      {categoryData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(Number(value), currencyCode)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center"><strong>{formatMoney(spend, currencyCode, true)}</strong><span>SPENT</span></div>
              </div>
              <div className="category-legend-list">
                {categoryData.slice(0, 5).map(({ name, value, color }) => (
                  <button className="category-legend-item" key={name} onClick={() => onCategoryClick(name)}>
                    <i className="legend-dot" style={{ background: color }} /><span>{name}</span><strong>{formatMoney(value, currencyCode, true)}</strong>
                  </button>
                ))}
                {categoryData.length > 5 && <button className="view-category-link" onClick={onSeeTransactions}>+ {categoryData.length - 5} more categories <ArrowRight size={13} /></button>}
              </div>
            </div>
            <div className="category-panel-foot"><span>{categoryData.length} spending categories</span><span>{unknownCount} unknown categorization{unknownCount === 1 ? '' : 's'}</span></div>
          </>
        ) : (
          <div className="chart-empty-state"><span className="empty-icon"><BarChart3 size={19} /></span><strong>No spending to show yet</strong><span>Import transactions to see your category breakdown.</span><button className="text-button" onClick={onUpload}>Add a statement <ArrowRight size={13} /></button></div>
        )}
      </article>
    </section>
  )
}
