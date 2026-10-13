import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Rocket, ShieldCheck, Sparkles } from 'lucide-react'
import { useAppStore } from '../../store/app.store'

/**
 * First-run welcome guide, shown while settings.onboardingDone is false.
 *
 * Three short steps in plain Spanish. Finishing it saves onboardingDone = true
 * and opens the Panel. Ajustes can set it back to false to show it again.
 */

const STEPS = [
  {
    icon: Sparkles,
    title: 'Bienvenido a NitroFlow',
    content: (
      <>
        <p>
          NitroFlow pone tu PC a punto sin que tengas que saber de informática. Te ayuda a:
        </p>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li>Liberar espacio borrando archivos temporales que ya no sirven.</li>
          <li>Elegir qué programas se abren al encender el PC.</li>
          <li>Entender con palabras sencillas qué se puede mejorar.</li>
        </ul>
      </>
    )
  },
  {
    icon: ShieldCheck,
    title: 'Es seguro',
    content: (
      <ul className="space-y-1.5 list-disc pl-5">
        <li>
          Antes de los cambios importantes crea un punto de restauración de Windows, por si algo sale mal.
        </li>
        <li>Nunca borra tus documentos, fotos ni vídeos.</li>
        <li>Casi todo se puede deshacer desde Historial.</li>
      </ul>
    )
  },
  {
    icon: Rocket,
    title: 'Cómo empezar',
    content: (
      <ol className="space-y-1.5 list-decimal pl-5">
        <li>Pulsa <strong className="text-fluent-text">«Analizar mi PC»</strong> en el Panel.</li>
        <li>Revisa lo que te propone NitroFlow.</li>
        <li>Pulsa <strong className="text-fluent-text">«Optimizar ahora»</strong>.</li>
      </ol>
    )
  }
]

export function Onboarding() {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const setPage = useAppStore((s) => s.setPage)
  const addNotification = useAppStore((s) => s.addNotification)

  const open = settings.onboardingDone === false
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const primaryBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Start from the first step every time the guide opens.
  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  // Move focus to the primary action for keyboard users.
  useEffect(() => {
    if (!open) return undefined
    const t = setTimeout(() => primaryBtnRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open, step])

  // Minimal focus trap. Escape is deliberately ignored: the guide stays
  // until the user finishes it with "Empezar".
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  const isLast = step === STEPS.length - 1
  const current = STEPS[step]
  const StepIcon = current.icon

  const finish = async () => {
    setSaving(true)
    try {
      await window.electronAPI?.saveSettings({ onboardingDone: true })
    } catch {
      addNotification({
        type: 'warning',
        message: 'No se pudo guardar la guía. Volverá a aparecer la próxima vez que abras NitroFlow.'
      })
    }
    // Read the latest settings: they may have changed while the guide was open.
    setSettings({ ...useAppStore.getState().settings, onboardingDone: true })
    setSaving(false)
    setPage('dashboard')
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        className="relative w-full max-w-md mx-4 bg-fluent-card border border-fluent-accent/40 rounded-fluentLg shadow-2xl shadow-black/50 p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors duration-200 ${
                  i <= step ? 'bg-fluent-accent' : 'bg-fluent-border'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-fluent-textMuted">
            Paso {step + 1} de {STEPS.length}
          </span>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-fluent shrink-0 text-fluent-accent bg-fluent-accent/15">
            <StepIcon size={22} />
          </div>
          <div className="min-w-0">
            <h2 id="onboarding-title" className="text-lg font-semibold text-fluent-text">
              {current.title}
            </h2>
            <div id="onboarding-body" className="text-sm text-fluent-textMuted mt-2 leading-relaxed">
              {current.content}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-6">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={saving}
              className="btn-secondary flex items-center gap-2"
            >
              <ArrowLeft size={15} />
              Atrás
            </button>
          ) : (
            <span />
          )}

          {isLast ? (
            <button
              ref={primaryBtnRef}
              onClick={finish}
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check size={15} />
              )}
              Empezar
            </button>
          ) : (
            <button
              ref={primaryBtnRef}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="btn-primary flex items-center gap-2"
            >
              Siguiente
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
