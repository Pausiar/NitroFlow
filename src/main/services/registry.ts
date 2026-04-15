import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import log from 'electron-log'
import { runPowerShell } from '../utils/powershell'
import { PROTECTED_REGISTRY_KEYS } from '../utils/security'
import type { RegistryEntry, RegistryCleanResult } from '../../shared/types'

const execAsync = promisify(exec)

export class RegistryService {
  private backupDir: string

  constructor() {
    this.backupDir = path.join(os.homedir(), 'NitroFlow', 'registry-backups')
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true })
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

    const safe = toClean.filter((e) => !this.isProtectedKey(e.key))
    const blocked = toClean.length - safe.length

    if (safe.length === 0) {
      return { fixed: 0, backed_up: false, errors: [`${blocked} entradas están protegidas`] }
    }

    const backupPath = await this.createBackup(safe.map((e) => e.key))
    const errors: string[] = []
    let fixed = 0

    for (const entry of safe) {
      try {
        await this.deleteRegistryValue(entry.key, entry.value)
        fixed++
      } catch (err) {
        errors.push(`Error eliminando ${entry.key}\\${entry.value}: ${String(err)}`)
      }
    }

    return { fixed, backed_up: !!backupPath, errors, backupPath: backupPath ?? undefined }
  }

  private async scanUninstalledSoftware(): Promise<RegistryEntry[]> {
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
          if ($displayName -and $installLocation -and !(Test-Path $installLocation)) {
            $orphans += [PSCustomObject]@{
              Key = $_.PSPath -replace 'Microsoft.PowerShell.Core\\Registry::', ''
              Value = 'InstallLocation'
              DisplayName = $displayName
              InstallLocation = $installLocation
            }
          }
        }
      }
      $orphans | ConvertTo-Json
    `
    const stdout = await runPowerShell(ps, 20000)
    if (!stdout.trim()) return []
    const raw = JSON.parse(stdout)
    const items = Array.isArray(raw) ? raw : [raw]
    return items.map((item: Record<string, unknown>, i: number) => ({
      id: `uninstall_${i}`,
      key: String(item.Key ?? ''),
      value: 'InstallLocation',
      type: 'REG_SZ',
      reason: `Software desinstalado: "${item.DisplayName}" apunta a carpeta inexistente "${item.InstallLocation}"`,
      severity: 'Low' as const,
      safe: true
    }))
  }

  private async scanObsoleteStartupEntries(): Promise<RegistryEntry[]> {
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
            $cmd = $_.Value -split '"' | Where-Object { $_ -match '\\.exe' } | Select-Object -First 1
            if ($cmd) {
              $exePath = $cmd.Trim()
              if ($exePath -and !(Test-Path $exePath -ErrorAction SilentlyContinue)) {
                $orphans += [PSCustomObject]@{
                  Key = $key
                  ValueName = $_.Name
                  Command = $_.Value
                }
              }
            }
          }
        }
      }
      $orphans | ConvertTo-Json
    `
    try {
      const stdout = await runPowerShell(ps, 15000)
      if (!stdout.trim()) return []
      const raw = JSON.parse(stdout)
      const items = Array.isArray(raw) ? raw : [raw]
      return items.map((item: Record<string, unknown>, i: number) => ({
        id: `startup_orphan_${i}`,
        key: String(item.Key ?? ''),
        value: String(item.ValueName ?? ''),
        type: 'REG_SZ',
        reason: `Entrada de inicio apunta a ejecutable inexistente: "${item.Command}"`,
        severity: 'Medium' as const,
        safe: true
      }))
    } catch {
      return []
    }
  }

  private async deleteRegistryValue(key: string, value: string): Promise<void> {
    // Use single-quoted strings inside PS to avoid injection
    const safeKey = key.replace(/'/g, "''")
    const safeValue = value.replace(/'/g, "''")
    const ps = `Remove-ItemProperty -Path '${safeKey}' -Name '${safeValue}' -ErrorAction Stop`
    await runPowerShell(ps, 5000)
  }

  private async createBackup(keys: string[]): Promise<string | null> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupFile = path.join(this.backupDir, `backup-${timestamp}.reg`)
      const uniqueRoots = [...new Set(keys.map((k) => k.split('\\')[0]))]
      for (const root of uniqueRoots) {
        const regRoot = root.replace('HKLM:', 'HKEY_LOCAL_MACHINE').replace('HKCU:', 'HKEY_CURRENT_USER')
        await execAsync(`reg export "${regRoot}" "${backupFile}" /y`, { timeout: 30000 })
      }
      log.info(`Registry backup created: ${backupFile}`)
      return backupFile
    } catch (err) {
      log.error('Registry backup failed:', err)
      return null
    }
  }

  private isProtectedKey(key: string): boolean {
    return PROTECTED_REGISTRY_KEYS.some((protected_key) =>
      key.toLowerCase().includes(protected_key.toLowerCase())
    )
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
