import { sanitizeSettingsUpdate } from '../src/main/utils/settings-validation'

describe('sanitizeSettingsUpdate', () => {
  it('keeps valid, whitelisted values (and trims strings)', () => {
    expect(
      sanitizeSettingsUpdate({
        nvidiaApiKey: '  nvapi-abc  ',
        aiModel: 'meta/llama-3.1-8b-instruct',
        optimizationProfile: 'deep',
        autoMonitor: false,
        monitorIntervalSeconds: 5,
        darkMode: false,
        language: 'en',
        notifications: false,
        startWithWindows: true
      })
    ).toEqual({
      nvidiaApiKey: 'nvapi-abc',
      aiModel: 'meta/llama-3.1-8b-instruct',
      optimizationProfile: 'deep',
      autoMonitor: false,
      monitorIntervalSeconds: 5,
      darkMode: false,
      language: 'en',
      notifications: false,
      startWithWindows: true
    })
  })

  it('never lets the renderer change license data, the API base URL or the performance mode', () => {
    const result = sanitizeSettingsUpdate({
      licenseToken: 'STOLEN',
      licenseEmail: 'a@b.c',
      licensePlan: 'pro',
      webApiBaseUrl: 'https://evil.example',
      performanceMode: 'gaming'
    })
    expect(result).toEqual({})
  })

  it('clamps the monitor interval to 1-60 seconds', () => {
    expect(sanitizeSettingsUpdate({ monitorIntervalSeconds: 9999 }).monitorIntervalSeconds).toBe(60)
    expect(sanitizeSettingsUpdate({ monitorIntervalSeconds: 0 }).monitorIntervalSeconds).toBe(1)
    expect(sanitizeSettingsUpdate({ monitorIntervalSeconds: 2.6 }).monitorIntervalSeconds).toBe(3)
  })

  it('drops values of the wrong type or outside the allowed set', () => {
    expect(
      sanitizeSettingsUpdate({
        darkMode: 'yes',
        language: 'fr',
        optimizationProfile: 'turbo',
        monitorIntervalSeconds: 'fast',
        aiModel: '   '
      })
    ).toEqual({})
  })

  it('returns an empty object for non-objects', () => {
    expect(sanitizeSettingsUpdate(null)).toEqual({})
    expect(sanitizeSettingsUpdate('x')).toEqual({})
    expect(sanitizeSettingsUpdate([1, 2])).toEqual({})
    expect(sanitizeSettingsUpdate(undefined)).toEqual({})
  })

  describe('boolean flags: advancedMode, onboardingDone, createRestorePoints', () => {
    const flags = ['advancedMode', 'onboardingDone', 'createRestorePoints'] as const

    it.each(flags)('accepts true and false for %s', (flag) => {
      expect(sanitizeSettingsUpdate({ [flag]: true })).toEqual({ [flag]: true })
      expect(sanitizeSettingsUpdate({ [flag]: false })).toEqual({ [flag]: false })
    })

    it.each(flags)('rejects non-boolean values for %s', (flag) => {
      for (const bad of ['yes', 'true', 1, 0, null, undefined, {}, []]) {
        expect(sanitizeSettingsUpdate({ [flag]: bad })).toEqual({})
      }
    })

    it('keeps the flags alongside other valid settings', () => {
      expect(
        sanitizeSettingsUpdate({
          advancedMode: true,
          onboardingDone: true,
          createRestorePoints: false,
          darkMode: 'no'
        })
      ).toEqual({
        advancedMode: true,
        onboardingDone: true,
        createRestorePoints: false
      })
    })
  })
})
