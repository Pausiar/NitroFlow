import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { Save, Eye, EyeOff, Info } from 'lucide-react'
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
      await window.electronAPI?.saveSettings(local)
      setSettings(local)
      addNotification({ type: 'success', message: 'Configuración guardada correctamente' })
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al guardar configuración' })
    } finally {
      setIsSaving(false)
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
          Módulo de Inteligencia Artificial (NVIDIA NIM)
        </h2>

        <div className="space-y-1">
          <label className="text-sm text-fluent-textMuted">API Key de NVIDIA NIM</label>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-fluent-textMuted hover:text-fluent-text"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-fluent-textMuted flex items-center gap-1">
            <Info size={11} />
            Obtén tu clave gratuita en{' '}
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

      {/* Optimization Profile */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fluent-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fluent-success" />
          Perfil de optimización
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {(['quick', 'deep', 'custom'] as const).map((profile) => {
            const labels = { quick: 'Rápido', deep: 'Profundo', custom: 'Personalizado' }
            const descs = {
              quick: 'Limpieza básica y rápida',
              deep: 'Análisis y limpieza exhaustiva',
              custom: 'Configura cada opción'
            }
            return (
              <button
                key={profile}
                onClick={() => update('optimizationProfile', profile)}
                className={`p-3 rounded-fluentLg border text-left transition-colors ${
                  local.optimizationProfile === profile
                    ? 'border-fluent-accent bg-fluent-accent/10'
                    : 'border-fluent-border hover:border-fluent-textMuted'
                }`}
              >
                <p className="text-sm font-medium text-fluent-text">{labels[profile]}</p>
                <p className="text-xs text-fluent-textMuted mt-0.5">{descs[profile]}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Monitoring */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fluent-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fluent-info" />
          Monitorización
        </h2>

        <label className="flex items-center justify-between">
          <div>
            <p className="text-sm text-fluent-text">Monitorización automática</p>
            <p className="text-xs text-fluent-textMuted">Actualiza métricas en segundo plano</p>
          </div>
          <ToggleSwitch checked={local.autoMonitor} onChange={(v) => update('autoMonitor', v)} />
        </label>

        {local.autoMonitor && (
          <div className="space-y-1">
            <label className="text-sm text-fluent-textMuted">
              Intervalo de actualización: {local.monitorIntervalSeconds}s
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
            <p className="text-xs text-fluent-textMuted">Muestra alertas sobre el estado del sistema</p>
          </div>
          <ToggleSwitch checked={local.notifications} onChange={(v) => update('notifications', v)} />
        </label>
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
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors duration-200 overflow-hidden ${
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
