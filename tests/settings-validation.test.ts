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
})
