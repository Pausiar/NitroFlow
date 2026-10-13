import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/app.store'
import {
  Sparkles,
  Search,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Loader2,
  History
} from 'lucide-react'
import type {
  HealthIssue,
  HealthReport,
  SmartFixId,
  SmartOptimizeResult,
  SmartProgress
} from '../../../../shared/types'

interface AppInfo {
  version: string
  isAdmin: boolean
  platform: string
}

// Kept at module level so they survive navigating between pages, but reset
// when the app restarts ("once per session").
let autoScanDone = false
let appInfoCache: AppInfo | null = null
let lastResult: SmartOptimizeResult | null = null

const severityStyle: Record<HealthIssue['severity'], { Icon: typeof Info; color: string; label: string }> = {
  critical: { Icon: AlertOctagon, color: 'text-fluent-error', label: 'Importante' },
  warning: { Icon: AlertTriangle, color: 'text-fluent-warning', label: 'Mejorable' },
  info: { Icon: Info, color: 'text-fluent-info', label: 'Consejo' }
}

function scoreColor(score: number): string {
  if (score >= 80) return '#30d158'
  if (score >= 50) return '#ffd60a'
  return '#ff453a'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excelente'
  if (score >= 80) return 'Bien'
  if (score >= 50) return 'Mejorable'
  return 'Necesita atención'
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`
  return `${Math.round(mb)} MB`
}

/** Circular 0-100 health indicator. */
function ScoreRing({ score, busy }: { score: number | null; busy: boolean }) {
  const size = 136
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const value = score ?? 0
  const color = score === null ? '#48484a' : scoreColor(value)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className={busy ? 'animate-pulse' : undefined}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#48484a" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {score === null ? (
          busy ? (
            <Loader2 size={28} className="text-fluent-accent animate-spin" />
          ) : (
            <span className="text-3xl font-bold text-fluent-textMuted">?</span>
          )
        ) : (
          <>
            <span className="text-4xl font-bold" style={{ color }}>
              {score}
            </span>
            <span className="text-[11px] text-fluent-textMuted uppercase tracking-wide">{scoreLabel(score)}</span>
          </>
        )}
      </div>
    </div>
  )
}

export function SmartOptimize() {
  const { healthReport, setHealthReport, setPage, requestConfirm, addNotification } = useAppStore()
  const [scanning, setScanning] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [progress, setProgress] = useState<SmartProgress | null>(null)
  const [result, setResult] = useState<SmartOptimizeResult | null>(lastResult)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(appInfoCache)
  const [selected, setSelected] = useState<Set<SmartFixId>>(new Set())

  // Pre-select the safe fixes whenever a new report arrives.
  useEffect(() => {
    if (!healthReport) return
    setSelected(
      new Set(
        healthReport.issues
          .filter((i) => i.fixId && i.autoFix)
          .map((i) => i.fixId as SmartFixId)
      )
    )
  }, [healthReport])

  const runScan = useCallback(async () => {
    setScanning(true)
    try {
      const report = (await window.electronAPI?.healthScan()) as HealthReport | null
      if (report) setHealthReport(report)
      else addNotification({ type: 'error', message: 'No se pudo analizar el PC. Inténtalo de nuevo.' })
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al analizar: ' + String(err) })
    } finally {
      setScanning(false)
    }
  }, [setHealthReport, addNotification])

  // First visit of the session: analyse automatically.
  useEffect(() => {
    if (!appInfoCache) {
      window.electronAPI
        ?.getAppInfo()
        .then((info) => {
          appInfoCache = info as AppInfo
          setAppInfo(appInfoCache)
        })
        .catch(() => undefined)
    }
    if (!autoScanDone) {
      autoScanDone = true
      void runScan()
    }
  }, [runScan])

  // Live progress while optimizing.
  useEffect(() => {
    const off = window.electronAPI?.onSmartProgress((p) => setProgress(p as SmartProgress))
    return () => off?.()
  }, [])

  const issues = healthReport?.issues ?? []
  const fixable = useMemo(() => issues.filter((i) => i.fixId), [issues])
  const advice = useMemo(() => issues.filter((i) => !i.fixId), [issues])
  const selectedIssues = fixable.filter((i) => selected.has(i.fixId as SmartFixId))

  const toggle = (id: SmartFixId) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleOptimize = async () => {
    if (selectedIssues.length === 0) return
    const steps = selectedIssues.map((i) => (i.fixLabel ?? i.title).toLowerCase()).join('; ')
    const confirmed = await requestConfirm({
      title: 'Optimizar ahora',
      description:
        `Vamos a: ${steps}. ` +
        'Antes crearemos un punto de restauración de Windows por seguridad. ' +
        'No se borrará ningún documento, foto ni archivo personal, y los programas de inicio se pueden volver a activar desde Historial.',
      confirmLabel: 'Optimizar',
      cancelLabel: 'Ahora no',
      variant: 'info'
    })
    if (!confirmed) return

    setOptimizing(true)
    setResult(null)
    setProgress({ step: 'Preparando…', percent: 0 })
    try {
      const res = (await window.electronAPI?.smartOptimize([...selected])) as
        | SmartOptimizeResult
        | { error: string }
        | undefined
      if (!res || 'error' in res) {
        addNotification({ type: 'error', message: res && 'error' in res ? res.error : 'No se pudo optimizar.' })
        return
      }
      lastResult = res
      setResult(res)
      // Refresh the score so the user sees the improvement.
      void runScan()
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al optimizar: ' + String(err) })
    } finally {
      setOptimizing(false)
      setProgress(null)
    }
  }

  const busy = scanning || optimizing
  const showAdminWarning = appInfo?.platform === 'win32' && appInfo.isAdmin === false

  return (
    <div className="space-y-4">
      {showAdminWarning && (
        <div className="flex items-start gap-3 p-3 rounded-fluentLg border border-yellow-500/40 bg-yellow-500/10">
          <ShieldAlert size={18} className="text-fluent-warning shrink-0 mt-0.5" />
          <p className="text-sm text-fluent-text">
            Algunas optimizaciones necesitan permisos de administrador.{' '}
            <span className="text-fluent-textMuted">
              Cierra NitroFlow y ábrelo con clic derecho &gt; "Ejecutar como administrador" para aprovecharlas todas.
            </span>
          </p>
        </div>
      )}

      {/* Hero */}
      <div className="card p-6 bg-gradient-to-br from-fluent-card to-fluent-surface">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ScoreRing score={healthReport && !scanning ? healthReport.score : null} busy={busy} />
          <div className="flex-1 min-w-0 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
              <Sparkles size={18} className="text-fluent-accent" />
              <h2 className="text-xl font-bold text-fluent-text">Optimización en 1 clic</h2>
            </div>
            <p className="text-fluent-textMuted text-sm leading-relaxed">
              {scanning
                ? 'Analizando tu PC… Esto tarda unos segundos.'
                : healthReport
                  ? healthReport.summary
                  : 'Analizamos tu PC y te decimos qué se puede mejorar, sin riesgos.'}
            </p>

            {optimizing && progress ? (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-fluent-textMuted mb-1.5">
                  <span>{progress.step}</span>
                  <span>{progress.percent}%</span>
                </div>
                <div className="h-2.5 bg-fluent-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-fluent-accent rounded-full transition-all duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-3">
                {healthReport && fixable.length > 0 ? (
                  <button
                    onClick={handleOptimize}
                    disabled={busy || selectedIssues.length === 0}
                    className="btn-primary text-base px-6 py-3 flex items-center gap-2 shadow-fluent"
                  >
                    <Sparkles size={18} />
                    Optimizar ahora
                  </button>
                ) : !healthReport ? (
                  <button
                    onClick={() => void runScan()}
                    disabled={busy}
                    className="btn-primary text-base px-6 py-3 flex items-center gap-2 shadow-fluent"
                  >
                    {scanning ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                    {scanning ? 'Analizando…' : 'Analizar mi PC'}
                  </button>
                ) : null}
                {healthReport && (
                  <button
                    onClick={() => void runScan()}
                    disabled={busy}
                    className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={scanning ? 'animate-spin' : undefined} />
                    Analizar de nuevo
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-fluent-textMuted mt-3 flex items-center justify-center md:justify-start gap-1.5">
              <ShieldCheck size={13} className="text-fluent-success" />
              Seguro: nunca borramos tus archivos personales.
            </p>
          </div>
        </div>
      </div>

      {/* Results of the last optimization */}
      {result && !optimizing && <ResultCard result={result} onHistory={() => setPage('history')} />}

      {/* Checklist */}
      {healthReport && !scanning && issues.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-fluent-textMuted mb-3 uppercase tracking-wide">
            Lo que hemos encontrado
          </h3>
          <ul className="space-y-2">
            {fixable.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                checked={selected.has(issue.fixId as SmartFixId)}
                disabled={busy}
                onToggle={() => toggle(issue.fixId as SmartFixId)}
                onView={issue.page ? () => setPage(issue.page!) : undefined}
              />
            ))}
            {advice.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                disabled={busy}
                onView={issue.page ? () => setPage(issue.page!) : undefined}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function IssueRow({
  issue,
  checked,
  disabled,
  onToggle,
  onView
}: {
  issue: HealthIssue
  checked?: boolean
  disabled: boolean
  onToggle?: () => void
  onView?: () => void
}) {
  const sev = severityStyle[issue.severity]
  const isFix = Boolean(onToggle)
  return (
    <li
      className={`flex items-start gap-3 p-3 rounded-fluent border transition-colors ${
        checked ? 'border-fluent-accent/50 bg-fluent-accent/10' : 'border-fluent-border bg-fluent-surface'
      }`}
    >
      {isFix ? (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={onToggle}
          aria-label={issue.fixLabel ?? issue.title}
          className="mt-1 w-4 h-4 accent-fluent-accent cursor-pointer shrink-0"
        />
      ) : (
        <sev.Icon size={16} className={`${sev.color} mt-0.5 shrink-0`} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {isFix && <sev.Icon size={14} className={sev.color} />}
          <span className="text-sm font-medium text-fluent-text">{issue.title}</span>
          {issue.benefit && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-fluent-success/15 text-fluent-success">
              {issue.benefit}
            </span>
          )}
        </div>
        <p className="text-xs text-fluent-textMuted mt-1 leading-relaxed">{issue.description}</p>
        {isFix && !issue.autoFix && (
          <p className="text-xs text-fluent-warning mt-1">
            No lo marcamos automáticamente: márcalo solo si estás seguro.
          </p>
        )}
      </div>
      {onView && (
        <button
          onClick={onView}
          disabled={disabled}
          className="text-xs text-fluent-accent hover:underline flex items-center gap-0.5 shrink-0 mt-0.5 disabled:opacity-50"
        >
          Ver <ChevronRight size={14} />
        </button>
      )}
    </li>
  )
}

function ResultCard({ result, onHistory }: { result: SmartOptimizeResult; onHistory: () => void }) {
  const startup = result.results.find((r) => r.fixId === 'startup_disable_recommended')
  const highlights: string[] = []
  if (result.freedMB > 0) highlights.push(`Se han liberado ${formatSize(result.freedMB)}`)
  if (startup?.success && startup.count) {
    highlights.push(
      startup.count === 1
        ? 'Se desactivó 1 programa de inicio'
        : `Se desactivaron ${startup.count} programas de inicio`
    )
  }
  const rp = result.restorePoint

  return (
    <div className="card border-fluent-success/40 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 size={18} className="text-fluent-success" />
        <h3 className="text-base font-semibold text-fluent-text">Optimización completada</h3>
      </div>

      {highlights.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {highlights.map((h) => (
            <span key={h} className="text-sm px-3 py-1 rounded-full bg-fluent-success/15 text-fluent-success font-medium">
              {h}
            </span>
          ))}
        </div>
      )}

      <ul className="space-y-1.5 text-sm">
        <li className="flex items-start gap-2">
          {rp.success ? (
            <ShieldCheck size={16} className="text-fluent-success shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert size={16} className="text-fluent-warning shrink-0 mt-0.5" />
          )}
          <span className="text-fluent-textMuted">
            {rp.success && !rp.skipped ? 'Punto de restauración creado.' : rp.message}
            {!rp.success && ' Solo se aplicaron cambios que no ponen en riesgo tus datos.'}
          </span>
        </li>
        {result.results.map((r) => (
          <li key={r.fixId} className="flex items-start gap-2">
            {r.success ? (
              <CheckCircle2 size={16} className="text-fluent-success shrink-0 mt-0.5" />
            ) : r.skipped ? (
              <Info size={16} className="text-fluent-info shrink-0 mt-0.5" />
            ) : (
              <XCircle size={16} className="text-fluent-error shrink-0 mt-0.5" />
            )}
            <span className="text-fluent-textMuted">{r.message}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onHistory}
        className="mt-3 text-xs text-fluent-accent hover:underline flex items-center gap-1"
      >
        <History size={13} />
        Todo lo que se puede deshacer está en Historial
      </button>
    </div>
  )
}
