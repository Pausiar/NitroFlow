import { useEffect } from 'react'
import { useAppStore } from '../store/app.store'
import { Layout } from './Layout/Layout'
import { Dashboard } from './Dashboard/Dashboard'
import { Cleanup } from './Cleanup/Cleanup'
import { Processes } from './Processes/Processes'
import { Registry } from './Registry/Registry'
import { Startup } from './Startup/Startup'
import { AIChat } from './AI/AIChat'
import { Optimizer } from './Optimizer/Optimizer'
import { Settings } from './Settings/Settings'
import { History } from './Layout/History'
import { NotificationStack } from './Layout/NotificationStack'
import { License } from './License/License'

declare global {
  interface Window {
    electronAPI: {
      minimize: () => void
      maximize: () => void
      close: () => void
      getMetrics: () => Promise<unknown>
      onMetricsUpdate: (cb: (m: unknown) => void) => () => void
      getProcesses: () => Promise<unknown>
      killProcess: (pid: number) => Promise<unknown>
      getServices: () => Promise<unknown>
      setService: (name: string, action: string) => Promise<unknown>
      getStartup: () => Promise<unknown>
      toggleStartup: (id: string, enabled: boolean) => Promise<unknown>
      scanCleanup: () => Promise<unknown>
      runCleanup: (ids: string[]) => Promise<unknown>
      scanRegistry: () => Promise<unknown>
      cleanRegistry: (ids: string[]) => Promise<unknown>
      aiChat: (messages: unknown[], context: unknown) => Promise<unknown>
      aiAnalyze: (context: unknown) => Promise<unknown>
      analyzeProcesses: (processes: unknown[]) => Promise<unknown>
      getOptimizerStatus: () => Promise<unknown>
      setOptimizerMode: (mode: string) => Promise<unknown>
      getHistory: () => Promise<unknown>
      undoAction: (id: string) => Promise<unknown>
      getSettings: () => Promise<unknown>
      saveSettings: (s: unknown) => Promise<unknown>
      verifyLicense: (token: string) => Promise<unknown>
      logoutLicense: () => Promise<unknown>
      onActionComplete: (cb: (a: unknown) => void) => () => void
      onNotification: (cb: (n: unknown) => void) => () => void
    }
  }
}

export function App() {
  const { currentPage, setMetrics, setSettings, addNotification, setActionHistory } = useAppStore()

  useEffect(() => {
    // Load initial settings
    window.electronAPI?.getSettings().then(async (s) => {
      if (!s) return

      const settings = s as { licenseToken?: string }
      setSettings(s as never)

      if (settings.licenseToken) {
        const status = await window.electronAPI?.verifyLicense(settings.licenseToken)
        const refreshed = await window.electronAPI?.getSettings()
        if (refreshed) setSettings(refreshed as never)

        const result = status as { success?: boolean; error?: string } | null
        if (result && !result.success) {
          addNotification({ type: 'warning', message: result.error ?? 'Licencia caducada' })
        }
      }
    })

    // Subscribe to live metrics
    const unsubMetrics = window.electronAPI?.onMetricsUpdate((m) => {
      setMetrics(m as never)
    })

    // Subscribe to notifications from main process
    const unsubNotify = window.electronAPI?.onNotification((n) => {
      const notif = n as { type: 'success' | 'error' | 'warning' | 'info'; message: string }
      addNotification(notif)
    })

    // Subscribe to action complete events
    const unsubAction = window.electronAPI?.onActionComplete(() => {
      window.electronAPI?.getHistory().then((h) => {
        if (Array.isArray(h)) setActionHistory(h as never)
      })
    })

    return () => {
      unsubMetrics?.()
      unsubNotify?.()
      unsubAction?.()
    }
  }, [])

  return (
    <Layout>
      <NotificationStack />
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'cleanup' && <Cleanup />}
      {currentPage === 'processes' && <Processes />}
      {currentPage === 'registry' && <Registry />}
      {currentPage === 'startup' && <Startup />}
      {currentPage === 'ai' && <AIChat />}
      {currentPage === 'optimizer' && <Optimizer />}
      {currentPage === 'settings' && <Settings />}
      {currentPage === 'history' && <History />}
      {currentPage === 'license' && <License />}
    </Layout>
  )
}
