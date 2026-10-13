import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import {
  Zap,
  Gamepad2,
  Scale,
  CheckCircle2,
  Loader2,
  Star,
  AlertTriangle,
  Undo2,
  Info
} from 'lucide-react'
import type { PerformanceMode, OptimizerStatus, OptimizerApplyResult } from '../../../../shared/types'

interface ModeConfig {
  id: PerformanceMode
  label: string
  goodFor: string
  description: string
  changes: string[]
  effect: string
  icon: React.ElementType
  accent: string
  activeAccent: string
}

const MODES: ModeConfig[] = [
  {
    id: 'balanced',
    label: 'Equilibrado',
    goodFor: 'Para el día a día y portátiles: menos consumo y ruido',
    description:
      'Deja Windows como lo tenías antes de usar NitroFlow. Es la mejor opción para navegar, ofimática, vídeos y para portátiles con batería.',
    changes: [
      'Vuelve a tu plan de energía de siempre',
      'Restaura exactamente tus ajustes anteriores',
      'Menos calor, ruido de ventiladores y consumo'
    ],
    effect: 'Deshace todos los cambios de los otros modos.',
    icon: Scale,
    accent: 'hover:border-blue-500/70',
    activeAccent: 'border-blue-500/70'
  },
  {
    id: 'performance',
    label: 'Rendimiento',
    goodFor: 'Para trabajo pesado: edición de vídeo, renderizado, programación…',
    description:
      'Usa el plan de energía "Alto rendimiento" de Windows para que el procesador no baje de velocidad y responda al instante.',
    changes: [
      'Activa el plan "Alto rendimiento" (tu plan no se modifica)',
      'Procesador siempre a máxima velocidad (solo PC de sobremesa)',
      'Menos efectos visuales y más prioridad a lo que usas'
    ],
    effect:
      'Mejora la respuesta en tareas largas. No hace milagros: el equipo consumirá más y puede hacer más ruido.',
    icon: Zap,
    accent: 'hover:border-yellow-500/70',
    activeAccent: 'border-yellow-500/70'
  },
  {
    id: 'gaming',
    label: 'Juegos',
    goodFor: 'Para jugar',
    description:
      'Todo lo de Rendimiento más ajustes pensados para juegos: Windows da prioridad al juego mientras juegas.',
    changes: [
      'Todo lo del modo Rendimiento',
      'Activa el Modo Juego de Windows',
      'Desactiva la grabación en segundo plano de Xbox',
      'Más prioridad a los juegos y sin límite de red multimedia'
    ],
    effect:
      'Puede dar algunos FPS más estables en equipos ajustados. En PCs potentes la diferencia suele ser pequeña.',
    icon: Gamepad2,
    accent: 'hover:border-green-500/70',
    activeAccent: 'border-green-500/70'
  }
]

const LABEL: Record<PerformanceMode, string> = {
  balanced: 'Equilibrado',
  performance: 'Rendimiento',
  gaming: 'Juegos'
}

