import { execFile } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import log from 'electron-log'
import { runPowerShell, runPowerShellResult } from '../utils/powershell'
import { isRegistryKeyProtected, normalizeRegistryKey } from '../utils/security'
import type { RegistryEntry, RegistryCleanResult } from '../../shared/types'

const execFileAsync = promisify(execFile)

/**
 * Converts a PowerShell-drive key (`HKCU:\Software\X`) to the form reg.exe
 * expects (`HKEY_CURRENT_USER\Software\X`).
 */
export function toRegExePath(key: string): string {
  return normalizeRegistryKey(key)
    .replace(/^HKLM:/i, 'HKEY_LOCAL_MACHINE')
    .replace(/^HKCU:/i, 'HKEY_CURRENT_USER')
}

/**
 * Stable id derived from the key + value name. The previous index-based ids
 * (`uninstall_0`, ...) could point at a *different* entry after a re-scan
 * (the clean step rescans), so the user could delete something they never
 * selected.
 */
export function registryEntryId(key: string, value: string): string {
  const hash = createHash('sha1')
    .update(`${normalizeRegistryKey(key).toLowerCase()}|${value.toLowerCase()}`)
    .digest('hex')
    .slice(0, 12)
  return `reg_${hash}`
}

export class RegistryService {
  private backupDir: string

