import * as path from 'path'

/**
 * Paths that NitroFlow will NEVER touch.
 * These protect the OS, drivers, and user personal files.
 */
export const PROTECTED_PATHS: string[] = [
  // Windows core
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
  'C:\\Windows\\WinSxS',
  'C:\\Windows\\Boot',
  'C:\\Windows\\Fonts',
  'C:\\Windows\\assembly',
  // Drivers
  'C:\\Windows\\inf',
  'C:\\Windows\\drivers',
  // User personal data
  'Documents',
  'Pictures',
  'Music',
  'Videos',
  'Desktop',
  'Downloads',
  // Application data
  'C:\\Program Files',
  'C:\\Program Files (x86)'
]

/**
 * Registry keys that NitroFlow will NEVER modify.
 */
export const PROTECTED_REGISTRY_KEYS: string[] = [
  'HKLM:\\SYSTEM\\CurrentControlSet\\Control',
  'HKLM:\\SYSTEM\\CurrentControlSet\\Services',
  'HKLM:\\SECURITY',
  'HKLM:\\SAM',
  'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
  'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options',
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies'
]

/**
 * Process names that should never be terminated.
 */
export const PROTECTED_PROCESSES: Set<string> = new Set([
  'system',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'lsass.exe',
  'lsm.exe',
  'services.exe',
  'explorer.exe',
  'svchost.exe',
  'dwm.exe',
  'conhost.exe',
  'spoolsv.exe',
  'taskhostw.exe',
  'fontdrvhost.exe',
  'memory compression',
  'registry',
  'secure system'
])

/**
 * Returns true if the given filesystem path is safe to operate on.
 * Blocks writes to protected OS and personal-data paths.
 */
export function isPathSafe(targetPath: string): boolean {
  const normalized = path.normalize(targetPath).toLowerCase()

  for (const protectedPath of PROTECTED_PATHS) {
    if (normalized.startsWith(protectedPath.toLowerCase())) {
      return false
    }
    // Check for personal folder names in any part of the path
    const folderName = protectedPath.toLowerCase()
    if (!folderName.includes(':\\') && normalized.includes(`\\${folderName}\\`)) {
      return false
    }
  }

  return true
}

/**
 * Anonymize system context before sending to external AI APIs.
 * Removes usernames, personal paths, and identifiable information.
 */
export function anonymizeForAI<T extends Record<string, unknown>>(data: T): T {
  const json = JSON.stringify(data)
  const userProfile = process.env.USERPROFILE ?? ''
  const username = process.env.USERNAME ?? ''
  const computerName = process.env.COMPUTERNAME ?? ''

  const sanitized = json
    .replace(new RegExp(escapeRegex(userProfile), 'gi'), 'C:\\Users\\[USER]')
    .replace(new RegExp(escapeRegex(username), 'gi'), '[USER]')
    .replace(new RegExp(escapeRegex(computerName), 'gi'), '[COMPUTER]')
    // Remove IP addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
    // Remove MAC addresses
    .replace(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/g, '[MAC]')

  return JSON.parse(sanitized)
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
