import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { useAppStore } from '../../store/app.store'
import type { AppSettings, LicenseStatus } from '../../../../shared/types'

export function License() {
  const { settings, setSettings, addNotification } = useAppStore()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setToken(settings.licenseToken)
  }, [settings.licenseToken])

  const refreshSettings = async () => {
    const next = await window.electronAPI?.getSettings()
    if (next) setSettings(next as AppSettings)
  }

  const handleVerify = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI?.verifyLicense(token) as LicenseStatus
      await refreshSettings()

      if (result.success) {
        addNotification({
          type: 'success',
          message: result.plan === 'pro' ? 'Licencia Pro activada' : 'Plan Free activado'
        })
      } else {
        addNotification({ type: 'error', message: result.error ?? 'Licencia no valida' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await window.electronAPI?.logoutLicense()
    setToken('')
    await refreshSettings()
    addNotification({ type: 'info', message: 'Sesion cerrada' })
  }

  const isLoggedIn = Boolean(settings.licenseToken && settings.licensePlan)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-fluent-text">Licencia NitroFlow</h1>
        <p className="text-fluent-textMuted text-sm mt-1">
          Inicia sesion con tu token de escritorio para sincronizar el plan Free o Pro.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-fluent bg-fluent-accent/15 text-fluent-accent">
            {isLoggedIn ? <ShieldCheck size={22} /> : <KeyRound size={22} />}
          </div>
          <div>
            <h2 className="font-semibold text-fluent-text">
              {isLoggedIn ? `Plan ${settings.licensePlan?.toUpperCase()}` : 'Sin sesion'}
            </h2>
            <p className="text-sm text-fluent-textMuted mt-1">
              {settings.licenseEmail || 'Pega el token generado desde tu panel web de NitroFlow.'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-fluent-textMuted">Token de escritorio</label>
          <textarea
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Pega aqui el token de licencia"
            rows={4}
            className="w-full resize-none bg-fluent-surface border border-fluent-border rounded-fluent py-2 px-3 text-sm text-fluent-text placeholder:text-fluent-textMuted focus:outline-none focus:border-fluent-accent"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={handleVerify} disabled={loading || !token.trim()} className="btn-primary flex items-center gap-2">
            <CheckCircle2 size={15} />
            {loading ? 'Verificando...' : 'Iniciar sesion'}
          </button>
          {isLoggedIn && (
            <button onClick={handleLogout} className="btn-secondary flex items-center gap-2">
              <LogOut size={15} />
              Cerrar sesion
            </button>
          )}
          <a
            href={`${settings.webApiBaseUrl}/dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <ExternalLink size={15} />
            Abrir panel web
          </a>
        </div>
      </div>

      <div className="card bg-fluent-accent/5 border border-fluent-accent/20 text-sm text-fluent-textMuted">
        Entra en el panel web con Google, copia el token de escritorio y pegalo aqui. La app llama a la API
        de NitroFlow para confirmar email y plan.
      </div>
    </div>
  )
}
