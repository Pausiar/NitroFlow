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
  'secure system',
  'audiodg.exe',
  'sihost.exe',
  'ctfmon.exe',
  'wudfhost.exe',
  'msmpeng.exe',
  'nissrv.exe',
  'securityhealthservice.exe',
  'nitroflow.exe'
])

/** Lower-case process name without the `.exe` suffix (what `Get-Process` reports). */
function processBaseName(name: string): string {
  return name.trim().toLowerCase().replace(/\.exe$/, '')
}

const PROTECTED_PROCESS_BASENAMES: Set<string> = new Set(
  Array.from(PROTECTED_PROCESSES).map(processBaseName)
)

/**
 * Returns true if a process must never be terminated.
 *
 * `Get-Process` reports names WITHOUT the `.exe` extension (`svchost`, not
 * `svchost.exe`), while {@link PROTECTED_PROCESSES} lists them with it, so a
 * plain `Set.has()` lookup never matched on a real Windows machine. This
 * helper compares extension-less, case-insensitive names.
 */
export function isProcessProtected(name: string): boolean {
  return PROTECTED_PROCESS_BASENAMES.has(processBaseName(name))
}

/**
 * Returns true if the given filesystem path is safe to operate on.
 * Blocks writes to protected OS and personal-data paths.
 *
 * Matching respects path-segment boundaries: `C:\\Windows\\inf` protects
 * `C:\\Windows\\inf\\x` but not an unrelated `C:\\Windows\\infrastructure`.
 */
export function isPathSafe(targetPath: string): boolean {
  const normalized = path.normalize(targetPath).toLowerCase().replace(/[\\/]+$/, '')

  for (const protectedPath of PROTECTED_PATHS) {
    const p = protectedPath.toLowerCase()
    if (p.includes(':\\')) {
      // Absolute protected location: the path itself or anything below it.
      if (normalized === p || normalized.startsWith(`${p}\\`)) return false
    } else if (normalized.includes(`\\${p}\\`) || normalized.endsWith(`\\${p}`)) {
      // Personal folder name (Documents, Pictures...) anywhere in the path.
      return false
    }
  }

  return true
}

/**
 * Normalise a registry key to the PowerShell drive form (`HKLM:\\...`,
 * `HKCU:\\...`). Accepts `HKEY_LOCAL_MACHINE\\...`, `HKLM\\...` and raw
 * `Microsoft.PowerShell.Core\\Registry::...` provider paths.
 */
export function normalizeRegistryKey(key: string): string {
  return key
    .trim()
    .replace(/^Microsoft\.PowerShell\.Core\\Registry::/i, '')
    .replace(/^HKEY_LOCAL_MACHINE/i, 'HKLM:')
    .replace(/^HKEY_CURRENT_USER/i, 'HKCU:')
    .replace(/^HKLM(?!:)/i, 'HKLM:')
    .replace(/^HKCU(?!:)/i, 'HKCU:')
}

/**
 * Returns true if the key is (or lives under) a protected registry key.
 * Works for every spelling of the root hive, so a key reported as
 * `HKEY_LOCAL_MACHINE\\...` cannot slip past a `HKLM:\\...` rule.
 */
export function isRegistryKeyProtected(key: string): boolean {
  const normalized = normalizeRegistryKey(key).toLowerCase().replace(/\\+$/, '')
  return PROTECTED_REGISTRY_KEYS.some((protectedKey) => {
    const p = protectedKey.toLowerCase()
    return normalized === p || normalized.startsWith(`${p}\\`)
  })
}

/**
 * Anonymize free text before sending it to an external AI API.
 * Removes user profile paths, usernames, computer names, IPs and MACs.
 */
export function anonymizeText(text: string): string {
  const userProfile = process.env.USERPROFILE ?? ''
  const username = process.env.USERNAME ?? ''
  const computerName = process.env.COMPUTERNAME ?? ''

  // Private-use sentinels stand in for the placeholders while we work, so a
  // later pass (e.g. a username that happens to be "user") can never match
  // text we already inserted. They are swapped for the readable tags at the end.
  const USER = '\uE000'
  const COMPUTER = '\uE001'

  let out = text
  // Any profile directory, not only the current user's.
  out = out.replace(/[A-Za-z]:\\Users\\[^\\\s"']+/gi, `C:\\Users\\${USER}`)
  // Guard against empty / very short values: an empty RegExp would match
  // between every character and corrupt the whole string.
  if (userProfile.length > 2) {
    out = out.replace(new RegExp(escapeRegex(userProfile), 'gi'), `C:\\Users\\${USER}`)
  }
  if (username.length > 2) {
    out = out.replace(wordRegex(username), USER)
  }
  if (computerName.length > 2) {
    out = out.replace(wordRegex(computerName), COMPUTER)
  }
  return (
    out
      // Remove IP addresses
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
      // Remove MAC addresses
      .replace(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/g, '[MAC]')
      .split(USER)
      .join('[USER]')
      .split(COMPUTER)
      .join('[COMPUTER]')
  )
}

/**
 * Anonymize system context before sending to external AI APIs.
 * Walks the structure and sanitises every string value, so the result is
 * always valid (no JSON text surgery that could produce broken escapes).
 */
export function anonymizeForAI<T extends Record<string, unknown>>(data: T): T {
  return mapStrings(data, anonymizeText) as T
}

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, mapStrings(v, fn)])
    )
  }
  return value
}

/** Whole-word, case-insensitive match (so "user" does not hit "Users"). */
function wordRegex(word: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegex(word)}(?![A-Za-z0-9])`, 'gi')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
