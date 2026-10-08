import type { AppSettings } from '../../shared/types'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Keeps only the settings the renderer is allowed to change, with validated
 * types and ranges. License fields and the API base URL are deliberately NOT
 * accepted here (they are managed by the auth service), and the performance
 * mode only changes through the optimizer. Previously the whole object the
 * renderer sent was merged verbatim into settings.json.
 */
export function sanitizeSettingsUpdate(input: unknown): Partial<AppSettings> {
  const out: Partial<AppSettings> = {}
  if (!isRecord(input)) return out

  if (typeof input.nvidiaApiKey === 'string') out.nvidiaApiKey = input.nvidiaApiKey.trim().slice(0, 256)
  if (typeof input.aiModel === 'string' && input.aiModel.trim()) out.aiModel = input.aiModel.trim().slice(0, 128)
  if (input.optimizationProfile === 'quick' || input.optimizationProfile === 'deep' || input.optimizationProfile === 'custom') {
    out.optimizationProfile = input.optimizationProfile
  }
  if (typeof input.autoMonitor === 'boolean') out.autoMonitor = input.autoMonitor
  if (typeof input.monitorIntervalSeconds === 'number' && Number.isFinite(input.monitorIntervalSeconds)) {
    out.monitorIntervalSeconds = Math.min(60, Math.max(1, Math.round(input.monitorIntervalSeconds)))
  }
  if (typeof input.darkMode === 'boolean') out.darkMode = input.darkMode
  if (input.language === 'es' || input.language === 'en') out.language = input.language
  if (typeof input.notifications === 'boolean') out.notifications = input.notifications
  if (typeof input.startWithWindows === 'boolean') out.startWithWindows = input.startWithWindows
  return out
}
