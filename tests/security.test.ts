import { isPathSafe, anonymizeForAI, PROTECTED_PROCESSES, PROTECTED_REGISTRY_KEYS } from '../src/main/utils/security'

describe('Security Utils', () => {
  describe('isPathSafe', () => {
    it('blocks Windows System32 path', () => {
      expect(isPathSafe('C:\\Windows\\System32')).toBe(false)
      expect(isPathSafe('C:\\Windows\\System32\\cmd.exe')).toBe(false)
    })

    it('blocks SysWOW64', () => {
      expect(isPathSafe('C:\\Windows\\SysWOW64')).toBe(false)
    })

    it('blocks WinSxS', () => {
      expect(isPathSafe('C:\\Windows\\WinSxS')).toBe(false)
    })

    it('blocks personal folders', () => {
      expect(isPathSafe('C:\\Users\\John\\Documents\\file.txt')).toBe(false)
      expect(isPathSafe('C:\\Users\\John\\Pictures\\photo.jpg')).toBe(false)
      expect(isPathSafe('C:\\Users\\John\\Music\\song.mp3')).toBe(false)
      expect(isPathSafe('C:\\Users\\John\\Videos\\video.mp4')).toBe(false)
    })

    it('allows temp paths', () => {
      expect(isPathSafe('C:\\Windows\\Temp')).toBe(true)
      expect(isPathSafe('C:\\Users\\John\\AppData\\Local\\Temp')).toBe(true)
    })

    it('allows Windows Prefetch', () => {
      expect(isPathSafe('C:\\Windows\\Prefetch')).toBe(true)
    })

    it('blocks Program Files', () => {
      expect(isPathSafe('C:\\Program Files')).toBe(false)
      expect(isPathSafe('C:\\Program Files (x86)')).toBe(false)
    })
  })

  describe('PROTECTED_PROCESSES', () => {
    it('includes critical system processes', () => {
      expect(PROTECTED_PROCESSES.has('lsass.exe')).toBe(true)
      expect(PROTECTED_PROCESSES.has('csrss.exe')).toBe(true)
      expect(PROTECTED_PROCESSES.has('winlogon.exe')).toBe(true)
      expect(PROTECTED_PROCESSES.has('wininit.exe')).toBe(true)
      expect(PROTECTED_PROCESSES.has('services.exe')).toBe(true)
    })

    it('does not include regular apps', () => {
      expect(PROTECTED_PROCESSES.has('chrome.exe')).toBe(false)
      expect(PROTECTED_PROCESSES.has('notepad.exe')).toBe(false)
    })
  })

  describe('PROTECTED_REGISTRY_KEYS', () => {
    it('contains critical registry paths', () => {
      const hasControl = PROTECTED_REGISTRY_KEYS.some(k =>
        k.includes('CurrentControlSet\\Control')
      )
      expect(hasControl).toBe(true)

      const hasSecurity = PROTECTED_REGISTRY_KEYS.some(k =>
        k.includes('SECURITY')
      )
      expect(hasSecurity).toBe(true)
    })
  })

  describe('anonymizeForAI', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = {
        ...originalEnv,
        USERNAME: 'TestUser',
        COMPUTERNAME: 'MY-PC',
        USERPROFILE: 'C:\\Users\\TestUser'
      }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('removes username from data', () => {
      const data = { path: 'C:\\Users\\TestUser\\AppData\\file.txt', user: 'TestUser' }
      const result = anonymizeForAI(data)
      expect(JSON.stringify(result)).not.toContain('TestUser')
    })

    it('removes computer name from data', () => {
      const data = { host: 'MY-PC', info: 'running on MY-PC' }
      const result = anonymizeForAI(data)
      expect(JSON.stringify(result)).not.toContain('MY-PC')
    })

    it('removes IP addresses', () => {
      const data = { ip: '192.168.1.100', server: '10.0.0.1' }
      const result = anonymizeForAI(data)
      expect(JSON.stringify(result)).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)
    })

    it('removes MAC addresses', () => {
      const data = { mac: 'AA:BB:CC:DD:EE:FF' }
      const result = anonymizeForAI(data)
      expect(JSON.stringify(result)).not.toMatch(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/)
    })

    it('preserves non-sensitive data', () => {
      const data = { cpuPercent: 45, ramMB: 8192 }
      const result = anonymizeForAI(data)
      expect(result.cpuPercent).toBe(45)
      expect(result.ramMB).toBe(8192)
    })
  })
})
