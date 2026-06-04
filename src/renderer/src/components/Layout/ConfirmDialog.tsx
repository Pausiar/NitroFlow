import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react'
import { useAppStore } from '../../store/app.store'

/**
 * Global, NitroFlow-styled confirmation modal.
 *
 * Rendered once at the app root. Any component can trigger it via
 * `useAppStore().requestConfirm({ ... })`, which resolves to a boolean.
 * Replaces native `window.confirm`/`alert` dialogs so confirmations match
 * the app's premium dark + electric-blue look.
 */
export function ConfirmDialog() {
  const confirmDialog = useAppStore((s) => s.confirmDialog)
  const resolveConfirm = useAppStore((s) => s.resolveConfirm)
  const [working, setWorking] = useState(false)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reset the loading state whenever a new dialog opens.
  useEffect(() => {
    setWorking(false)
    if (confirmDialog) {
      // Move focus to the primary action for keyboard users.
      const t = setTimeout(() => confirmBtnRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
    return undefined
  }, [confirmDialog])

  useEffect(() => {
    if (!confirmDialog) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        resolveConfirm(false)
      }
      if (event.key === 'Tab') {
        // Minimal focus trap within the dialog.
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
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmDialog, resolveConfirm])

  if (!confirmDialog) return null

  const { title, description, confirmLabel, cancelLabel, variant = 'info' } = confirmDialog

  const accent = {
    danger: { ring: 'border-red-500/40', icon: 'text-red-400 bg-red-500/15', Icon: ShieldAlert },
    warning: { ring: 'border-yellow-500/40', icon: 'text-yellow-400 bg-yellow-500/15', Icon: AlertTriangle },
    info: { ring: 'border-fluent-accent/40', icon: 'text-fluent-accent bg-fluent-accent/15', Icon: Info }
  }[variant]

  const confirmBtnClass =
    variant === 'danger'
      ? 'btn-danger'
      : variant === 'warning'
        ? 'bg-yellow-500 hover:bg-yellow-400 text-black font-medium px-4 py-2 rounded-fluent transition-colors duration-150'
        : 'btn-primary'

  const handleConfirm = () => {
    setWorking(true)
    // Allow the spinner to paint before the (possibly sync) resolver runs.
    requestAnimationFrame(() => resolveConfirm(true))
  }

  const Icon = accent.Icon

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resolveConfirm(false)
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-desc' : undefined}
        className={`relative w-full max-w-md mx-4 bg-fluent-card border ${accent.ring} rounded-fluentLg shadow-2xl shadow-black/50 p-5`}
      >
        <button
          aria-label="Cerrar"
          onClick={() => resolveConfirm(false)}
          className="absolute top-3 right-3 text-fluent-textMuted hover:text-fluent-text titlebar-no-drag"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-fluent shrink-0 ${accent.icon}`}>
            <Icon size={22} />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-lg font-semibold text-fluent-text">
              {title}
            </h2>
            {description && (
              <p id="confirm-desc" className="text-sm text-fluent-textMuted mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => resolveConfirm(false)}
            disabled={working}
            className="btn-secondary"
          >
            {cancelLabel ?? 'Cancelar'}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            disabled={working}
            className={`${confirmBtnClass} flex items-center gap-2 disabled:opacity-60`}
          >
            {working && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {confirmLabel ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}
