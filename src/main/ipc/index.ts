import { app, ipcMain, BrowserWindow } from 'electron'
import log from 'electron-log'
import { IPC_CHANNELS } from '../../shared/types'
import type { AppSettings, PerformanceMode, UndoPayload } from '../../shared/types'
import { sanitizeSettingsUpdate } from '../utils/settings-validation'
import { SystemMonitor } from '../services/system-monitor'
import { ProcessManager } from '../services/process-manager'
import { CleanupService } from '../services/cleanup'
import { RegistryService } from '../services/registry'
import { StartupManager } from '../services/startup-manager'
import { AIService } from '../services/ai-service'
import { HistoryService } from '../services/history'
import { SettingsService } from '../services/settings'
import { OptimizerService } from '../services/optimizer'
import { AuthService } from '../services/auth'

export interface IpcDependencies {
  /** The single monitor instance owned by the main process (also pushes live metrics). */
  systemMonitor: SystemMonitor
  /** Called after settings were saved, so the main process can react (e.g. restart monitoring). */
  onSettingsSaved?: (settings: AppSettings) => void
}

const PERFORMANCE_MODES: readonly PerformanceMode[] = ['balanced', 'performance', 'gaming']
const SERVICE_ACTIONS = ['start', 'stop', 'disable'] as const
type ServiceAction = (typeof SERVICE_ACTIONS)[number]

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Sends an event to every open window, skipping ones that are already destroyed. */
function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
      w.webContents.send(channel, payload)
    }
  }
}

const notify = (type: 'success' | 'error' | 'warning' | 'info', message: string): void =>
  broadcast(IPC_CHANNELS.NOTIFICATION, { type, message })

