import { useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info
}

const colors = {
  success: 'border-l-fluent-success text-fluent-success',
  error: 'border-l-fluent-error text-fluent-error',
  warning: 'border-l-fluent-warning text-fluent-warning',
  info: 'border-l-fluent-info text-fluent-info'
}

export function NotificationStack() {
  const { notifications, removeNotification } = useAppStore()

  useEffect(() => {
    if (notifications.length === 0) return
    const latest = notifications[notifications.length - 1]
    const timer = setTimeout(() => removeNotification(latest.id), 5000)
    return () => clearTimeout(timer)
  }, [notifications])

  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((n) => {
        const Icon = icons[n.type]
        return (
          <div
            key={n.id}
            className={`flex items-start gap-3 bg-fluent-card border border-fluent-border border-l-4 ${colors[n.type]} rounded-fluent p-3 shadow-fluentLg animate-fade-in`}
          >
            <Icon size={16} className="mt-0.5 flex-shrink-0" />
            <p className="text-sm text-fluent-text flex-1">{n.message}</p>
            <button
              onClick={() => removeNotification(n.id)}
              className="text-fluent-textMuted hover:text-fluent-text"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
