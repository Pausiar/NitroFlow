import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { RefreshCw, Rocket, AlertTriangle, CheckCircle, ShieldCheck, Info, Zap, Lock } from 'lucide-react'
import type { StartupEntry } from '../../../../shared/types'

export function Startup() {
  const { startupEntries, setStartupEntries, addNotification, setLoading, loading, requestConfirm } = useAppStore()
  const [filter, setFilter] = useState('')
  const [bulkRunning, setBulkRunning] = useState(false)

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

  // Safe-to-disable apps that are still switched on (never essential ones).
  const recommendedToDisable = startupEntries.filter(
    (e) => e.enabled && e.recommendation === 'disable' && !e.essential
  )

  const handleDisableRecommended = async () => {
    const targets = recommendedToDisable
    if (targets.length === 0) return
    const confirmed = await requestConfirm({
      title: `¿Desactivar ${targets.length} programa(s) del inicio?`,
      description:
        `Dejarán de abrirse solos al encender el PC: ${targets.map((e) => e.name).join(', ')}. ` +
        'No se desinstala nada: podrás abrirlos manualmente y volver a activarlos cuando quieras.',
      confirmLabel: 'Desactivar recomendados',
      variant: 'info'
    })
    if (!confirmed) return

    setBulkRunning(true)
    const done = new Set<string>()
    let failed = 0
    try {
      for (const entry of targets) {
        const result = await window.electronAPI?.toggleStartup(entry.id, false) as { success: boolean; error?: string }
        if (result?.success) done.add(entry.id)
        else failed++
      }
    } finally {
      setBulkRunning(false)
    }
    if (done.size > 0) {
      setStartupEntries(startupEntries.map((e) => (done.has(e.id) ? { ...e, enabled: false } : e)))
    }
    addNotification({
      type: failed === 0 ? 'success' : 'warning',
      message:
        failed === 0
          ? `${done.size} programa(s) desactivados del inicio. Tu PC arrancará más rápido.`
          : `${done.size} desactivado(s); ${failed} no se pudieron cambiar.`
    })
  }

  const rank = (e: StartupEntry) =>
    e.recommendation === 'disable' ? 0 : e.recommendation === 'optional' || !e.recommendation ? 1 : 2

  const filtered = startupEntries
    .filter(
      (e) =>
        e.name.toLowerCase().includes(filter.toLowerCase()) ||
        e.publisher.toLowerCase().includes(filter.toLowerCase())
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.enabled) - Number(a.enabled) ||
        a.name.localeCompare(b.name)
    )

  const badge = (r: StartupEntry['recommendation']) => {
    switch (r) {
      case 'disable':
        return { label: 'Recomendado desactivar', cls: 'text-orange-300 bg-orange-500/15 border-orange-500/30' }
      case 'keep':
        return { label: 'Mantener', cls: 'text-fluent-success bg-fluent-success/10 border-fluent-success/30' }
      default:
        return { label: 'Opcional', cls: 'text-fluent-textMuted bg-fluent-surface border-fluent-border' }
    }
  }

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

      <div className="flex items-start gap-3 bg-fluent-surface border border-fluent-border rounded-fluentLg p-3">
        <Info size={16} className="text-fluent-accent flex-shrink-0 mt-0.5" />
        <p className="text-xs text-fluent-textMuted">
          Desactivar un programa solo evita que se abra al encender el PC: no se desinstala nada y
          puedes volver a activarlo cuando quieras (también desde Historial).
        </p>
      </div>

      {recommendedToDisable.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-fluent-accent/10 border border-fluent-accent/30 rounded-fluentLg p-3">
          <p className="text-sm text-fluent-text">
            Encontramos <strong>{recommendedToDisable.length}</strong> programa(s) que puedes desactivar sin riesgo para acelerar el arranque.
          </p>
          <button
            onClick={handleDisableRecommended}
            disabled={bulkRunning || isLoading}
            className="btn-primary flex items-center gap-2 flex-shrink-0"
          >
            <Zap size={14} />
            {bulkRunning ? 'Desactivando…' : `Desactivar recomendados (${recommendedToDisable.length})`}
          </button>
        </div>
      )}

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
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${badge(entry.recommendation).cls}`}>
                  {badge(entry.recommendation).label}
                </span>
              </div>
              {entry.recommendationReason && (
                <p className="text-xs text-fluent-textMuted mt-1 flex items-start gap-1">
                  {entry.essential && <ShieldCheck size={12} className="text-fluent-success flex-shrink-0 mt-0.5" />}
                  <span>{entry.recommendationReason}</span>
                </p>
              )}
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
              {/* Toggle switch (locked for essential entries while enabled) */}
              {entry.essential && entry.enabled ? (
                <span
                  title="Necesario para la seguridad o el hardware de tu PC: no se puede desactivar"
                  className="flex items-center justify-center w-10 h-6 text-fluent-textMuted"
                >
                  <Lock size={14} />
                </span>
              ) : (
              <button
                title={entry.enabled ? 'Desactivar al inicio' : 'Activar al inicio'}
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
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
