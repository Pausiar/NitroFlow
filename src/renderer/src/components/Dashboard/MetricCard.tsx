import { ElementType } from 'react'

interface Props {
  title: string
  value: string
  subtitle: string
  icon: ElementType
  color: 'green' | 'yellow' | 'red' | 'blue'
  progress: number
}

const colors = {
  green: { text: 'text-fluent-success', bg: 'bg-fluent-success', bar: '#30d158' },
  yellow: { text: 'text-fluent-warning', bg: 'bg-fluent-warning', bar: '#ffd60a' },
  red: { text: 'text-fluent-error', bg: 'bg-fluent-error', bar: '#ff453a' },
  blue: { text: 'text-fluent-info', bg: 'bg-fluent-info', bar: '#64d2ff' }
}

export function MetricCard({ title, value, subtitle, icon: Icon, color, progress }: Props) {
  const c = colors[color]
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="metric-label">{title}</span>
        <Icon size={16} className={c.text} />
      </div>
      <div>
        <span className={`metric-value ${c.text}`}>{value}</span>
        <p className="text-xs text-fluent-textMuted mt-1 truncate">{subtitle}</p>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-fluent-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%`, backgroundColor: c.bar }}
        />
      </div>
    </div>
  )
}
