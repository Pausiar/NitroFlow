import { create } from 'zustand'
import type {
  SystemMetrics,
  ProcessInfo,
  ServiceInfo,
  StartupEntry,
  CleanupCategory,
  RegistryEntry,
  ChatMessage,
  ActionHistory,
  AppSettings,
  PerformanceMode,
  ProcessAIVerdict,
  LicensePlan
} from '../../../shared/types'

type Page = 'dashboard' | 'cleanup' | 'processes' | 'registry' | 'startup' | 'ai' | 'optimizer' | 'settings' | 'history' | 'license'

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
}

interface ConfirmState extends ConfirmOptions {
  id: string
  resolve: (value: boolean) => void
}

interface AppState {
  // Navigation
  currentPage: Page
  setPage: (page: Page) => void

  // System metrics
  metrics: SystemMetrics | null
  setMetrics: (m: SystemMetrics) => void

  // Processes
  processes: ProcessInfo[]
  services: ServiceInfo[]
  setProcesses: (p: ProcessInfo[]) => void
  setServices: (s: ServiceInfo[]) => void

  // Startup
  startupEntries: StartupEntry[]
  setStartupEntries: (e: StartupEntry[]) => void

  // Cleanup
  cleanupCategories: CleanupCategory[]
  setCleanupCategories: (c: CleanupCategory[]) => void

  // Registry
  registryEntries: RegistryEntry[]
  setRegistryEntries: (e: RegistryEntry[]) => void

  // AI Chat
  chatMessages: ChatMessage[]
  addChatMessage: (m: ChatMessage) => void
  clearChat: () => void

  // History
  actionHistory: ActionHistory[]
  setActionHistory: (h: ActionHistory[]) => void

  // Settings
  settings: AppSettings
  setSettings: (s: AppSettings) => void

  // Optimizer
  optimizerMode: PerformanceMode
  setOptimizerMode: (mode: PerformanceMode) => void

  // Process AI verdicts
  processAIVerdicts: ProcessAIVerdict[]
  setProcessAIVerdicts: (v: ProcessAIVerdict[]) => void

  // UI state
  notifications: Notification[]
  addNotification: (n: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void

  loading: Record<string, boolean>
  setLoading: (key: string, value: boolean) => void

  // Styled confirmation dialog
  confirmDialog: ConfirmState | null
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>
  resolveConfirm: (value: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  setPage: (page) => set({ currentPage: page }),

  metrics: null,
  setMetrics: (metrics) => set({ metrics }),

  processes: [],
  services: [],
  setProcesses: (processes) => set({ processes }),
  setServices: (services) => set({ services }),

  startupEntries: [],
  setStartupEntries: (startupEntries) => set({ startupEntries }),

  cleanupCategories: [],
  setCleanupCategories: (cleanupCategories) => set({ cleanupCategories }),

  registryEntries: [],
  setRegistryEntries: (registryEntries) => set({ registryEntries }),

  chatMessages: [],
  addChatMessage: (m) => set((state) => ({ chatMessages: [...state.chatMessages, m] })),
  clearChat: () => set({ chatMessages: [] }),

  actionHistory: [],
  setActionHistory: (actionHistory) => set({ actionHistory }),

  settings: {
    nvidiaApiKey: '',
    aiModel: 'meta/llama3-8b-instruct',
    optimizationProfile: 'quick',
    autoMonitor: true,
    monitorIntervalSeconds: 3,
    darkMode: true,
    language: 'es',
    notifications: true,
    startWithWindows: false,
    performanceMode: 'balanced',
    webApiBaseUrl: 'https://web-tau-two-22.vercel.app',
    licenseToken: '',
    licenseEmail: '',
    licensePlan: null as LicensePlan | null
  },
  setSettings: (settings) => set({ settings }),

  optimizerMode: 'balanced',
  setOptimizerMode: (optimizerMode) => set({ optimizerMode }),

  processAIVerdicts: [],
  setProcessAIVerdicts: (processAIVerdicts) => set({ processAIVerdicts }),

  notifications: [],
  addNotification: (n) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...n, id: `${Date.now()}-${Math.random()}` }
      ].slice(-5)
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    })),

  loading: {},
  setLoading: (key, value) =>
    set((state) => ({ loading: { ...state.loading, [key]: value } })),

  confirmDialog: null,
  requestConfirm: (options) =>
    new Promise<boolean>((resolve) => {
      set({
        confirmDialog: { ...options, id: `${Date.now()}-${Math.random()}`, resolve }
      })
    }),
  resolveConfirm: (value) =>
    set((state) => {
      state.confirmDialog?.resolve(value)
      return { confirmDialog: null }
    })
}))
