import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { RefreshCw, Rocket, AlertTriangle, CheckCircle } from 'lucide-react'
import type { StartupEntry } from '../../../../shared/types'

export function Startup() {
  const { startupEntries, setStartupEntries, addNotification, setLoading, loading, requestConfirm } = useAppStore()
  const [filter, setFilter] = useState('')

  const isLoading = loading['startup']

  const loadEntries = async () => {
    setLoading('startup', true)
    try {
      const entries = await window.electronAPI?.getStartup() as StartupEntry[]
      if (entries) setStartupEntries(entries)
    } finally {
      setLoading('startup', false)
    }
  }

  useEffect(() => { loadEntries() }, [])

  const handleToggle = async (id: string, enabled: boolean) => {
    const entry = startupEntries.find((e) => e.id === id)
    if (!entry) return

    const action = enabled ? 'habilitar' : 'deshabilitar'
    const confirmed = await requestConfirm({
      title: `¿Deseas ${action} este programa?`,
      description: `Programa de inicio: "${entry.name}".`,
      confirmLabel: enabled ? 'Habilitar' : 'Deshabilitar',
      variant: 'info'
    })
    if (!confirmed) return

    const result = await window.electronAPI?.toggleStartup(id, enabled) as { success: boolean; error?: string }
    if (result?.success) {
      addNotification({ type: 'success', message: `"${entry.name}" ${enabled ? 'habilitado' : 'deshabilitado'} en el inicio` })
      setStartupEntries(
        startupEntries.map((e) => (e.id === id ? { ...e, enabled } : e))
      )
    } else {
      addNotification({ type: 'error', message: result?.error ?? 'Error al cambiar estado' })
    }
  }

  const filtered = startupEntries.filter(
    (e) =>
      e.name.toLowerCase().includes(filter.toLowerCase()) ||
      e.publisher.toLowerCase().includes(filter.toLowerCase())
  )

  const impactColor = {
    High: 'text-fluent-error',
    Medium: 'text-fluent-warning',
    Low: 'text-fluent-success',
    Unknown: 'text-fluent-textMuted'
  }

  const impactLabel = {
    High: 'Alto impacto',
    Medium: 'Impacto medio',
    Low: 'Bajo impacto',
    Unknown: 'Desconocido'
  }

  const highImpactEnabled = filtered.filter((e) => e.enabled && e.impact === 'High').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fluent-text">Administrador de inicio</h1>
          <p className="text-fluent-textMuted text-sm mt-1">
            Controla qué programas se inician automáticamente con Windows
          </p>
        </div>
        <button onClick={loadEntries} disabled={isLoading} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Info banner */}
      {highImpactEnabled > 0 && (
        <div className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/30 rounded-fluentLg p-3">
          <AlertTriangle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-orange-300">
            Tienes <strong>{highImpactEnabled} programa(s) de alto impacto</strong> habilitados en el inicio.
            Deshabilitarlos puede mejorar significativamente el tiempo de arranque.
          </p>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar programas…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full bg-fluent-surface border border-fluent-border rounded-fluent py-2 px-3 text-sm text-fluent-text placeholder:text-fluent-textMuted focus:outline-none focus:border-fluent-accent"
      />

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="card text-center py-12">
            <Rocket size={40} className="mx-auto text-fluent-textMuted mb-3" />
            <p className="text-fluent-textMuted text-sm">
              {isLoading ? 'Cargando…' : 'No hay entradas de inicio'}
            </p>
          </div>
        )}

        {filtered.map((entry) => (
          <div key={entry.id} className="card flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-fluent-text">{entry.name}</span>
                <span className={`text-xs font-medium ${impactColor[entry.impact]}`}>
                  {impactLabel[entry.impact]}
                </span>
                <span className="text-xs text-fluent-textMuted bg-fluent-surface px-1.5 py-0.5 rounded">
                  {entry.location}
                </span>
              </div>
              {entry.publisher && (
                <p className="text-xs text-fluent-textMuted mt-0.5">{entry.publisher}</p>
              )}
              {entry.command && (
                <p className="text-xs text-fluent-textMuted mt-0.5 font-mono truncate max-w-xl">
                  {entry.command}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`flex items-center gap-1 text-xs ${entry.enabled ? 'text-fluent-success' : 'text-fluent-textMuted'}`}>
                <CheckCircle size={12} />
                {entry.enabled ? 'Habilitado' : 'Deshabilitado'}
              </span>
              {/* Toggle switch */}
              <button
                onClick={() => handleToggle(entry.id, !entry.enabled)}
                className={`relative w-10 h-6 rounded-full transition-colors duration-200 overflow-hidden ${
                  entry.enabled ? 'bg-fluent-accent' : 'bg-fluent-border'
                }`}
              >
                <span
                  className={`absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                    entry.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
