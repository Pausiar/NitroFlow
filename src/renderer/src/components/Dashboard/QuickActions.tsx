import { useAppStore } from '../../store/app.store'
import { Trash2, Database, Rocket, Bot, Zap } from 'lucide-react'

export function QuickActions() {
  const { setPage } = useAppStore()

  const actions = [
    {
      icon: Trash2,
      label: 'Limpiar sistema',
      desc: 'Archivos temporales y caché',
      page: 'cleanup' as const,
      color: 'text-orange-400'
    },
    {
      icon: Database,
      label: 'Optimizar registro',
      desc: 'Entradas huérfanas',
      page: 'registry' as const,
      color: 'text-purple-400'
    },
    {
      icon: Rocket,
      label: 'Gestionar inicio',
      desc: 'Programas en arranque',
      page: 'startup' as const,
      color: 'text-blue-400'
    },
    {
      icon: Bot,
      label: 'Diagnóstico IA',
      desc: 'Análisis inteligente',
      page: 'ai' as const,
      color: 'text-green-400'
    }
  ]

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Zap size={16} className="text-fluent-accent" />
        <h3 className="text-sm font-semibold text-fluent-textMuted uppercase tracking-wide">
          Acciones rápidas
        </h3>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {actions.map(({ icon: Icon, label, desc, page, color }) => (
          <button
            key={page}
            onClick={() => setPage(page)}
            className="flex flex-col items-center gap-2 p-4 bg-fluent-surface hover:bg-fluent-border rounded-fluentLg transition-colors text-center"
          >
            <Icon size={22} className={color} />
            <span className="text-sm font-medium text-fluent-text">{label}</span>
            <span className="text-xs text-fluent-textMuted">{desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
