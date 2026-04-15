// Mock for electron module
const electron = {
  app: {
    getPath: jest.fn((name: string) => `/mock/${name}`),
    whenReady: jest.fn(() => Promise.resolve()),
    quit: jest.fn(),
    on: jest.fn()
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn()
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    loadFile: jest.fn(),
    show: jest.fn(),
    once: jest.fn(),
    webContents: { send: jest.fn(), setWindowOpenHandler: jest.fn() },
    minimize: jest.fn(),
    maximize: jest.fn(),
    isMaximized: jest.fn(() => false),
    unmaximize: jest.fn(),
    close: jest.fn()
  })),
  shell: {
    openExternal: jest.fn()
  }
}

module.exports = electron
