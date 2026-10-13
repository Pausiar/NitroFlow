import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/app.store'
import {
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Info,
  Lock
} from 'lucide-react'
import type { CleanupCategory, CleanupResult } from '../../../../shared/types'

/** Extra fields the cleanup service may add (see CleanupCategoryScan / CleanupRunResult in main). */
type ScannedCategory = CleanupCategory & { blockedReason?: string }
type RunResult = CleanupResult & { skippedReason?: string; lockedFiles?: number }

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  if (mb >= 10) return `${mb.toFixed(0)} MB`
  return `${mb.toFixed(1)} MB`
}

export function Cleanup() {
  const {
    cleanupCategories,
    setCleanupCategories,
    addNotification,
    setLoading,
    loading,
    requestConfirm
  } = useAppStore()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<RunResult[]>([])
  const [hasScanned, setHasScanned] = useState(false)
  const started = useRef(false)

  const isScanLoading = !!loading['cleanup-scan']
  const isCleanLoading = !!loading['cleanup-run']

  const categories = cleanupCategories as ScannedCategory[]
  const isBlocked = (c: ScannedCategory) => !!c.blockedReason

  const handleScan = async () => {
    setLoading('cleanup-scan', true)
    setResults([])
    try {
      const cats = (await window.electronAPI?.scanCleanup()) as ScannedCategory[] | undefined
      if (cats) {
        setCleanupCategories(cats)
        setHasScanned(true)
        // Only the safe, recommended categories (with something to clean) start selected.
        setSelected(
          new Set(
            cats
              .filter((c) => c.recommended && !c.blockedReason && c.fileCount > 0)
              .map((c) => c.id)
          )
        )
      }
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al escanear: ' + String(err) })
    } finally {
      setLoading('cleanup-scan', false)
    }
  }

  // Scan automatically when the page opens.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void handleScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedCats = categories.filter((c) => selected.has(c.id) && !isBlocked(c))
  const totalSelected = selectedCats.reduce((sum, c) => sum + c.sizeMB, 0)

  const handleClean = async () => {
    if (selectedCats.length === 0) return
    const optional = selectedCats.filter((c) => !c.recommended)
    // The dialog renders a single paragraph, so build plain flowing sentences.
    const parts = [
      `Se eliminarán ${formatSize(totalSelected)}: ${selectedCats
        .map((c) => `${c.name} (${formatSize(c.sizeMB)})`)
        .join(', ')}.`
    ]
    if (optional.length > 0) {
      parts.push(
        `Ten en cuenta: ${optional.map((c) => `${c.name}: ${c.warning ?? 'opción no recomendada'}`).join('. ')}.`
      )
    } else {
      parts.push('Son archivos temporales y cachés: tus documentos, fotos y contraseñas no se tocan.')
    }
    parts.push('Los archivos en uso se omiten. Esta acción no se puede deshacer.')
    const confirmed = await requestConfirm({
      title: `Limpiar ${formatSize(totalSelected)}`,
      description: parts.join(' '),
      confirmLabel: 'Limpiar ahora',
      cancelLabel: 'Cancelar',
      variant: optional.length > 0 ? 'warning' : 'info'
    })
    if (!confirmed) return

    setLoading('cleanup-run', true)
    try {
      const res = (await window.electronAPI?.runCleanup(
        selectedCats.map((c) => c.id)
      )) as RunResult[] | undefined
      if (res) {
        setResults(res)
        const totalFreed = res.reduce((sum, r) => sum + r.freedMB, 0)
        const cleanedIds = new Set(
          res.filter((r) => r.success && !r.skippedReason).map((r) => r.categoryId)
        )
        const touchedIds = new Set(res.filter((r) => r.freedMB > 0).map((r) => r.categoryId))

        setCleanupCategories(
          cleanupCategories.map((cat) =>
            cleanedIds.has(cat.id)
              ? { ...cat, sizeMB: 0, fileCount: 0 }
              : touchedIds.has(cat.id)
                ? { ...cat, sizeMB: Math.max(0, cat.sizeMB - (res.find((r) => r.categoryId === cat.id)?.freedMB ?? 0)) }
                : cat
          )
        )
        setSelected((prev) => new Set([...prev].filter((id) => !cleanedIds.has(id))))

        addNotification({
          type: 'success',
          message:
            totalFreed >= 1024
              ? `Limpieza completada: ${(totalFreed / 1024).toFixed(2)} GB liberados`
              : `Limpieza completada: ${totalFreed.toFixed(1)} MB liberados`
        })
        if (res.some((r) => r.requiresAdmin)) {
          addNotification({
            type: 'warning',
            message: 'Algunas categorías requieren ejecutar NitroFlow como administrador.'
          })
        }
        const skipped = res.filter((r) => r.skippedReason)
        if (skipped.length > 0) {
          addNotification({ type: 'info', message: skipped[0].skippedReason as string })
        }
      }
    } catch (err) {
      addNotification({ type: 'error', message: 'Error en limpieza: ' + String(err) })
    } finally {
      setLoading('cleanup-run', false)
    }
  }

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  const hasContent = (c: ScannedCategory) => c.fileCount > 0 || c.sizeMB > 0
  const resultFor = (id: string) => results.find((r) => r.categoryId === id)
  // Keep a category visible after cleaning if it has a result to show.
  const visible = (c: ScannedCategory) => hasContent(c) || !!resultFor(c.id)

  const recommended = categories.filter((c) => c.recommended && visible(c))
  const optional = categories.filter((c) => !c.recommended && visible(c))
  const emptyCount = categories.filter((c) => !visible(c)).length

  const totalFreed = results.reduce((sum, r) => sum + r.freedMB, 0)
  const totalLocked = results.reduce((sum, r) => sum + (r.lockedFiles ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fluent-text">Limpieza del sistema</h1>
          <p className="text-fluent-textMuted text-sm mt-1">
            Libera espacio eliminando archivos temporales y cachés. Tus documentos, fotos y
            contraseñas nunca se tocan.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={isScanLoading || isCleanLoading}
          className="btn-secondary flex items-center gap-2 shrink-0"
        >
          <RefreshCw size={15} className={isScanLoading ? 'animate-spin' : ''} />
          {isScanLoading ? 'Analizando…' : 'Volver a analizar'}
        </button>
      </div>

      {!hasScanned && (
        <div className="card text-center py-16">
          <RefreshCw
            size={48}
            className={`mx-auto text-fluent-textMuted mb-4 ${isScanLoading ? 'animate-spin' : ''}`}
          />
          <p className="text-fluent-textMuted">
            {isScanLoading
              ? 'Analizando tu equipo… puede tardar un minuto si hay muchos archivos.'
              : 'No se pudo analizar el equipo. Pulsa "Volver a analizar".'}
          </p>
        </div>
      )}

      {hasScanned && (
        <>
          {/* Primary action */}
          <div className="card flex items-center justify-between gap-4 border-fluent-accent/40">
            <div className="min-w-0">
              <p className="text-sm text-fluent-textMuted">
                {selectedCats.length === 0
                  ? 'Nada seleccionado para limpiar'
                  : `${selectedCats.length} ${selectedCats.length === 1 ? 'categoría seleccionada' : 'categorías seleccionadas'}`}
              </p>
              {results.length > 0 && (
                <p className="text-sm text-fluent-success mt-1 flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  {totalFreed > 0
                    ? `Se liberaron ${formatSize(totalFreed)}`
                    : 'No había nada que liberar en lo seleccionado'}
                  {totalLocked > 0 && (
                    <span className="text-fluent-textMuted">
                      · {totalLocked} {totalLocked === 1 ? 'archivo en uso omitido' : 'archivos en uso omitidos'}
                    </span>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={handleClean}
              disabled={isCleanLoading || isScanLoading || selectedCats.length === 0}
              className="btn-primary flex items-center gap-2 text-base px-6 py-3 shrink-0 disabled:opacity-50"
            >
              <Trash2 size={18} />
              {isCleanLoading ? 'Limpiando…' : `Limpiar ${formatSize(totalSelected)}`}
            </button>
          </div>

          {recommended.length > 0 && (
            <Section
              icon={<ShieldCheck size={16} className="text-fluent-success" />}
              title="Recomendado (seguro)"
              subtitle="Archivos que Windows y tus programas vuelven a crear solos. No se pierde nada."
            >
              {recommended.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  selected={selected.has(cat.id)}
                  result={resultFor(cat.id)}
                  onToggle={(v) => toggle(cat.id, v)}
                />
              ))}
            </Section>
          )}

          {optional.length > 0 && (
            <Section
              icon={<AlertTriangle size={16} className="text-yellow-400" />}
              title="Opcional"
              subtitle="Solo si sabes lo que haces: tienen consecuencias que debes tener en cuenta."
            >
              {optional.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  selected={selected.has(cat.id)}
                  result={resultFor(cat.id)}
                  onToggle={(v) => toggle(cat.id, v)}
                />
              ))}
            </Section>
          )}

          {recommended.length === 0 && optional.length === 0 && (
            <div className="card text-center py-12">
              <CheckCircle2 size={40} className="mx-auto text-fluent-success mb-3" />
              <p className="text-fluent-text font-medium">Tu equipo ya está limpio</p>
              <p className="text-fluent-textMuted text-sm mt-1">No hay archivos que limpiar ahora mismo.</p>
            </div>
          )}

          {emptyCount > 0 && (
            <p className="text-xs text-fluent-textMuted flex items-center gap-1.5">
              <Info size={12} />
              {emptyCount} {emptyCount === 1 ? 'categoría' : 'categorías'} sin nada que limpiar.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Section({
  icon,
  title,
  subtitle,
  children
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-fluent-text flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <p className="text-xs text-fluent-textMuted mt-0.5">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{children}</div>
    </section>
  )
}

function CategoryCard({
  category,
  selected,
  result,
  onToggle
}: {
  category: ScannedCategory
  selected: boolean
  result?: RunResult
  onToggle: (v: boolean) => void
}) {
  const blocked = !!category.blockedReason
  return (
    <div
      className={`card flex items-start gap-3 transition-colors ${
        blocked ? 'opacity-80' : 'cursor-pointer'
      } ${selected ? 'border-fluent-accent' : ''}`}
      onClick={() => !blocked && onToggle(!selected)}
    >
      <input
        type="checkbox"
        checked={selected && !blocked}
        disabled={blocked}
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

        {!category.recommended && category.warning && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400 mt-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {category.warning}
          </p>
        )}
        {blocked && (
          <p className="flex items-start gap-1.5 text-xs text-fluent-warning mt-1.5">
            <Lock size={12} className="mt-0.5 shrink-0" />
            {category.blockedReason}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <span className="text-xs font-semibold text-fluent-accent">
            {formatSize(category.sizeMB)}
          </span>
          <span className="text-xs text-fluent-textMuted">{category.fileCount} archivos</span>
          {result && <ResultBadge result={result} />}
        </div>
      </div>
    </div>
  )
}

function ResultBadge({ result }: { result: RunResult }) {
  if (result.skippedReason) {
    return (
      <span className="flex items-center gap-1 text-xs text-fluent-warning">
        <Lock size={12} />
        {result.skippedReason}
      </span>
    )
  }
  if (result.requiresAdmin) {
    return (
      <span className="flex items-center gap-1 text-xs text-fluent-warning">
        <AlertTriangle size={12} />
        Requiere admin
        {result.freedMB > 0 && ` · −${formatSize(result.freedMB)}`}
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
      {`−${formatSize(result.freedMB)}`}
      {result.lockedFiles ? (
        <span className="text-fluent-textMuted">{` · ${result.lockedFiles} en uso`}</span>
      ) : null}
    </span>
  )
}
