import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import { setupIpcHandlers } from './ipc'
import { SystemMonitor } from './services/system-monitor'

log.initialize({ preload: true })
log.info('NitroFlow starting...')

if (process.platform === 'win32') {
  app.setAppUserModelId('com.nitroflow.app')
}

let mainWindow: BrowserWindow | null = null
let systemMonitor: SystemMonitor | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
    icon: join(__dirname, '../../resources/icon.ico')
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Start system monitor and push updates to renderer
  systemMonitor = new SystemMonitor()
  systemMonitor.start((metrics) => {
    mainWindow?.webContents.send('event:metrics-update', metrics)
  })
}

app.whenReady().then(() => {
  setupIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  systemMonitor?.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Window control IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())
