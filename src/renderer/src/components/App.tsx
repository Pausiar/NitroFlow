import { useEffect } from 'react'
import { useAppStore } from '../store/app.store'
import { Layout } from './Layout/Layout'
import { Dashboard } from './Dashboard/Dashboard'
import { Cleanup } from './Cleanup/Cleanup'
import { Processes } from './Processes/Processes'
import { Registry } from './Registry/Registry'
import { Startup } from './Startup/Startup'
import { AIChat } from './AI/AIChat'
import { Settings } from './Settings/Settings'
import { History } from './Layout/History'
import { NotificationStack } from './Layout/NotificationStack'

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
      getHistory: () => Promise<unknown>
      undoAction: (id: string) => Promise<unknown>
      getSettings: () => Promise<unknown>
      saveSettings: (s: unknown) => Promise<unknown>
      onActionComplete: (cb: (a: unknown) => void) => () => void
      onNotification: (cb: (n: unknown) => void) => () => void
    }
  }
}

export function App() {
  const { currentPage, setMetrics, setSettings, addNotification, setActionHistory } = useAppStore()

  useEffect(() => {
    // Load initial settings
    window.electronAPI?.getSettings().then((s) => {
      if (s) setSettings(s as never)
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
      {currentPage === 'settings' && <Settings />}
      {currentPage === 'history' && <History />}
    </Layout>
  )
}
