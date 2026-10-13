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
  /** Plain-language advice for non-expert users (from the known-apps database). */
  recommendation?: StartupRecommendation
  /** Short explanation shown next to the recommendation. */
  recommendationReason?: string
  /** True for security software / drivers: the UI must not offer to disable it. */
  essential?: boolean
}

/** 'disable' = safe and useful to turn off, 'keep' = leave on, 'optional' = user's choice. */
export type StartupRecommendation = 'disable' | 'keep' | 'optional'

// ─── Cleanup ────────────────────────────────
export interface CleanupCategory {
  id: string
  name: string
  description: string
  paths: string[]
  sizeMB: number
  fileCount: number
  safe: boolean
  /** Pre-selected and used by the one-click optimization (no risk of losing user data). */
  recommended?: boolean
  /** Plain-language warning shown when the category is not recommended. */
  warning?: string
}

export interface CleanupResult {
  categoryId: string
  freedMB: number
  deletedFiles: number
  errors: string[]
  success: boolean
  /** True when the category could not be fully cleaned due to missing admin rights. */
  requiresAdmin?: boolean
  /** True when the category had nothing to clean (not an error). */
  empty?: boolean
}

// ─── Smart optimization (one click) ──────────
export type HealthSeverity = 'critical' | 'warning' | 'info'

/** One problem found by the health check, explained for a non-expert user. */
export interface HealthIssue {
  id: string
  title: string
  /** What is wrong, in plain language. */
  description: string
  severity: HealthSeverity
  /** Id of the automatic fix, or undefined if it is only advice. */
  fixId?: SmartFixId
  /** Label of the button / checklist item for the fix. */
  fixLabel?: string
  /** True when the fix is safe enough to be pre-selected in "Optimizar ahora". */
  autoFix: boolean
  /** Human readable estimate, e.g. "2,3 GB" or "~10 s menos de arranque". */
  benefit?: string
  /** Page where the user can review it manually. */
  page?: 'cleanup' | 'startup' | 'optimizer' | 'processes' | 'registry'
}

export type SmartFixId =
  | 'cleanup_safe'
  | 'startup_disable_recommended'
  | 'power_plan_balanced'
  | 'empty_recycle_bin'

export interface HealthReport {
  /** 0-100, higher is better. */
  score: number
  issues: HealthIssue[]
  /** Summary sentence for the dashboard. */
  summary: string
  scannedAt: number
  isAdmin: boolean
}

export interface SmartFixResult {
  fixId: SmartFixId
  success: boolean
  message: string
  /** Items affected (e.g. startup programs disabled). */
  count?: number
  /** Disk space freed by this fix, in MB. */
  freedMB?: number
  /** True when the fix was not applied on purpose (e.g. nothing to do, or no restore point). */
  skipped?: boolean
}

export interface SmartOptimizeResult {
  restorePoint: RestorePointResult
  results: SmartFixResult[]
  freedMB: number
}

export interface RestorePointResult {
  success: boolean
  /** True when Windows skipped it because one was created in the last 24 h (still protected). */
  skipped?: boolean
  message: string
}

/** Progress events sent while the one-click optimization runs. */
export interface SmartProgress {
  step: string
  percent: number
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
  /** Registry backups: a folder of .reg files (or a single legacy .reg file). */
  backupPath?: string
  /** What to execute to revert this action (startup / service / optimizer). */
  undo?: UndoPayload
}

/** Data needed to revert an action, so "Deshacer" really does something. */
export type UndoPayload =
  | { kind: 'startup'; id: string; enabled: boolean }
  | { kind: 'service'; name: string; action: 'start' | 'stop' }
  | { kind: 'optimizer'; mode: PerformanceMode }

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
  /** True when the PC has a battery (laptop). Undefined while still detecting. */
  isLaptop?: boolean
  /** Non-critical problems from the last mode change, in plain Spanish. */
  warnings?: string[]
  /** True when NitroFlow holds a copy of the original settings ("Equilibrado" restores it). */
  hasSnapshot?: boolean
}

/** Result of OptimizerService.applyMode. */
export interface OptimizerApplyResult {
  success: boolean
  error?: string
  /** Steps that could not be applied (the mode is still active). */
  warnings?: string[]
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
  /** Shows expert pages (registry, processes & services). Off by default. */
  advancedMode: boolean
  /** True once the first-run welcome has been shown. */
  onboardingDone: boolean
  /** Create a System Restore point before applying system changes. */
  createRestorePoints: boolean
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

  // Smart optimization / safety
  HEALTH_SCAN: 'smart:scan',
  SMART_OPTIMIZE: 'smart:optimize',
  CREATE_RESTORE_POINT: 'safety:restore-point',
  GET_APP_INFO: 'app:info',

  // Process AI analysis
  ANALYZE_PROCESSES: 'processes:ai-analyze',

  // Events (main → renderer)
  METRICS_UPDATE: 'event:metrics-update',
  ACTION_COMPLETE: 'event:action-complete',
  NOTIFICATION: 'event:notification',
  SMART_PROGRESS: 'event:smart-progress'
} as const
