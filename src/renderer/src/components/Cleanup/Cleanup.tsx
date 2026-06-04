import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { Trash2, Search, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import type { CleanupCategory, CleanupResult } from '../../../../shared/types'

export function Cleanup() {
  const { cleanupCategories, setCleanupCategories, addNotification, setLoading, loading, requestConfirm } = useAppStore()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<CleanupResult[]>([])
  const [hasScanned, setHasScanned] = useState(false)

  const isScanLoading = loading['cleanup-scan']
  const isCleanLoading = loading['cleanup-run']

  const handleScan = async () => {
    setLoading('cleanup-scan', true)
    setResults([])
    try {
      const cats = await window.electronAPI?.scanCleanup() as CleanupCategory[]
      if (cats) {
        setCleanupCategories(cats)
        setHasScanned(true)
        const safeIds = cats.filter((c) => c.safe).map((c) => c.id)
        setSelected(new Set(safeIds))
      }
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al escanear: ' + String(err) })
    } finally {
      setLoading('cleanup-scan', false)
    }
  }

  const handleClean = async () => {
    if (selected.size === 0) return
    const confirmed = await requestConfirm({
      title: 'Confirmar limpieza',
      description: `Se limpiarán ${selected.size} categorías seleccionadas. Esta acción no se puede deshacer.`,
      confirmLabel: 'Limpiar ahora',
      cancelLabel: 'Cancelar',
      variant: 'warning'
    })
    if (!confirmed) return

    setLoading('cleanup-run', true)
    try {
      const res = await window.electronAPI?.runCleanup([...selected]) as CleanupResult[]
      if (res) {
        setResults(res)
        const totalFreed = res.reduce((sum, r) => sum + r.freedMB, 0)
        const cleanedIds = new Set(res.filter((r) => r.success).map((r) => r.categoryId))

        setCleanupCategories(
          cleanupCategories.map((cat) =>
            cleanedIds.has(cat.id)
              ? { ...cat, sizeMB: 0, fileCount: 0 }
              : cat
          )
        )
        setSelected((prev) => new Set([...prev].filter((id) => !cleanedIds.has(id))))

        if (res.some((r) => r.requiresAdmin)) {
          addNotification({
            type: 'warning',
            message: 'Algunas categorías requieren ejecutar NitroFlow como administrador.'
          })
        }
        addNotification({
          type: 'success',
          message: `Limpieza completada: ${totalFreed.toFixed(1)} MB liberados`
        })
      }
    } catch (err) {
      addNotification({ type: 'error', message: 'Error en limpieza: ' + String(err) })
    } finally {
      setLoading('cleanup-run', false)
    }
  }

  const totalSelected = cleanupCategories
    .filter((c) => selected.has(c.id))
    .reduce((sum, c) => sum + c.sizeMB, 0)

  const toggleAll = (val: boolean) => {
    if (val) {
      setSelected(new Set(cleanupCategories.map((c) => c.id)))
    } else {
      setSelected(new Set())
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fluent-text">Limpieza del sistema</h1>
          <p className="text-fluent-textMuted text-sm mt-1">
            Elimina archivos temporales, caché y elementos obsoletos de forma segura
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleScan} disabled={isScanLoading} className="btn-secondary flex items-center gap-2">
            <Search size={15} />
            {isScanLoading ? 'Escaneando…' : 'Escanear'}
          </button>
          {hasScanned && selected.size > 0 && (
            <button onClick={handleClean} disabled={isCleanLoading} className="btn-primary flex items-center gap-2">
              <Trash2 size={15} />
              {isCleanLoading ? 'Limpiando…' : `Limpiar (${totalSelected.toFixed(0)} MB)`}
            </button>
          )}
        </div>
      </div>

      {!hasScanned && (
        <div className="card text-center py-16">
          <Trash2 size={48} className="mx-auto text-fluent-textMuted mb-4" />
          <p className="text-fluent-textMuted">
            Haz clic en <strong className="text-fluent-text">Escanear</strong> para detectar archivos a limpiar
          </p>
        </div>
      )}

      {hasScanned && cleanupCategories.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-fluent-textMuted cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === cleanupCategories.length}
                onChange={(e) => toggleAll(e.target.checked)}
                className="accent-fluent-accent"
              />
              Seleccionar todo
            </label>
            <span className="text-sm text-fluent-textMuted">
              {selected.size} de {cleanupCategories.length} categorías · {totalSelected.toFixed(1)} MB
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {cleanupCategories.map((cat) => {
              const result = results.find((r) => r.categoryId === cat.id)
              return (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  selected={selected.has(cat.id)}
                  result={result}
                  onToggle={(checked) => {
                    const next = new Set(selected)
                    if (checked) next.add(cat.id)
                    else next.delete(cat.id)
                    setSelected(next)
                  }}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function CategoryCard({
  category,
  selected,
  result,
  onToggle
}: {
  category: CleanupCategory
  selected: boolean
  result?: CleanupResult
  onToggle: (v: boolean) => void
}) {
  return (
    <div
      className={`card flex items-start gap-3 cursor-pointer transition-colors ${
        selected ? 'border-fluent-accent' : ''
      }`}
      onClick={() => onToggle(!selected)}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-1 accent-fluent-accent"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-fluent-text">{category.name}</span>
          {!category.safe && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
              Avanzado
            </span>
          )}
        </div>
        <p className="text-xs text-fluent-textMuted mt-0.5">{category.description}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs font-semibold text-fluent-accent">
            {category.sizeMB.toFixed(1)} MB
          </span>
          <span className="text-xs text-fluent-textMuted">{category.fileCount} archivos</span>
          {result && (() => {
            if (result.requiresAdmin) {
              return (
                <span className="flex items-center gap-1 text-xs text-fluent-warning">
                  <AlertTriangle size={12} />
                  Requiere admin
                </span>
              )
            }
            if (!result.success) {
              return (
                <span className="flex items-center gap-1 text-xs text-fluent-error">
                  <XCircle size={12} />
                  {result.errors[0] ?? 'Error'}
                </span>
              )
            }
            if (result.empty) {
              return (
                <span className="flex items-center gap-1 text-xs text-fluent-textMuted">
                  <CheckCircle2 size={12} />
                  Sin archivos
                </span>
              )
            }
            return (
              <span className="flex items-center gap-1 text-xs text-fluent-success">
                <CheckCircle2 size={12} />
                {`−${result.freedMB.toFixed(1)} MB`}
              </span>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
