import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { Zap, Gamepad2, Scale, CheckCircle2, Loader2 } from 'lucide-react'
import type { PerformanceMode } from '../../../../shared/types'

interface ModeConfig {
  id: PerformanceMode
  label: string
  description: string
  features: string[]
  icon: React.ElementType
  accent: string
}

const MODES: ModeConfig[] = [
  {
    id: 'balanced',
    label: 'Equilibrado',
    description: 'Configuración predeterminada de Windows. Equilibrio entre rendimiento y consumo energético.',
    features: [
      'Plan de energía equilibrado',
      'Efectos visuales normales',
      'Latencia de red estándar',
      'Aceleración de red activa',
    ],
    icon: Scale,
    accent: 'border-blue-500/40 hover:border-blue-500/70',
  },
  {
    id: 'performance',
    label: 'Rendimiento',
    description: 'Maximiza el uso de la CPU y elimina limitaciones de consumo para extraer el 100% del hardware.',
    features: [
      'Plan de energía de alto rendimiento',
      'CPU al 100% mínimo (sin throttling)',
      'Efectos visuales mínimos',
      'Prioridad del sistema optimizada',
    ],
    icon: Zap,
    accent: 'border-yellow-500/40 hover:border-yellow-500/70',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    description: 'Todo lo anterior más optimizaciones de red para reducir el ping y la latencia en partidas online.',
    features: [
      'Algoritmo Nagle desactivado (menor ping)',
      'Aceleración de red deshabilitada',
      'Prioridad de scheduling alta para juegos',
      'Xbox Game DVR desactivado',
      'Windows Game Mode activado',
    ],
    icon: Gamepad2,
    accent: 'border-green-500/40 hover:border-green-500/70',
  },
]

export function Optimizer() {
  const { optimizerMode, setOptimizerMode, addNotification, setLoading, loading } = useAppStore()
  const [applying, setApplying] = useState<PerformanceMode | null>(null)

  const isLoading = loading['optimizer']

  useEffect(() => {
    window.electronAPI?.getOptimizerStatus().then((status: unknown) => {
      const s = status as { currentMode: PerformanceMode } | null
      if (s?.currentMode) setOptimizerMode(s.currentMode)
    })
  }, [])

  const handleApply = async (mode: PerformanceMode) => {
    if (mode === optimizerMode) return
    setApplying(mode)
    setLoading('optimizer', true)
    try {
      const result = await window.electronAPI?.setOptimizerMode(mode) as { success: boolean; error?: string }
      if (result?.success) {
        setOptimizerMode(mode)
        addNotification({ type: 'success', message: `Modo "${mode}" activado` })
      } else {
        addNotification({ type: 'error', message: result?.error ?? 'Error al aplicar modo' })
      }
    } finally {
      setApplying(null)
      setLoading('optimizer', false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fluent-text">Optimizador de rendimiento</h1>
        <p className="text-fluent-textMuted text-sm mt-1">
          Selecciona el modo que mejor se adapte a lo que estás haciendo. Los cambios son reversibles.
        </p>
      </div>

      {/* Mode cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MODES.map((mode) => {
          const Icon = mode.icon
          const isActive = optimizerMode === mode.id
          const isApplying = applying === mode.id

          return (
            <div
              key={mode.id}
              className={`card border-2 transition-all duration-200 flex flex-col gap-4 ${
                isActive
                  ? mode.accent.replace('hover:', '') + ' bg-fluent-card'
                  : `border-fluent-border ${mode.accent}`
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-fluent ${
                      isActive ? 'bg-fluent-accent/20' : 'bg-fluent-surface'
                    }`}
                  >
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
              </div>

              {/* Description */}
              <p className="text-xs text-fluent-textMuted leading-relaxed">{mode.description}</p>

              {/* Feature list */}
              <ul className="space-y-1.5 flex-1">
                {mode.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-fluent-text">
                    <span className="mt-0.5 text-fluent-accent shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Action button */}
              <button
                onClick={() => handleApply(mode.id)}
                disabled={isActive || isLoading}
                className={`w-full py-2 rounded-fluent text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  isActive
                    ? 'bg-fluent-accent/20 text-fluent-accent cursor-default'
                    : 'btn-primary'
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
                ) : (
                  'Activar'
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Info note */}
      <div className="card bg-fluent-accent/5 border border-fluent-accent/20 text-xs text-fluent-textMuted space-y-1">
        <p className="font-medium text-fluent-text">ℹ️ Información importante</p>
        <p>
          Los modos <strong>Rendimiento</strong> y <strong>Gaming</strong> modifican el registro de Windows y el plan
          de energía. Puedes volver al modo Equilibrado en cualquier momento para revertir los cambios.
        </p>
        <p>
          El modo <strong>Gaming</strong> desactiva el algoritmo de Nagle en las interfaces de red, lo que puede
          reducir el ping en juegos online. El efecto varía según tu hardware y proveedor de internet.
        </p>
      </div>
    </div>
  )
}
