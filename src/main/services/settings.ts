import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import log from 'electron-log'
import type { AppSettings } from '../../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  nvidiaApiKey: '',
  aiModel: 'meta/llama3-8b-instruct',
  optimizationProfile: 'quick',
  autoMonitor: true,
  monitorIntervalSeconds: 3,
  darkMode: true,
  language: 'es',
  notifications: true,
  startWithWindows: false,
  performanceMode: 'balanced'
}

export class SettingsService {
  private static instance: SettingsService
  private settings: AppSettings
  private storePath: string

  private constructor() {
    const dir = path.join(os.homedir(), 'NitroFlow')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.storePath = path.join(dir, 'settings.json')
    this.settings = this.load()
  }

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService()
    }
    return SettingsService.instance
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  save(updates: Partial<AppSettings>): void {
    // Never store full API key in logs
    const loggable = { ...updates, nvidiaApiKey: updates.nvidiaApiKey ? '***' : '' }
    log.info('Saving settings:', loggable)
    this.settings = { ...this.settings, ...updates }
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      log.error('Failed to save settings:', err)
    }
  }

  private load(): AppSettings {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8')
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      }
    } catch (err) {
      log.warn('Failed to load settings, using defaults:', err)
    }
    return { ...DEFAULT_SETTINGS }
  }
}
