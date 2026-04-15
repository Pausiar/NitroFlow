import type { DiskMetrics } from '../../../../shared/types'

interface Props {
  disks: DiskMetrics[]
}

export function DiskList({ disks }: Props) {
  return (
    <div className="space-y-3">
      {disks.map((disk) => (
        <div key={disk.drive} className="flex items-center gap-4">
          <div className="w-8 text-center">
            <span className="text-xs font-bold text-fluent-textMuted">{disk.drive}</span>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-fluent-textMuted">{disk.label || disk.drive}</span>
              <span className="text-fluent-text">
                {disk.usedGB.toFixed(1)} / {disk.totalGB.toFixed(1)} GB
              </span>
            </div>
            <div className="h-2 bg-fluent-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${disk.usagePercent}%`,
                  backgroundColor: disk.usagePercent > 85 ? '#ff453a' : disk.usagePercent > 70 ? '#ffd60a' : '#0078d4'
                }}
              />
            </div>
          </div>
          <div className="w-10 text-right">
            <span className="text-xs font-semibold text-fluent-text">{disk.usagePercent}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}
