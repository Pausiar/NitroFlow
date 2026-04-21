import { ipcMain, BrowserWindow } from 'electron'
import log from 'electron-log'
import { IPC_CHANNELS } from '../../shared/types'
import { SystemMonitor } from '../services/system-monitor'
import { ProcessManager } from '../services/process-manager'
import { CleanupService } from '../services/cleanup'
import { RegistryService } from '../services/registry'
import { StartupManager } from '../services/startup-manager'
import { AIService } from '../services/ai-service'
import { HistoryService } from '../services/history'
import { SettingsService } from '../services/settings'
import { OptimizerService } from '../services/optimizer'

export function setupIpcHandlers(): void {
  const systemMonitor = new SystemMonitor()
  const processManager = new ProcessManager()
  const cleanupService = new CleanupService()
  const registryService = new RegistryService()
  const startupManager = new StartupManager()
  const aiService = new AIService()
  const historyService = HistoryService.getInstance()
  const settingsService = SettingsService.getInstance()
  const optimizerService = OptimizerService.getInstance()

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

  ipcMain.handle(IPC_CHANNELS.KILL_PROCESS, async (_, pid: number) => {
    try {
      const result = await processManager.killProcess(pid)
      historyService.record({
        type: 'process',
        description: `Terminado proceso PID ${pid}`,
        details: `Se terminó el proceso con PID ${pid}`,
        reversible: false
      })
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

  ipcMain.handle(
    IPC_CHANNELS.SET_SERVICE,
    async (_, { name, action }: { name: string; action: 'start' | 'stop' | 'disable' }) => {
      try {
        const result = await processManager.setServiceState(name, action)
        historyService.record({
          type: 'service',
          description: `Servicio "${name}": ${action}`,
          details: `Se ejecutó la acción "${action}" en el servicio "${name}"`,
          reversible: action !== 'disable'
        })
        return result
      } catch (err) {
        log.error('SET_SERVICE error:', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Startup ──────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GET_STARTUP, async () => {
    try {
      return await startupManager.listEntries()
    } catch (err) {
      log.error('GET_STARTUP error:', err)
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.TOGGLE_STARTUP,
    async (_, { id, enabled }: { id: string; enabled: boolean }) => {
      try {
        const result = await startupManager.toggleEntry(id, enabled)
        historyService.record({
          type: 'startup',
          description: `Inicio automático ${enabled ? 'activado' : 'desactivado'}: ${id}`,
          details: `Entrada de inicio "${id}" ${enabled ? 'habilitada' : 'deshabilitada'}`,
          reversible: true
        })
        return result
      } catch (err) {
        log.error('TOGGLE_STARTUP error:', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Cleanup ──────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SCAN_CLEANUP, async () => {
    try {
      return await cleanupService.scan()
    } catch (err) {
      log.error('SCAN_CLEANUP error:', err)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.RUN_CLEANUP, async (_, categoryIds: string[]) => {
    try {
      const results = await cleanupService.clean(categoryIds)
      const totalFreed = results.reduce((sum, r) => sum + r.freedMB, 0)
      historyService.record({
        type: 'cleanup',
        description: `Limpieza completada: ${totalFreed.toFixed(1)} MB liberados`,
        details: `Categorías limpiadas: ${categoryIds.join(', ')}`,
        reversible: false
      })
      // Notify renderer
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((w) =>
        w.webContents.send(IPC_CHANNELS.NOTIFICATION, {
          type: 'success',
          message: `Limpieza completada: ${totalFreed.toFixed(1)} MB liberados`
        })
      )
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

  ipcMain.handle(IPC_CHANNELS.CLEAN_REGISTRY, async (_, entryIds: string[]) => {
    try {
      const result = await registryService.clean(entryIds)
      historyService.record({
        type: 'registry',
        description: `Registro: ${result.fixed} entradas limpiadas`,
        details: `Entradas limpiadas: ${entryIds.join(', ')}`,
        reversible: result.backed_up,
        backupPath: result.backupPath
      })
      return result
    } catch (err) {
      log.error('CLEAN_REGISTRY error:', err)
      return { fixed: 0, backed_up: false, errors: [String(err)] }
    }
  })

  // ── AI ───────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (_, { messages, systemContext }) => {
    try {
      const settings = settingsService.get()
      return await aiService.chat(messages, systemContext, settings.nvidiaApiKey, settings.aiModel)
    } catch (err) {
      log.error('AI_CHAT error:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ANALYZE, async (_, systemContext) => {
    try {
      const settings = settingsService.get()
      return await aiService.analyze(systemContext, settings.nvidiaApiKey, settings.aiModel)
    } catch (err) {
      log.error('AI_ANALYZE error:', err)
      return { error: String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ANALYZE_PROCESSES, async (_, processes) => {
    try {
      const settings = settingsService.get()
      return await aiService.analyzeProcesses(processes, settings.nvidiaApiKey, settings.aiModel)
    } catch (err) {
      log.error('ANALYZE_PROCESSES error:', err)
      return { verdicts: [], error: String(err) }
    }
  })

  // ── Optimizer ────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.OPTIMIZER_GET_STATUS, () => {
    return optimizerService.getStatus()
  })

  ipcMain.handle(IPC_CHANNELS.OPTIMIZER_SET_MODE, async (_, mode) => {
    try {
      const result = await optimizerService.applyMode(mode)
      if (result.success) {
        historyService.record({
          type: 'settings',
          description: `Modo de rendimiento: ${mode}`,
          details: `Se activó el modo "${mode}" en el optimizador de rendimiento`,
          reversible: true
        })
        const windows = BrowserWindow.getAllWindows()
        windows.forEach((w) =>
          w.webContents.send(IPC_CHANNELS.NOTIFICATION, {
            type: 'success',
            message: `Modo "${mode}" activado correctamente`
          })
        )
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

  ipcMain.handle(IPC_CHANNELS.UNDO_ACTION, async (_, id: string) => {
    try {
      return await historyService.undo(id)
    } catch (err) {
      log.error('UNDO_ACTION error:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Settings ─────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return settingsService.get()
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_, settings) => {
    try {
      settingsService.save(settings)
      return { success: true }
    } catch (err) {
      log.error('SAVE_SETTINGS error:', err)
      return { success: false, error: String(err) }
    }
  })
}
