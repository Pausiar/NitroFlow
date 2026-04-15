import { useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { RotateCcw, CheckCircle, XCircle } from 'lucide-react'

export function History() {
  const { actionHistory, setActionHistory, addNotification } = useAppStore()

  useEffect(() => {
    window.electronAPI?.getHistory().then((h) => {
      if (Array.isArray(h)) setActionHistory(h as never)
    })
  }, [])

  const handleUndo = async (id: string) => {
    const result = await window.electronAPI?.undoAction(id) as { success: boolean; error?: string }
    if (result?.success) {
      addNotification({ type: 'success', message: 'Acción deshecha correctamente' })
      window.electronAPI?.getHistory().then((h) => {
        if (Array.isArray(h)) setActionHistory(h as never)
      })
    } else {
      addNotification({ type: 'error', message: result?.error ?? 'No se pudo deshacer' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-fluent-text">Historial de acciones</h1>
        <p className="text-fluent-textMuted text-sm mt-1">Registro de todas las operaciones realizadas</p>
      </div>

      {actionHistory.length === 0 ? (
        <div className="card text-center py-12 text-fluent-textMuted">
          No hay acciones registradas todavía
        </div>
      ) : (
        <div className="space-y-2">
          {actionHistory.map((action) => (
            <div key={action.id} className={`card flex items-center gap-4 ${action.undone ? 'opacity-50' : ''}`}>
              <div className="flex-shrink-0">
                {action.undone ? (
                  <XCircle size={18} className="text-fluent-textMuted" />
                ) : (
                  <CheckCircle size={18} className="text-fluent-success" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-fluent-text truncate">{action.description}</p>
                <p className="text-xs text-fluent-textMuted mt-0.5">
                  {new Date(action.timestamp).toLocaleString()} · {action.type}
                  {action.undone && ' · Deshecha'}
                </p>
              </div>
              {action.reversible && !action.undone && (
                <button
                  onClick={() => handleUndo(action.id)}
                  className="btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0"
                >
                  <RotateCcw size={12} />
                  Deshacer
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