  constructor() {
    this.backupDir = path.join(os.homedir(), 'NitroFlow', 'registry-backups')
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true })
      }
    } catch (err) {
      // Do not crash the whole app at startup; backup creation will fail
      // later and the clean step will refuse to run without a backup.
      log.warn('Could not create registry backup directory:', err)
    }
  }

  async scan(): Promise<RegistryEntry[]> {
    if (process.platform !== 'win32') {
      return this.getMockEntries()
    }
    const entries: RegistryEntry[] = []
    const scanners = [
      this.scanUninstalledSoftware.bind(this),
      this.scanObsoleteStartupEntries.bind(this)
    ]
    for (const scanner of scanners) {
      try {
        const found = await scanner()
        entries.push(...found)
      } catch (err) {
        log.warn('Registry scan partial error:', err)
      }
    }
    return entries
  }

  async clean(entryIds: string[]): Promise<RegistryCleanResult & { backupPath?: string }> {
    if (process.platform !== 'win32') {
      return { fixed: entryIds.length, backed_up: true, errors: [], backupPath: undefined }
    }

    const allEntries = await this.scan()
    const toClean = allEntries.filter((e) => entryIds.includes(e.id))

    if (toClean.length === 0) {
      return {
        fixed: 0,
        backed_up: false,
        errors: ['No se encontraron las entradas seleccionadas (el registro cambió). Vuelve a escanear.']
      }
    }

    const safe = toClean.filter((e) => !isRegistryKeyProtected(e.key))
    const blocked = toClean.length - safe.length

    if (safe.length === 0) {
      return { fixed: 0, backed_up: false, errors: [`${blocked} entradas están protegidas`] }
    }

    // A backup is mandatory: never modify the registry without one.
    const backupPath = await this.createBackup(safe.map((e) => e.key))
    if (!backupPath) {
      return {
        fixed: 0,
        backed_up: false,
        errors: ['No se pudo crear la copia de seguridad del registro; no se ha modificado nada.']
      }
    }

    const errors: string[] = []
    if (blocked > 0) errors.push(`${blocked} entradas protegidas omitidas`)
    let fixed = 0

    for (const entry of safe) {
      try {
        await this.deleteRegistryValue(entry.key, entry.value)
        fixed++
      } catch (err) {
        errors.push(`Error eliminando ${entry.key}\\${entry.value}: ${String(err)}`)
      }
    }

    return { fixed, backed_up: true, errors, backupPath }
  }

  private async scanUninstalledSoftware(): Promise<RegistryEntry[]> {
    // Only flag an entry when its drive is actually present: software on a
    // disconnected USB/network drive is not "uninstalled".
    const ps = `
      $keys = @(
        'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
        'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
      )
      $orphans = @()
      foreach ($key in $keys) {
        Get-ChildItem $key -ErrorAction SilentlyContinue | ForEach-Object {
          $displayName = $_.GetValue('DisplayName')
          $installLocation = $_.GetValue('InstallLocation')
          if ($displayName -and $installLocation) {
            $loc = [Environment]::ExpandEnvironmentVariables(([string]$installLocation).Trim().Trim('"'))
            $root = [System.IO.Path]::GetPathRoot($loc)
            if ($root -and (Test-Path -LiteralPath $root) -and !(Test-Path -LiteralPath $loc)) {
              $orphans += [PSCustomObject]@{
                Key = $_.PSPath -replace '^Microsoft\\.PowerShell\\.Core\\\\Registry::', ''
                DisplayName = $displayName
                InstallLocation = $installLocation
              }
            }
          }
        }
      }
      @($orphans) | ConvertTo-Json -Compress
    `
    const stdout = await runPowerShell(ps, 30000)
    if (!stdout.trim()) return []
    const raw = JSON.parse(stdout)
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw]
    return items
      .filter((item) => item && item.Key)
      .map((item) => {
        const key = normalizeRegistryKey(String(item.Key))
        return {
          id: registryEntryId(key, 'InstallLocation'),
          key,
          value: 'InstallLocation',
          type: 'REG_SZ',
          reason: `Software desinstalado: "${item.DisplayName}" apunta a carpeta inexistente "${item.InstallLocation}"`,
          severity: 'Low' as const,
          safe: true
        }
      })
  }

  private async scanObsoleteStartupEntries(): Promise<RegistryEntry[]> {
    // Extract the executable the way Windows does: a quoted path, or an
    // unquoted path up to the first ".exe" (arguments follow it). The old
    // code treated "C:\\App\\app.exe /background" as a single file name and
    // flagged perfectly valid entries as orphans.
    const ps = `
      $runKeys = @(
        'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
        'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
      )
      $orphans = @()
      foreach ($key in $runKeys) {
        $props = Get-ItemProperty $key -ErrorAction SilentlyContinue
        if ($props) {
          $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
            $cmd = [string]$_.Value
            $exe = $null
            if ($cmd -match '^\\s*"([^"]+)"') { $exe = $Matches[1] }
            elseif ($cmd -match '^\\s*(.+?\\.exe)(\\s|$)') { $exe = $Matches[1] }
            if ($exe) {
              $exe = [Environment]::ExpandEnvironmentVariables($exe.Trim())
              $exists = $false
              if ([System.IO.Path]::IsPathRooted($exe)) {
                $root = [System.IO.Path]::GetPathRoot($exe)
                # Unreachable drive: do not claim the program is gone.
                $exists = (-not (Test-Path -LiteralPath $root)) -or (Test-Path -LiteralPath $exe)
              } else {
                $exists = [bool](Get-Command $exe -ErrorAction SilentlyContinue)
              }
              if (-not $exists) {
                $orphans += [PSCustomObject]@{
                  Key = $key
                  ValueName = $_.Name
                  Command = $cmd
                }
              }
            }
          }
        }
      }
      @($orphans) | ConvertTo-Json -Compress
    `
    try {
      const stdout = await runPowerShell(ps, 20000)
      if (!stdout.trim()) return []
      const raw = JSON.parse(stdout)
      const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw]
      return items
        .filter((item) => item && item.Key && item.ValueName)
        .map((item) => {
          const key = normalizeRegistryKey(String(item.Key))
          const value = String(item.ValueName)
          return {
            id: registryEntryId(key, value),
            key,
            value,
            type: 'REG_SZ',
            reason: `Entrada de inicio apunta a ejecutable inexistente: "${item.Command}"`,
            severity: 'Medium' as const,
            safe: true
          }
        })
    } catch (err) {
      log.warn('scanObsoleteStartupEntries error:', err)
      return []
    }
  }

  private async deleteRegistryValue(key: string, value: string): Promise<void> {
    const normalized = normalizeRegistryKey(key)
    if (!/^(HKLM|HKCU):\\/i.test(normalized)) {
      throw new Error('Clave de registro no soportada')
    }
    // Single-quoted strings inside PS avoid injection; -LiteralPath avoids
    // wildcard expansion of characters such as "[" in key names.
    const safeKey = normalized.replace(/'/g, "''")
    const safeValue = value.replace(/'/g, "''")
    const ps = `Remove-ItemProperty -LiteralPath '${safeKey}' -Name '${safeValue}' -ErrorAction Stop`
    const result = await runPowerShellResult(ps, 10000)
    // runPowerShell never rejects, so the exit state must be checked here.
    if (!result.ok) {
      throw new Error(result.stderr.split(/\r?\n/)[0] || 'No se pudo eliminar el valor')
    }
  }

  /**
   * Exports ONLY the keys that are about to be modified (a few KB), one .reg
   * file per key, into a fresh timestamped folder. Returns that folder, or
   * null if any export failed.
   *
   * The previous implementation exported the entire HKEY_CURRENT_USER /
   * HKEY_LOCAL_MACHINE hive (hundreds of MB, easily past the 30 s timeout),
   * and each root overwrote the same file, so the HKLM backup erased the HKCU
   * one.
   */
  private async createBackup(keys: string[]): Promise<string | null> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const folder = path.join(this.backupDir, `backup-${timestamp}`)
      fs.mkdirSync(folder, { recursive: true })

      const uniqueKeys = [...new Set(keys.map((k) => normalizeRegistryKey(k)))]
      for (let i = 0; i < uniqueKeys.length; i++) {
        const file = path.join(folder, `${String(i + 1).padStart(3, '0')}.reg`)
        await execFileAsync('reg', ['export', toRegExePath(uniqueKeys[i]), file, '/y'], {
          timeout: 30000
        })
      }
      log.info(`Registry backup created: ${folder} (${uniqueKeys.length} keys)`)
      return folder
    } catch (err) {
      log.error('Registry backup failed:', err)
      return null
    }
  }

  private getMockEntries(): RegistryEntry[] {
    return [
      {
        id: 'mock_1',
        key: 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OldApp',
        value: 'InstallLocation',
        type: 'REG_SZ',
        reason: 'Software desinstalado "OldApp 2.1" apunta a carpeta inexistente',
        severity: 'Low',
        safe: true
      },
      {
        id: 'mock_2',
        key: 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
        value: 'ObsoleteUpdater',
        type: 'REG_SZ',
        reason: 'Entrada de inicio apunta a ejecutable inexistente: C:\\Program Files\\OldApp\\updater.exe',
        severity: 'Medium',
        safe: true
      }
    ]
  }
}
