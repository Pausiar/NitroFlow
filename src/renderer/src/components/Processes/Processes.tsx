import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { RefreshCw, X, Search, AlertTriangle } from 'lucide-react'
import type { ProcessInfo, ServiceInfo } from '../../../../shared/types'

export function Processes() {
  const { processes, services, setProcesses, setServices, addNotification, setLoading, loading } = useAppStore()
  const [tab, setTab] = useState<'processes' | 'services'>('processes')
  const [filter, setFilter] = useState('')

  const isLoading = loading['processes']

  const refresh = async () => {
    setLoading('processes', true)
    try {
      if (tab === 'processes') {
        const ps = await window.electronAPI?.getProcesses() as ProcessInfo[]
        if (ps) setProcesses(ps)
      } else {
        const svcs = await window.electronAPI?.getServices() as ServiceInfo[]
        if (svcs) setServices(svcs)
      }
    } finally {
      setLoading('processes', false)
    }
  }

  useEffect(() => { refresh() }, [tab])

  const handleKill = async (pid: number, name: string) => {
    const confirmed = window.confirm(`¿Terminar el proceso "${name}" (PID ${pid})?`)
    if (!confirmed) return
    const result = await window.electronAPI?.killProcess(pid) as { success: boolean; error?: string }
    if (result?.success) {
      addNotification({ type: 'success', message: `Proceso "${name}" terminado` })
      refresh()
    } else {
      addNotification({ type: 'error', message: result?.error ?? 'Error al terminar proceso' })
    }
  }

  const handleService = async (name: string, action: 'start' | 'stop' | 'disable') => {
    const labels = { start: 'iniciar', stop: 'detener', disable: 'deshabilitar' }
    const confirmed = window.confirm(`¿${labels[action]} el servicio "${name}"?`)
    if (!confirmed) return
    const result = await window.electronAPI?.setService(name, action) as { success: boolean; error?: string }
    if (result?.success) {
      addNotification({ type: 'success', message: `Servicio "${name}": ${action}` })
      refresh()
    } else {
      addNotification({ type: 'error', message: result?.error ?? 'Error en servicio' })
    }
  }

  const filteredProcesses = processes.filter(
    (p) => p.name.toLowerCase().includes(filter.toLowerCase())
  )
  const filteredServices = services.filter(
    (s) => s.displayName.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fluent-text">Procesos y servicios</h1>
          <p className="text-fluent-textMuted text-sm mt-1">
            Gestiona los procesos en ejecución y los servicios del sistema
          </p>
        </div>
        <button onClick={refresh} disabled={isLoading} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-fluent-surface p-1 rounded-fluent w-fit">
        {(['processes', 'services'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t ? 'bg-fluent-accent text-white' : 'text-fluent-textMuted hover:text-fluent-text'
            }`}
          >
            {t === 'processes' ? 'Procesos' : 'Servicios'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fluent-textMuted" />
        <input
          type="text"
          placeholder={`Buscar ${tab === 'processes' ? 'procesos' : 'servicios'}…`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-fluent-surface border border-fluent-border rounded-fluent py-2 pl-9 pr-3 text-sm text-fluent-text placeholder:text-fluent-textMuted focus:outline-none focus:border-fluent-accent"
        />
      </div>

      {/* Process table */}
      {tab === 'processes' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fluent-border bg-fluent-surface">
                <th className="text-left px-4 py-3 text-fluent-textMuted font-medium">Proceso</th>
                <th className="text-right px-4 py-3 text-fluent-textMuted font-medium">CPU</th>
                <th className="text-right px-4 py-3 text-fluent-textMuted font-medium">RAM</th>
                <th className="px-4 py-3 text-fluent-textMuted font-medium text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.map((p) => (
                <tr key={p.pid} className="border-b border-fluent-border/50 hover:bg-fluent-surface/50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-fluent-text">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-fluent-textMuted">{p.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-mono text-xs ${p.cpuPercent > 20 ? 'text-fluent-warning' : 'text-fluent-text'}`}>
                      {p.cpuPercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-mono text-xs text-fluent-text">{p.ramMB} MB</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.canTerminate ? (
                      <button
                        onClick={() => handleKill(p.pid, p.name)}
                        className="btn-danger text-xs py-1 px-2 flex items-center gap-1 mx-auto"
                      >
                        <X size={12} />
                        Terminar
                      </button>
                    ) : (
                      <span className="text-xs text-fluent-textMuted flex items-center gap-1 justify-center">
                        <AlertTriangle size={12} />
                        Sistema
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredProcesses.length === 0 && (
            <p className="text-center py-8 text-fluent-textMuted text-sm">
              {isLoading ? 'Cargando…' : 'No se encontraron procesos'}
            </p>
          )}
        </div>
      )}

      {/* Services table */}
      {tab === 'services' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fluent-border bg-fluent-surface">
                <th className="text-left px-4 py-3 text-fluent-textMuted font-medium">Servicio</th>
                <th className="text-center px-4 py-3 text-fluent-textMuted font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-fluent-textMuted font-medium">Tipo inicio</th>
                <th className="px-4 py-3 text-fluent-textMuted font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((s) => (
                <tr key={s.name} className="border-b border-fluent-border/50 hover:bg-fluent-surface/50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-fluent-text">{s.displayName}</div>
                    <div className="text-xs text-fluent-textMuted">{s.name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-xs text-fluent-textMuted">{s.startType}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {s.canOptimize && (
                      <div className="flex gap-1 justify-center">
                        {s.status === 'Stopped' && (
                          <button onClick={() => handleService(s.name, 'start')} className="btn-secondary text-xs py-1 px-2">
                            Iniciar
                          </button>
                        )}
                        {s.status === 'Running' && (
                          <button onClick={() => handleService(s.name, 'stop')} className="btn-secondary text-xs py-1 px-2">
                            Detener
                          </button>
                        )}
                        {s.startType !== 'Disabled' && (
                          <button onClick={() => handleService(s.name, 'disable')} className="btn-secondary text-xs py-1 px-2 text-fluent-warning">
                            Deshabilitar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ServiceInfo['status'] }) {
  const cfg = {
    Running: 'bg-green-500/20 text-green-400',
    Stopped: 'bg-red-500/20 text-red-400',
    Paused: 'bg-yellow-500/20 text-yellow-400',
    StartPending: 'bg-blue-500/20 text-blue-400',
    StopPending: 'bg-orange-500/20 text-orange-400'
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg[status] ?? ''}`}>
      {status}
    </span>
  )
}
