import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import { setupIpcHandlers } from './ipc'
import { SystemMonitor } from './services/system-monitor'
import { SettingsService } from './services/settings'
import { IPC_CHANNELS } from '../shared/types'
import type { AppSettings } from '../shared/types'

log.initialize({ preload: true })
log.info('NitroFlow starting...')

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection:', reason)
})

if (process.platform === 'win32') {
  app.setAppUserModelId('com.nitroflow.app')
}

let mainWindow: BrowserWindow | null = null
// One monitor for the whole app (it used to be created twice: here and in the
// IPC layer, doubling the PowerShell work and keeping two separate histories).
const systemMonitor = new SystemMonitor()

/** The main window, or null if it was never created / already destroyed. */
const getWindow = (): BrowserWindow | null =>
  mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : null

/** Only web links are ever handed to the OS; anything else (file:, ms-*:, custom schemes) is dropped. */
function openExternalSafe(url: string): void {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') {
      void shell.openExternal(url)
    } else {
      log.warn(`Blocked external URL with protocol ${protocol}`)
    }
  } catch {
    log.warn('Blocked malformed external URL')
  }
}

/** True for the app's own renderer (dev server or packaged file). */
function isAppUrl(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
}

/**
 * Metrics are only useful while the window can be seen. Pausing when it is
 * minimized or hidden stops the periodic polling, so NitroFlow (a performance
 * tool) does not burn CPU in the background.
 */
function updateMonitoring(settings: AppSettings = SettingsService.getInstance().get()): void {
  systemMonitor.stop()
  const win = getWindow()
  if (!win || !settings.autoMonitor) return
  if (win.isMinimized() || !win.isVisible()) return

  const intervalMs = Math.max(1, settings.monitorIntervalSeconds || 3) * 1000
  systemMonitor.start((metrics) => {
    const target = getWindow()
    if (target && !target.webContents.isDestroyed()) {
      target.webContents.send(IPC_CHANNELS.METRICS_UPDATE, metrics)
    }
  }, intervalMs)
}

function createWindow(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.ico')
    : join(__dirname, '../../resources/icon.ico')

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1c1c1e',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: iconPath
  })
  mainWindow = win

  win.once('ready-to-show', () => {
    win.show()
    updateMonitoring()
  })

  win.on('minimize', () => updateMonitoring())
  win.on('restore', () => updateMonitoring())
  win.on('show', () => updateMonitoring())
  win.on('hide', () => updateMonitoring())

  // The window object is destroyed on close; drop the reference so nothing
  // tries to talk to it afterwards ("Object has been destroyed").
  win.on('closed', () => {
    systemMonitor.stop()
    mainWindow = null
  })

  // Open external links in the default browser (web links only)
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })

  // The app window must never navigate away from the bundled UI.
  win.webContents.on('will-navigate', (event: { preventDefault(): void }, url: string) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternalSafe(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Running two copies would fight over the same history/settings files.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // The UI needs no camera, microphone, geolocation, etc.
    session.defaultSession.setPermissionRequestHandler((_webContents: unknown, _permission: string, callback: (granted: boolean) => void) =>
      callback(false)
    )

    setupIpcHandlers({
      systemMonitor,
      onSettingsSaved: (settings) => updateMonitoring(settings)
    })
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    systemMonitor.stop()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

// Window control IPC
ipcMain.on('window:minimize', () => getWindow()?.minimize())
ipcMain.on('window:maximize', () => {
  const win = getWindow()
  if (!win) return
  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
})
ipcMain.on('window:close', () => getWindow()?.close())
