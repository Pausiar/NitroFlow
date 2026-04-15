import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { Search, Trash2, AlertTriangle, Database } from 'lucide-react'
import type { RegistryEntry } from '../../../../shared/types'

export function Registry() {
  const { registryEntries, setRegistryEntries, addNotification, setLoading, loading } = useAppStore()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hasScanned, setHasScanned] = useState(false)

  const isScanLoading = loading['registry-scan']
  const isCleanLoading = loading['registry-clean']

  const handleScan = async () => {
    setLoading('registry-scan', true)
    try {
      const entries = await window.electronAPI?.scanRegistry() as RegistryEntry[]
      if (entries) {
        setRegistryEntries(entries)
        setHasScanned(true)
        const safeIds = entries.filter((e) => e.safe).map((e) => e.id)
        setSelected(new Set(safeIds))
        addNotification({ type: 'info', message: `Se encontraron ${entries.length} entradas en el registro` })
      }
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al escanear registro: ' + String(err) })
    } finally {
      setLoading('registry-scan', false)
    }
  }

  const handleClean = async () => {
    if (selected.size === 0) return
    const confirmed = window.confirm(
      `¿Limpiar ${selected.size} entradas del registro? Se creará una copia de seguridad automáticamente antes de proceder.`
    )
    if (!confirmed) return

    setLoading('registry-clean', true)
    try {
      const result = await window.electronAPI?.cleanRegistry([...selected]) as {
        fixed: number
        backed_up: boolean
        errors: string[]
      }
      if (result) {
        addNotification({
          type: 'success',
          message: `Registro limpiado: ${result.fixed} entradas corregidas${result.backed_up ? ' (copia de seguridad creada)' : ''}`
        })
        // Re-scan
        handleScan()
      }
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al limpiar registro: ' + String(err) })
    } finally {
      setLoading('registry-clean', false)
    }
  }

  const severityColor = {
    High: 'text-fluent-error bg-red-500/20',
    Medium: 'text-fluent-warning bg-yellow-500/20',
    Low: 'text-fluent-info bg-blue-500/20'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fluent-text">Optimización del Registro</h1>
          <p className="text-fluent-textMuted text-sm mt-1">
            Detecta y elimina entradas huérfanas e inválidas del registro de Windows
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleScan} disabled={isScanLoading} className="btn-secondary flex items-center gap-2">
            <Search size={15} />
            {isScanLoading ? 'Escaneando…' : 'Analizar'}
          </button>
          {hasScanned && selected.size > 0 && (
            <button onClick={handleClean} disabled={isCleanLoading} className="btn-primary flex items-center gap-2">
              <Trash2 size={15} />
              {isCleanLoading ? 'Limpiando…' : `Limpiar (${selected.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-fluentLg p-3">
        <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-300">
          <strong>Aviso de seguridad:</strong> Siempre se crea una copia de seguridad antes de modificar el registro.
          Las claves críticas del sistema están protegidas y no pueden modificarse.
        </p>
      </div>

      {!hasScanned ? (
        <div className="card text-center py-16">
          <Database size={48} className="mx-auto text-fluent-textMuted mb-4" />
          <p className="text-fluent-textMuted">
            Haz clic en <strong className="text-fluent-text">Analizar</strong> para buscar entradas problemáticas
          </p>
        </div>
      ) : registryEntries.length === 0 ? (
        <div className="card text-center py-16">
          <Database size={48} className="mx-auto text-fluent-success mb-4" />
          <p className="text-fluent-text font-semibold">El registro está limpio</p>
          <p className="text-fluent-textMuted text-sm mt-1">No se encontraron entradas problemáticas</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-fluent-textMuted cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === registryEntries.length}
                onChange={(e) => {
                  if (e.target.checked) setSelected(new Set(registryEntries.map((e) => e.id)))
                  else setSelected(new Set())
                }}
                className="accent-fluent-accent"
              />
              Seleccionar todo
            </label>
            <span className="text-sm text-fluent-textMuted">{selected.size} de {registryEntries.length} seleccionadas</span>
          </div>

          <div className="space-y-2">
            {registryEntries.map((entry) => (
              <div
                key={entry.id}
                className={`card flex items-start gap-3 cursor-pointer ${selected.has(entry.id) ? 'border-fluent-accent' : ''}`}
                onClick={() => {
                  const next = new Set(selected)
                  if (next.has(entry.id)) next.delete(entry.id)
                  else next.add(entry.id)
                  setSelected(next)
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onChange={() => {}}
                  className="mt-1 accent-fluent-accent"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-fluent-textMuted truncate max-w-xs">
                      {entry.key}\\{entry.value}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${severityColor[entry.severity]}`}>
                      {entry.severity}
                    </span>
                  </div>
                  <p className="text-sm text-fluent-text mt-1">{entry.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
