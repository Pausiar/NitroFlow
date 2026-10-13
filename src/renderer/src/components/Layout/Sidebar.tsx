import { useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import {
  LayoutDashboard,
  Trash2,
  Cpu,
  Database,
  Rocket,
  Bot,
  Zap,
  Settings,
  Clock,
  KeyRound
} from 'lucide-react'
import { BrandLogo } from './BrandLogo'

const navItems = [
  { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
  { id: 'cleanup', label: 'Limpieza', icon: Trash2 },
  { id: 'startup', label: 'Programas de inicio', icon: Rocket },
  { id: 'optimizer', label: 'Rendimiento', icon: Zap },
  { id: 'ai', label: 'Asistente IA', icon: Bot },
] as const

/** Expert pages: only shown when "Modo avanzado" is enabled in Ajustes. */
const advancedNavItems = [
  { id: 'processes', label: 'Procesos', icon: Cpu },
  { id: 'registry', label: 'Registro', icon: Database },
] as const

const advancedPageIds: string[] = advancedNavItems.map((item) => item.id)

const bottomItems = [
  { id: 'license', label: 'Licencia', icon: KeyRound },
  { id: 'history', label: 'Historial', icon: Clock },
  { id: 'settings', label: 'Ajustes', icon: Settings },
] as const

export function Sidebar() {
  const { currentPage, setPage, settings } = useAppStore()
  const planLabel = settings.licensePlan === 'pro' ? 'Pro activo' : settings.licensePlan === 'free' ? 'Free activo' : 'Sin iniciar sesion'
  const advancedMode = settings.advancedMode

  // If expert mode is turned off while an expert page is open, leave it.
  useEffect(() => {
    if (!advancedMode && advancedPageIds.includes(currentPage)) {
      setPage('dashboard')
    }
  }, [advancedMode, currentPage, setPage])

  const navButtonClass = (active: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2.5 rounded-fluent text-sm font-medium transition-all duration-150 ${
      active
        ? 'bg-fluent-accent text-white'
        : 'text-fluent-textMuted hover:text-fluent-text hover:bg-fluent-card'
    }`

  return (
    <aside className="w-56 flex-shrink-0 bg-fluent-surface border-r border-fluent-border flex flex-col py-2">
      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={navButtonClass(currentPage === id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}

        {advancedMode && (
          <>
            <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fluent-textMuted">
              Avanzado
            </p>
            {advancedNavItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPage(id)}
                className={navButtonClass(currentPage === id)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="px-2 space-y-0.5 border-t border-fluent-border pt-2 mt-2">
        {bottomItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={navButtonClass(currentPage === id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}

        <div className="mt-3 px-3 py-2 rounded-fluent bg-fluent-card border border-fluent-border">
          <BrandLogo size={18} compact />
          <p className="mt-1 text-[11px] text-fluent-textMuted">{planLabel}</p>
        </div>
      </div>
    </aside>
  )
}