export function Optimizer() {
  const { optimizerMode, setOptimizerMode, addNotification, setLoading, loading, requestConfirm } =
    useAppStore()
  const [applying, setApplying] = useState<PerformanceMode | null>(null)
  const [status, setStatus] = useState<OptimizerStatus | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const isLoading = loading['optimizer']
  const isLaptop = status?.isLaptop
  const recommended: PerformanceMode | null =
    isLaptop === undefined ? null : isLaptop ? 'balanced' : 'performance'

  const loadStatus = async (): Promise<OptimizerStatus | null> => {
    const s = (await window.electronAPI?.getOptimizerStatus()) as OptimizerStatus | null
    if (s?.currentMode) {
      setStatus(s)
      setOptimizerMode(s.currentMode)
    }
    return s ?? null
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    loadStatus().then((s) => {
      // Laptop detection runs in the background the first time: ask again shortly.
      if (s && s.isLaptop === undefined) timer = setTimeout(() => void loadStatus(), 2500)
    })
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [])

  const handleApply = async (mode: PerformanceMode) => {
    if (mode === optimizerMode) return

    if (mode !== 'balanced') {
      const laptopNote =
        isLaptop === true
          ? ' Tu equipo es un portátil: gastará más batería y puede calentarse más; úsalo enchufado.'
          : ''
      const confirmed = await requestConfirm({
        title: `¿Activar el modo ${LABEL[mode]}?`,
        description:
          'NitroFlow guardará primero tu configuración actual. El equipo consumirá más energía y puede hacer más ruido.' +
          laptopNote +
          ' Puedes deshacerlo todo cuando quieras con el modo Equilibrado.',
        confirmLabel: 'Activar',
        variant: 'info'
      })
      if (!confirmed) return
    }

    setApplying(mode)
    setLoading('optimizer', true)
    setWarnings([])
    try {
      const result = (await window.electronAPI?.setOptimizerMode(mode)) as OptimizerApplyResult | undefined
      if (result?.success) {
        setOptimizerMode(mode)
        setWarnings(result.warnings ?? [])
        addNotification({
          type: result.warnings?.length ? 'warning' : 'success',
          message:
            mode === 'balanced'
              ? 'Modo Equilibrado activado: tu configuración original está restaurada'
              : `Modo ${LABEL[mode]} activado`
        })
      } else {
        setWarnings(result?.warnings ?? [])
        addNotification({ type: 'error', message: result?.error ?? 'No se pudo cambiar el modo' })
      }
      await loadStatus()
    } finally {
      setApplying(null)
      setLoading('optimizer', false)
    }
  }

  const appliedAt =
    status?.appliedAt && status.currentMode === optimizerMode
      ? new Date(status.appliedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
      : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fluent-text">Modo de rendimiento</h1>
        <p className="text-fluent-textMuted text-sm mt-1">
          Elige qué vas a hacer con el ordenador y NitroFlow ajusta Windows por ti. Todo se puede deshacer.
        </p>
        {appliedAt && optimizerMode !== 'balanced' && (
          <p className="text-xs text-fluent-textMuted mt-1">
            Modo {LABEL[optimizerMode]} activo desde el {appliedAt}.
          </p>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="card border border-fluent-warning/40 bg-fluent-warning/5 space-y-1.5">
          <p className="text-sm font-medium text-fluent-text flex items-center gap-2">
            <AlertTriangle size={16} className="text-fluent-warning" />
            Algunos ajustes no se pudieron aplicar
          </p>
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w} className="text-xs text-fluent-textMuted">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mode cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MODES.map((mode) => {
          const Icon = mode.icon
          const isActive = optimizerMode === mode.id
          const isApplying = applying === mode.id
          const isRecommended = recommended === mode.id

          return (
            <div
              key={mode.id}
              className={`card border-2 transition-all duration-200 flex flex-col gap-4 ${
                isActive ? `${mode.activeAccent} bg-fluent-card` : `border-fluent-border ${mode.accent}`
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-fluent ${isActive ? 'bg-fluent-accent/20' : 'bg-fluent-surface'}`}>
                    <Icon size={20} className={isActive ? 'text-fluent-accent' : 'text-fluent-textMuted'} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-fluent-text">{mode.label}</h3>
                    {isActive && (
                      <span className="text-xs text-fluent-accent font-medium flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Activo
                      </span>
                    )}
                  </div>
                </div>
                {isRecommended && (
                  <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-fluent-success/15 text-fluent-success flex items-center gap-1">
                    <Star size={11} />
                    Recomendado para tu equipo
                  </span>
                )}
              </div>

              {/* What it's for */}
              <p className="text-sm font-medium text-fluent-text">{mode.goodFor}</p>
              <p className="text-xs text-fluent-textMuted leading-relaxed">{mode.description}</p>

              {/* What changes */}
              <ul className="space-y-1.5 flex-1">
                {mode.changes.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-fluent-text">
                    <CheckCircle2 size={12} className="mt-0.5 text-fluent-accent shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Honest expected effect */}
              <p className="text-xs text-fluent-textMuted bg-fluent-surface rounded-fluent px-3 py-2">
                <span className="font-medium text-fluent-text">Qué notarás: </span>
                {mode.effect}
              </p>

              {mode.id !== 'balanced' && isLaptop === true && (
                <p className="text-xs text-fluent-warning flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  En portátiles gasta más batería y calienta más. Úsalo solo enchufado.
                </p>
              )}

              {/* Action button */}
              <button
                onClick={() => handleApply(mode.id)}
                disabled={isActive || isLoading}
                className={`w-full py-2 rounded-fluent text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  isActive ? 'bg-fluent-accent/20 text-fluent-accent cursor-default' : 'btn-primary'
                }`}
              >
                {isApplying ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Aplicando…
                  </>
                ) : isActive ? (
                  <>
                    <CheckCircle2 size={14} />
                    Modo actual
                  </>
                ) : mode.id === 'balanced' ? (
                  <>
                    <Undo2 size={14} />
                    Volver a Equilibrado
                  </>
                ) : (
                  'Activar'
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Info note */}
      <div className="card bg-fluent-accent/5 border border-fluent-accent/20 text-xs text-fluent-textMuted space-y-1.5">
        <p className="font-medium text-fluent-text flex items-center gap-2">
          <Info size={14} className="text-fluent-accent" />
          Sin riesgos
        </p>
        <p>
          Antes de activar <strong>Rendimiento</strong> o <strong>Juegos</strong>, NitroFlow guarda una copia de tu
          configuración actual. <strong>Equilibrado deshace todos los cambios de NitroFlow</strong> y deja tu plan
          de energía y tus ajustes exactamente como estaban.
        </p>
        <p>
          NitroFlow no modifica tu plan de energía personal: usa el plan "Alto rendimiento" de Windows (o crea una
          copia que se elimina al volver a Equilibrado).
        </p>
      </div>
    </div>
  )
}
