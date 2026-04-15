import { useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { MetricCard } from './MetricCard'
import { UsageChart } from './UsageChart'
import { DiskList } from './DiskList'
import { QuickActions } from './QuickActions'
import { Cpu, MemoryStick, HardDrive, Activity } from 'lucide-react'

export function Dashboard() {
  const { metrics, setMetrics } = useAppStore()

  useEffect(() => {
    // Fetch initial snapshot
    window.electronAPI?.getMetrics().then((m) => {
      if (m) setMetrics(m as never)
    })
  }, [])

  const cpu = metrics?.cpu
  const ram = metrics?.ram

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fluent-text">Panel de rendimiento</h1>
          <p className="text-fluent-textMuted text-sm mt-1">
            Estado del sistema en tiempo real
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-fluent-success ml-2 live-dot" />
          </p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="CPU"
          value={`${cpu?.usagePercent ?? 0}%`}
          subtitle={cpu?.model ?? '—'}
          icon={Cpu}
          color={getColor(cpu?.usagePercent ?? 0)}
          progress={cpu?.usagePercent ?? 0}
        />
        <MetricCard
          title="RAM"
          value={`${ram?.usagePercent ?? 0}%`}
          subtitle={ram ? `${(ram.usedMB / 1024).toFixed(1)} / ${(ram.totalMB / 1024).toFixed(1)} GB` : '—'}
          icon={MemoryStick}
          color={getColor(ram?.usagePercent ?? 0)}
          progress={ram?.usagePercent ?? 0}
        />
        <MetricCard
          title="Disco C:"
          value={`${metrics?.disk?.[0]?.usagePercent ?? 0}%`}
          subtitle={metrics?.disk?.[0] ? `${metrics.disk[0].freeGB} GB libres` : '—'}
          icon={HardDrive}
          color={getColor(metrics?.disk?.[0]?.usagePercent ?? 0)}
          progress={metrics?.disk?.[0]?.usagePercent ?? 0}
        />
        <MetricCard
          title="Red"
          value={`${metrics?.network?.downloadKBs ?? 0} KB/s`}
          subtitle="Descarga"
          icon={Activity}
          color="blue"
          progress={0}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-fluent-textMuted mb-3 uppercase tracking-wide">
            Historial CPU
          </h3>
          <UsageChart
            data={cpu?.history ?? []}
            color="#0078d4"
            label="CPU %"
          />
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-fluent-textMuted mb-3 uppercase tracking-wide">
            Historial RAM
          </h3>
          <UsageChart
            data={ram?.history ?? []}
            color="#30d158"
            label="RAM %"
          />
        </div>
      </div>

      {/* Disk info */}
      {metrics?.disk && metrics.disk.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-fluent-textMuted mb-4 uppercase tracking-wide">
            Discos
          </h3>
          <DiskList disks={metrics.disk} />
        </div>
      )}

      {/* Quick actions */}
      <QuickActions />
    </div>
  )
}

function getColor(pct: number): 'green' | 'yellow' | 'red' | 'blue' {
  if (pct < 60) return 'green'
  if (pct < 80) return 'yellow'
  return 'red'
}
