import { useAppStore } from '../../store/app.store'
import {
  LayoutDashboard,
  Trash2,
  Cpu,
  Database,
  Rocket,
  Bot,
  Settings,
  Clock
} from 'lucide-react'

const navItems = [
  { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
  { id: 'cleanup', label: 'Limpieza', icon: Trash2 },
  { id: 'processes', label: 'Procesos', icon: Cpu },
  { id: 'registry', label: 'Registro', icon: Database },
  { id: 'startup', label: 'Inicio', icon: Rocket },
  { id: 'ai', label: 'Asistente IA', icon: Bot },
] as const

const bottomItems = [
  { id: 'history', label: 'Historial', icon: Clock },
  { id: 'settings', label: 'Ajustes', icon: Settings },
] as const

export function Sidebar() {
  const { currentPage, setPage } = useAppStore()

  return (
    <aside className="w-56 flex-shrink-0 bg-fluent-surface border-r border-fluent-border flex flex-col py-2">
      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-fluent text-sm font-medium transition-all duration-150 ${
              currentPage === id
                ? 'bg-fluent-accent text-white'
                : 'text-fluent-textMuted hover:text-fluent-text hover:bg-fluent-card'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="px-2 space-y-0.5 border-t border-fluent-border pt-2 mt-2">
        {bottomItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-fluent text-sm font-medium transition-all duration-150 ${
              currentPage === id
                ? 'bg-fluent-accent text-white'
                : 'text-fluent-textMuted hover:text-fluent-text hover:bg-fluent-card'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </aside>
  )
}
