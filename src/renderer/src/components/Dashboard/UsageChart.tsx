import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

interface Props {
  data: number[]
  color: string
  label: string
}

export function UsageChart({ data, color, label }: Props) {
  const chartData = data.map((value, index) => ({ index, value }))

  if (chartData.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-fluent-textMuted text-sm">
        Recopilando datos…
      </div>
    )
  }

  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="index" hide />
          <YAxis domain={[0, 100]} tick={{ fill: '#aeaeb2', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#3a3a3c', border: '1px solid #48484a', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ display: 'none' }}
            formatter={(v: number) => [`${v}%`, label]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${label})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
