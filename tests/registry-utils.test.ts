import { registryEntryId, toRegExePath } from '../src/main/services/registry'

describe('registry helpers', () => {
  describe('toRegExePath', () => {
    it('converts PowerShell drives to the names reg.exe expects', () => {
      expect(toRegExePath('HKCU:\\SOFTWARE\\X')).toBe('HKEY_CURRENT_USER\\SOFTWARE\\X')
      expect(toRegExePath('HKLM:\\SOFTWARE\\X')).toBe('HKEY_LOCAL_MACHINE\\SOFTWARE\\X')
    })

    it('keeps already-long names working', () => {
      expect(toRegExePath('HKEY_CURRENT_USER\\SOFTWARE\\X')).toBe('HKEY_CURRENT_USER\\SOFTWARE\\X')
    })
  })

  describe('registryEntryId', () => {
    it('is stable for the same key and value, whatever the spelling of the root', () => {
      const a = registryEntryId('HKEY_CURRENT_USER\\Software\\Run', 'Updater')
      const b = registryEntryId('HKCU:\\Software\\Run', 'updater')
      expect(a).toBe(b)
      expect(a).toMatch(/^reg_[0-9a-f]{12}$/)
    })

    it('differs for different keys or values', () => {
      expect(registryEntryId('HKCU:\\A', 'v')).not.toBe(registryEntryId('HKCU:\\B', 'v'))
      expect(registryEntryId('HKCU:\\A', 'v1')).not.toBe(registryEntryId('HKCU:\\A', 'v2'))
    })
  })
})
