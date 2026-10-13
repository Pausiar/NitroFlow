import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { Save, Eye, EyeOff, Info, BookOpen } from 'lucide-react'
import type { AppSettings } from '../../../../shared/types'

const AI_MODELS = [
  { value: 'meta/llama-3.1-8b-instruct', label: 'Meta Llama 3.1 8B Instruct' },
  { value: 'meta/llama-3.1-70b-instruct', label: 'Meta Llama 3.1 70B Instruct' },
  { value: 'mistral/mistral-7b-instruct-v0.3', label: 'Mistral 7B Instruct v0.3' },
  { value: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'NVIDIA Llama 3.1 Nemotron 70B' },
]

export function Settings() {
  const { settings, setSettings, addNotification } = useAppStore()
  const [local, setLocal] = useState<AppSettings>(settings)
  const [showKey, setShowKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      if (s) {
        const loaded = s as AppSettings
        setSettings(loaded)
        setLocal(loaded)
      }
    })
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // The welcome-guide flag is owned by the store (see showGuideAgain), so
      // a stale copy in this form must not overwrite it.
      const toSave: AppSettings = {
        ...local,
        onboardingDone: useAppStore.getState().settings.onboardingDone
      }
      const result = (await window.electronAPI?.saveSettings(toSave)) as
        | { success?: boolean }
        | undefined
      if (result?.success === false) throw new Error('save failed')
      setSettings(toSave)
      addNotification({ type: 'success', message: 'Configuración guardada correctamente' })
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al guardar configuración' })
    } finally {
      setIsSaving(false)
    }
  }

  /** Re-opens the welcome guide right away (saved immediately, like the guide itself). */
  const showGuideAgain = async () => {
    try {
      await window.electronAPI?.saveSettings({ onboardingDone: false })
      setSettings({ ...useAppStore.getState().settings, onboardingDone: false })
    } catch {
      addNotification({ type: 'error', message: 'No se pudo abrir la guía de bienvenida' })
    }
  }

  const update = (key: keyof AppSettings, value: unknown) => {
    setLocal((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-fluent-text">Configuración</h1>
        <p className="text-fluent-textMuted text-sm mt-1">Personaliza el comportamiento de NitroFlow</p>
      </div>

      {/* AI Settings */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fluent-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fluent-accent" />
          Asistente IA (NVIDIA NIM)
        </h2>

        <div className="space-y-1">
          <label className="text-sm text-fluent-textMuted">Clave de API de NVIDIA (opcional)</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={local.nvidiaApiKey}
              onChange={(e) => update('nvidiaApiKey', e.target.value)}
              placeholder="nvapi-…"
              className="w-full bg-fluent-surface border border-fluent-border rounded-fluent py-2 px-3 pr-10 text-sm text-fluent-text placeholder:text-fluent-textMuted focus:outline-none focus:border-fluent-accent"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fluent-textMuted hover:text-fluent-text"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-fluent-textMuted flex items-center gap-1">
            <Info size={11} />
            Solo es necesaria para el Asistente IA. Puedes conseguir una clave gratis en{' '}
            <a
              href="https://build.nvidia.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fluent-accent underline"
            >
              build.nvidia.com
            </a>
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-fluent-textMuted">Modelo de IA</label>
          <select
            value={local.aiModel}
            onChange={(e) => update('aiModel', e.target.value)}
            className="w-full bg-fluent-surface border border-fluent-border rounded-fluent py-2 px-3 text-sm text-fluent-text focus:outline-none focus:border-fluent-accent"
          >
            {AI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Monitoring */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fluent-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fluent-info" />
          Actualización de datos
        </h2>

        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm text-fluent-text">Actualizar datos automáticamente</p>
            <p className="text-xs text-fluent-textMuted">Refresca las cifras del Panel en segundo plano</p>
          </div>
          <ToggleSwitch checked={local.autoMonitor} onChange={(v) => update('autoMonitor', v)} />
        </label>

        {local.autoMonitor && (
          <div className="space-y-1">
            <label className="text-sm text-fluent-textMuted">
              Cada cuánto se actualiza: {local.monitorIntervalSeconds} s
            </label>
            <input
              type="range"
              min={1}
              max={30}
              value={local.monitorIntervalSeconds}
              onChange={(e) => update('monitorIntervalSeconds', Number(e.target.value))}
              className="w-full accent-fluent-accent"
            />
          </div>
        )}

        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm text-fluent-text">Notificaciones</p>
            <p className="text-xs text-fluent-textMuted">Muestra avisos sobre el estado del PC</p>
          </div>
          <ToggleSwitch checked={local.notifications} onChange={(v) => update('notifications', v)} />
        </label>
      </div>

      {/* Safety */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fluent-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fluent-success" />
          Seguridad
        </h2>

        <label className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-fluent-text">Crear punto de restauración antes de cambios importantes</p>
            <p className="text-xs text-fluent-textMuted">
              Si algo sale mal, Windows puede volver a como estaba. Recomendado.
            </p>
          </div>
          <ToggleSwitch
            checked={local.createRestorePoints}
            onChange={(v) => update('createRestorePoints', v)}
          />
        </label>
      </div>

      {/* Advanced mode */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fluent-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fluent-warning" />
          Modo avanzado
        </h2>

        <label className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-fluent-text">Activar modo avanzado</p>
            <p className="text-xs text-fluent-textMuted">
              Muestra herramientas para usuarios expertos: registro, procesos y servicios
            </p>
          </div>
          <ToggleSwitch checked={local.advancedMode} onChange={(v) => update('advancedMode', v)} />
        </label>

        <p className="text-xs text-fluent-textMuted">
          Si no sabes qué es, déjalo desactivado.
        </p>
      </div>

      {/* Welcome guide */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-fluent-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fluent-accent" />
          Ayuda
        </h2>
        <p className="text-xs text-fluent-textMuted">
          Vuelve a ver los pasos iniciales para aprender a usar NitroFlow.
        </p>
        <button onClick={showGuideAgain} className="btn-secondary flex items-center gap-2">
          <BookOpen size={15} />
          Ver la guía de bienvenida otra vez
        </button>
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={isSaving} className="btn-primary flex items-center gap-2">
        <Save size={15} />
        {isSaving ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-10 h-6 rounded-full transition-colors duration-200 overflow-hidden ${
        checked ? 'bg-fluent-accent' : 'bg-fluent-border'
      }`}
    >
      <span
        className={`absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
