// ─────────────────────────────────────────────
// Shared Types for NitroFlow
// ─────────────────────────────────────────────

export interface SystemMetrics {
  cpu: CpuMetrics
  ram: RamMetrics
  disk: DiskMetrics[]
  network: NetworkMetrics
  temperatures: TemperatureMetrics[]
  timestamp: number
}

export interface CpuMetrics {
  usagePercent: number
  coreCount: number
  logicalCount: number
  speed: number
  model: string
  history: number[]
}

export interface RamMetrics {
  totalMB: number
  usedMB: number
  freeMB: number
  usagePercent: number
  history: number[]
}

export interface DiskMetrics {
  drive: string
  label: string
  totalGB: number
  usedGB: number
  freeGB: number
  usagePercent: number
  readSpeedMBs: number
  writeSpeedMBs: number
}

export interface NetworkMetrics {
  uploadKBs: number
  downloadKBs: number
  adapter: string
}

export interface TemperatureMetrics {
  name: string
  temperatureCelsius: number
}

// ─── Processes ──────────────────────────────
export interface ProcessInfo {
  pid: number
  name: string
  cpuPercent: number
  ramMB: number
  status: string
  path: string
  description: string
  canTerminate: boolean
}

// ─── Services ───────────────────────────────
export interface ServiceInfo {
  name: string
  displayName: string
  status: 'Running' | 'Stopped' | 'Paused' | 'StartPending' | 'StopPending'
  startType: 'Auto' | 'Manual' | 'Disabled' | 'AutoDelayed'
  description: string
  canOptimize: boolean
}

// ─── Startup ────────────────────────────────
export interface StartupEntry {
  id: string
  name: string
  command: string
  publisher: string
  location: 'HKCU' | 'HKLM' | 'TaskFolder' | 'Startup'
  enabled: boolean
  impact: 'High' | 'Medium' | 'Low' | 'Unknown'
  description: string
}

// ─── Cleanup ────────────────────────────────
export interface CleanupCategory {
  id: string
  name: string
  description: string
  paths: string[]
  sizeMB: number
  fileCount: number
  safe: boolean
}

export interface CleanupResult {
  categoryId: string
  freedMB: number
  deletedFiles: number
  errors: string[]
  success: boolean
}

// ─── Registry ───────────────────────────────
export interface RegistryEntry {
  id: string
  key: string
  value: string
  type: string
  reason: string
  severity: 'High' | 'Medium' | 'Low'
  safe: boolean
}

export interface RegistryCleanResult {
  fixed: number
  backed_up: boolean
  errors: string[]
}

// ─── AI ─────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface AIRequest {
  messages: ChatMessage[]
  systemContext: SystemContext
}

export interface SystemContext {
  metrics: SystemMetrics | null
  recentActions: ActionHistory[]
  topProcesses: ProcessInfo[]
  issues: string[]
}

// ─── Action History ──────────────────────────
export interface ActionHistory {
  id: string
  timestamp: number
  type: ActionType
  description: string
  details: string
  reversible: boolean
  undone: boolean
  backupPath?: string
}

export type ActionType =
  | 'cleanup'
  | 'registry'
  | 'startup'
  | 'process'
  | 'service'
  | 'settings'

// ─── Optimizer ──────────────────────────────
export type PerformanceMode = 'balanced' | 'performance' | 'gaming'
export type LicensePlan = 'free' | 'pro'

export interface OptimizerStatus {
  currentMode: PerformanceMode
  appliedAt: number | null
}

export interface ProcessAIVerdict {
  pid: number
  name: string
  verdict: 'useful' | 'disposable' | 'unknown'
  reason: string
}

// ─── Settings ───────────────────────────────
export interface AppSettings {
  nvidiaApiKey: string
  aiModel: string
  optimizationProfile: 'quick' | 'deep' | 'custom'
  autoMonitor: boolean
  monitorIntervalSeconds: number
  darkMode: boolean
  language: 'es' | 'en'
  notifications: boolean
  startWithWindows: boolean
  performanceMode: PerformanceMode
  webApiBaseUrl: string
  licenseToken: string
  licenseEmail: string
  licensePlan: LicensePlan | null
}

export interface LicenseStatus {
  success: boolean
  licensed: boolean
  plan: LicensePlan | null
  email?: string
  error?: string
}

// ─── IPC Channel Names ───────────────────────
export const IPC_CHANNELS = {
  // System
  GET_METRICS: 'system:get-metrics',
  SUBSCRIBE_METRICS: 'system:subscribe',
  UNSUBSCRIBE_METRICS: 'system:unsubscribe',

  // Processes
  GET_PROCESSES: 'processes:list',
  KILL_PROCESS: 'processes:kill',
  GET_SERVICES: 'services:list',
  SET_SERVICE: 'services:set',

  // Startup
  GET_STARTUP: 'startup:list',
  TOGGLE_STARTUP: 'startup:toggle',

  // Cleanup
  SCAN_CLEANUP: 'cleanup:scan',
  RUN_CLEANUP: 'cleanup:run',

  // Registry
  SCAN_REGISTRY: 'registry:scan',
  CLEAN_REGISTRY: 'registry:clean',

  // AI
  AI_CHAT: 'ai:chat',
  AI_ANALYZE: 'ai:analyze',

  // History
  GET_HISTORY: 'history:list',
  UNDO_ACTION: 'history:undo',

  // Settings
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',

  // Auth / licensing
  VERIFY_LICENSE: 'auth:verify-license',
  LOGOUT_LICENSE: 'auth:logout-license',

  // Optimizer
  OPTIMIZER_GET_STATUS: 'optimizer:get-status',
  OPTIMIZER_SET_MODE: 'optimizer:set-mode',

  // Process AI analysis
  ANALYZE_PROCESSES: 'processes:ai-analyze',

  // Events (main → renderer)
  METRICS_UPDATE: 'event:metrics-update',
  ACTION_COMPLETE: 'event:action-complete',
  NOTIFICATION: 'event:notification'
} as const
