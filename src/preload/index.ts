import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'

// Expose a safe subset of electron APIs to the renderer via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // System metrics
  getMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.GET_METRICS),
  onMetricsUpdate: (cb: (metrics: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on(IPC_CHANNELS.METRICS_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.METRICS_UPDATE, listener)
  },

  // Processes & services
  getProcesses: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PROCESSES),
  killProcess: (pid: number) => ipcRenderer.invoke(IPC_CHANNELS.KILL_PROCESS, pid),
  getServices: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SERVICES),
  setService: (name: string, action: 'start' | 'stop' | 'disable') =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SERVICE, { name, action }),

  // Startup
  getStartup: () => ipcRenderer.invoke(IPC_CHANNELS.GET_STARTUP),
  toggleStartup: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_STARTUP, { id, enabled }),

  // Cleanup
  scanCleanup: () => ipcRenderer.invoke(IPC_CHANNELS.SCAN_CLEANUP),
  runCleanup: (categoryIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.RUN_CLEANUP, categoryIds),

  // Registry
  scanRegistry: () => ipcRenderer.invoke(IPC_CHANNELS.SCAN_REGISTRY),
  cleanRegistry: (entryIds: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.CLEAN_REGISTRY, entryIds),

  // AI
  aiChat: (messages: unknown[], systemContext: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT, { messages, systemContext }),
  aiAnalyze: (systemContext: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_ANALYZE, systemContext),

  // History
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HISTORY),
  undoAction: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.UNDO_ACTION, id),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (settings: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings),

  // Events
  onActionComplete: (cb: (action: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on(IPC_CHANNELS.ACTION_COMPLETE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ACTION_COMPLETE, listener)
  },

  onNotification: (cb: (notification: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION, listener)
  }
})
