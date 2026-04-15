import { SettingsService } from '../src/main/services/settings'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('SettingsService', () => {
  const storeFile = path.join(os.homedir(), 'NitroFlow', 'settings.json')

  beforeEach(() => {
    // Reset singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(SettingsService as any).instance = undefined
    // Remove any existing settings file to start fresh
    if (fs.existsSync(storeFile)) {
      fs.unlinkSync(storeFile)
    }
  })

  afterEach(() => {
    if (fs.existsSync(storeFile)) {
      fs.unlinkSync(storeFile)
    }
  })

  describe('getInstance', () => {
    it('returns the same instance', () => {
      const a = SettingsService.getInstance()
      const b = SettingsService.getInstance()
      expect(a).toBe(b)
    })
  })

  describe('get (defaults)', () => {
    it('returns default settings on first use', () => {
      const svc = SettingsService.getInstance()
      const settings = svc.get()
      expect(settings.nvidiaApiKey).toBe('')
      expect(settings.aiModel).toBeTruthy()
      expect(settings.darkMode).toBe(true)
      expect(settings.language).toBe('es')
      expect(settings.autoMonitor).toBe(true)
      expect(settings.optimizationProfile).toBe('quick')
    })

    it('returns a copy (mutation does not affect stored value)', () => {
      const svc = SettingsService.getInstance()
      const s1 = svc.get()
      s1.nvidiaApiKey = 'hacked'
      const s2 = svc.get()
      expect(s2.nvidiaApiKey).toBe('')
    })
  })

  describe('save', () => {
    it('persists settings and retrieves them', () => {
      const svc = SettingsService.getInstance()
      svc.save({ darkMode: false, language: 'en' })
      const saved = svc.get()
      expect(saved.darkMode).toBe(false)
      expect(saved.language).toBe('en')
    })

    it('partial update does not overwrite other settings', () => {
      const svc = SettingsService.getInstance()
      svc.save({ notifications: false })
      const saved = svc.get()
      expect(saved.notifications).toBe(false)
      expect(saved.aiModel).toBeTruthy() // default preserved
    })

    it('accepts API key updates', () => {
      const svc = SettingsService.getInstance()
      svc.save({ nvidiaApiKey: 'nvapi-test-key' })
      const saved = svc.get()
      expect(saved.nvidiaApiKey).toBe('nvapi-test-key')
    })
  })
})