export function setupIpcHandlers(deps: IpcDependencies): void {
  const { systemMonitor } = deps
  const processManager = new ProcessManager()
  const cleanupService = new CleanupService()
  const registryService = new RegistryService()
  const startupManager = new StartupManager()
  const aiService = new AIService()
  const historyService = HistoryService.getInstance()
  const settingsService = SettingsService.getInstance()
  const optimizerService = OptimizerService.getInstance()
  const authService = new AuthService()

  /** Records an action and tells the renderer to refresh its history list. */
  const recordAction = (opts: Parameters<HistoryService['record']>[0]): void => {
    historyService.record(opts)
    broadcast(IPC_CHANNELS.ACTION_COMPLETE, { type: opts.type })
  }

  // Undo for actions that need other services (startup / service / optimizer).
  historyService.setUndoExecutor(async (payload: UndoPayload) => {
    switch (payload.kind) {
      case 'startup':
        return startupManager.toggleEntry(payload.id, payload.enabled)
      case 'service':
        return processManager.setServiceState(payload.name, payload.action)
      case 'optimizer':
        return optimizerService.applyMode(payload.mode)
    }
  })

  // ── System Metrics ──────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GET_METRICS, async () => {
    try {
      return await systemMonitor.getSnapshot()
    } catch (err) {
      log.error('GET_METRICS error:', err)
      return null
    }
  })

  // ── Processes ────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GET_PROCESSES, async () => {
    try {
      return await processManager.listProcesses()
    } catch (err) {
      log.error('GET_PROCESSES error:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.KILL_PROCESS, async (_event, pid: unknown) => {
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
      return { success: false, error: 'PID inválido' }
    }
    try {
      const result = await processManager.killProcess(pid)
      if (result.success) {
        recordAction({
          type: 'process',
          description: `Terminado proceso PID ${pid}`,
          details: `Se terminó el proceso con PID ${pid}`,
          reversible: false
        })
      }
      return result
    } catch (err) {
      log.error('KILL_PROCESS error:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Services ─────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GET_SERVICES, async () => {
    try {
      return await processManager.listServices()
    } catch (err) {
      log.error('GET_SERVICES error:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.SET_SERVICE, async (_event, payload: unknown) => {
    if (
      !isRecord(payload) ||
      typeof payload.name !== 'string' ||
      !SERVICE_ACTIONS.includes(payload.action as ServiceAction)
    ) {
      return { success: false, error: 'Petición de servicio inválida' }
    }
    const name = payload.name
    const action = payload.action as ServiceAction
    try {
      const result = await processManager.setServiceState(name, action)
      if (result.success) {
        // start <-> stop can be reverted; "disable" would need the previous
        // start type, which is not captured, so it stays irreversible.
        const undo: UndoPayload | undefined =
          action === 'disable' ? undefined : { kind: 'service', name, action: action === 'start' ? 'stop' : 'start' }
        recordAction({
          type: 'service',
          description: `Servicio "${name}": ${action}`,
          details: `Se ejecutó la acción "${action}" en el servicio "${name}"`,
          reversible: Boolean(undo),
          undo
        })
      }
      return result
    } catch (err) {
      log.error('SET_SERVICE error:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Startup ──────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GET_STARTUP, async () => {
    try {
      return await startupManager.listEntries()
    } catch (err) {
      log.error('GET_STARTUP error:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.TOGGLE_STARTUP, async (_event, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.id !== 'string' || typeof payload.enabled !== 'boolean') {
      return { success: false, error: 'Petición inválida' }
    }
    const { id, enabled } = payload as { id: string; enabled: boolean }
    try {
      const result = await startupManager.toggleEntry(id, enabled)
      if (result.success) {
        recordAction({
          type: 'startup',
          description: `Inicio automático ${enabled ? 'activado' : 'desactivado'}: ${id}`,
          details: `Entrada de inicio "${id}" ${enabled ? 'habilitada' : 'deshabilitada'}`,
          reversible: true,
          undo: { kind: 'startup', id, enabled: !enabled }
        })
      }
      return result
    } catch (err) {
      log.error('TOGGLE_STARTUP error:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Cleanup ──────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SCAN_CLEANUP, async () => {
    try {
      return await cleanupService.scan()
    } catch (err) {
      log.error('SCAN_CLEANUP error:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.RUN_CLEANUP, async (_event, categoryIds: unknown) => {
    if (!isStringArray(categoryIds)) return []
    try {
      const results = await cleanupService.clean(categoryIds)
      const totalFreed = results.reduce((sum, r) => sum + r.freedMB, 0)
      recordAction({
        type: 'cleanup',
        description: `Limpieza completada: ${totalFreed.toFixed(1)} MB liberados`,
        details: `Categorías limpiadas: ${categoryIds.join(', ')}`,
        reversible: false
      })
      notify('success', `Limpieza completada: ${totalFreed.toFixed(1)} MB liberados`)
      return results
    } catch (err) {
      log.error('RUN_CLEANUP error:', err)
      return []
    }
  })

  // ── Registry ─────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SCAN_REGISTRY, async () => {
    try {
      return await registryService.scan()
    } catch (err) {
      log.error('SCAN_REGISTRY error:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLEAN_REGISTRY, async (_event, entryIds: unknown) => {
    if (!isStringArray(entryIds)) {
      return { fixed: 0, backed_up: false, errors: ['Petición inválida'] }
    }
    try {
      const result = await registryService.clean(entryIds)
      // Nothing changed -> nothing to record (or to "undo").
      if (result.fixed > 0) {
        recordAction({
          type: 'registry',
          description: `Registro: ${result.fixed} entradas limpiadas`,
          details: `Entradas limpiadas: ${entryIds.join(', ')}`,
          reversible: result.backed_up,
          backupPath: result.backupPath
        })
      }
      return result
    } catch (err) {
      log.error('CLEAN_REGISTRY error:', err)
      return { fixed: 0, backed_up: false, errors: [String(err)] }
    }
  })

  // ── AI ───────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (_event, payload: unknown) => {
    try {
      if (!isRecord(payload) || !Array.isArray(payload.messages) || !isRecord(payload.systemContext)) {
        return { error: 'Petición de IA inválida' }
      }
      const settings = settingsService.get()
      return await aiService.chat(
        payload.messages as Parameters<AIService['chat']>[0],
        payload.systemContext as unknown as Parameters<AIService['chat']>[1],
        settings.nvidiaApiKey,
        settings.aiModel
      )
    } catch (err) {
      log.error('AI_CHAT error:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ANALYZE, async (_event, systemContext: unknown) => {
    try {
      if (!isRecord(systemContext)) return { error: 'Petición de IA inválida' }
      const settings = settingsService.get()
      return await aiService.analyze(
        systemContext as unknown as Parameters<AIService['analyze']>[0],
        settings.nvidiaApiKey,
        settings.aiModel
      )
    } catch (err) {
      log.error('AI_ANALYZE error:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ANALYZE_PROCESSES, async (_event, processes: unknown) => {
    try {
      if (!Array.isArray(processes)) return { verdicts: [], error: 'Petición de IA inválida' }
      const settings = settingsService.get()
      return await aiService.analyzeProcesses(
        processes as Parameters<AIService['analyzeProcesses']>[0],
        settings.nvidiaApiKey,
        settings.aiModel
      )
    } catch (err) {
      log.error('ANALYZE_PROCESSES error:', err)
      return { verdicts: [], error: String(err) }
    }
  })

  // ── Optimizer ────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.OPTIMIZER_GET_STATUS, () => {
    return optimizerService.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.OPTIMIZER_SET_MODE, async (_event, mode: unknown) => {
    if (!PERFORMANCE_MODES.includes(mode as PerformanceMode)) {
      return { success: false, error: 'Modo de rendimiento inválido' }
    }
    const newMode = mode as PerformanceMode
    try {
      const previousMode = optimizerService.getStatus().currentMode
      const result = await optimizerService.applyMode(newMode)
      if (result.success) {
        recordAction({
          type: 'settings',
          description: `Modo de rendimiento: ${newMode}`,
          details: `Se activó el modo "${newMode}" en el optimizador de rendimiento`,
          reversible: previousMode !== newMode,
          undo: previousMode !== newMode ? { kind: 'optimizer', mode: previousMode } : undefined
        })
        notify('success', `Modo "${newMode}" activado correctamente`)
      }
      return result
    } catch (err) {
      log.error('OPTIMIZER_SET_MODE error:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── History ──────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GET_HISTORY, () => {
    return historyService.list()
  })

  ipcMain.handle(IPC_CHANNELS.UNDO_ACTION, async (_event, id: unknown) => {
    if (typeof id !== 'string') return { success: false, error: 'Identificador inválido' }
    try {
      const result = await historyService.undo(id)
      if (result.success) {
        broadcast(IPC_CHANNELS.ACTION_COMPLETE, { type: 'undo' })
        notify('success', 'Acción deshecha correctamente')
      }
      return result
    } catch (err) {
      log.error('UNDO_ACTION error:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Settings ─────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return settingsService.get()
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_event, settings: unknown) => {
    try {
      const updates = sanitizeSettingsUpdate(settings)
      settingsService.save(updates)

      // "Iniciar con Windows" used to be saved but never applied.
      if (typeof updates.startWithWindows === 'boolean' && app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: updates.startWithWindows })
      }
      deps.onSettingsSaved?.(settingsService.get())
      return { success: true }
    } catch (err) {
      log.error('SAVE_SETTINGS error:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Auth / licensing ──────────────────────────────
  ipcMain.handle(IPC_CHANNELS.VERIFY_LICENSE, async (_event, token: unknown) => {
    if (typeof token !== 'string') {
      return { success: false, licensed: false, plan: null, error: 'Token inválido' }
    }
    return authService.verifyLicense(token)
  })

  ipcMain.handle(IPC_CHANNELS.LOGOUT_LICENSE, () => {
    return authService.logout()
  })
}
