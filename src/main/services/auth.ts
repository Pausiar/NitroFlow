import axios from 'axios'
import log from 'electron-log'
import type { LicenseStatus } from '../../shared/types'
import { DEFAULT_WEB_API_BASE_URL, SettingsService } from './settings'

const normalizeBaseUrl = (value: string) =>
  (value || DEFAULT_WEB_API_BASE_URL).replace(/\/+$/, '')

export class AuthService {
  async verifyLicense(token: string): Promise<LicenseStatus> {
    const cleanToken = token.trim()
    if (!cleanToken) {
      return {
        success: false,
        licensed: false,
        plan: null,
        error: 'Introduce el token de licencia'
      }
    }

    const settingsService = SettingsService.getInstance()
    const settings = settingsService.get()
    const baseUrl = normalizeBaseUrl(settings.webApiBaseUrl)

    try {
      const { data } = await axios.post<LicenseStatus>(
        `${baseUrl}/api/verify-license`,
        { desktopToken: cleanToken },
        {
          timeout: 15000,
          headers: { 'Content-Type': 'application/json' }
        }
      )

      if (!data.success) {
        settingsService.save({ licenseToken: '', licenseEmail: '', licensePlan: null })
        return {
          success: false,
          licensed: false,
          plan: null,
          error: data.error ?? 'Licencia no valida'
        }
      }

      settingsService.save({
        licenseToken: cleanToken,
        licenseEmail: data.email ?? '',
        licensePlan: data.plan
      })

      return data
    } catch (err) {
      log.error('AuthService.verifyLicense error:', err)
      return {
        success: false,
        licensed: false,
        plan: null,
        error: 'No se pudo conectar con la web de NitroFlow'
      }
    }
  }

  logout(): LicenseStatus {
    SettingsService.getInstance().save({
      licenseToken: '',
      licenseEmail: '',
      licensePlan: null
    })

    return { success: true, licensed: false, plan: null }
  }
}
