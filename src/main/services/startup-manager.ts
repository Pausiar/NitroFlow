import log from 'electron-log'
import { runPowerShellResult } from '../utils/powershell'
import type { PowerShellRunner } from '../utils/powershell'
import { describePowerShellError } from '../utils/ps-errors'
import type { StartupEntry } from '../../shared/types'

const APPROVED_BASE = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'

/** Where Windows records the enabled/disabled flag for each kind of entry. */
const APPROVED_KEYS: Partial<Record<StartupEntry['location'], string>> = {
  HKCU: `HKCU:\\${APPROVED_BASE}\\Run`,
  HKLM: `HKLM:\\${APPROVED_BASE}\\Run`,
  Startup: `HKCU:\\${APPROVED_BASE}\\StartupFolder`
}

interface InternalEntry {
  entry: StartupEntry
  /** Value name inside the StartupApproved key (file name for Startup-folder items). */
  approvedName: string
}

export class StartupManager {
  private entries: Map<string, InternalEntry> = new Map()

  /** `ps` is injectable so the service can be tested without PowerShell. */
  constructor(private readonly ps: PowerShellRunner = runPowerShellResult) {}

  async listEntries(): Promise<StartupEntry[]> {
    if (process.platform !== 'win32') {
      return this.getMockEntries()
    }
    try {
      // The enabled state lives in StartupApproved\*: the first byte of the
      // binary value is even (02/06) when enabled and odd (03/07) when
      // disabled; a missing value means enabled. The old code hard-coded
      // Enabled = $true, so entries disabled in a previous session came back
      // as "enabled" after restarting the app.
      const ps = `
        function Get-Approved($path, $name) {
          try {
            $v = (Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction Stop).$name
            if ($v -is [byte[]] -and $v.Length -gt 0) { return (($v[0] -band 1) -eq 0) }
          } catch { }
          return $true
        }
        $approvedHkcu = '${APPROVED_KEYS.HKCU}'
        $approvedHklm = '${APPROVED_KEYS.HKLM}'
        $approvedFolder = '${APPROVED_KEYS.Startup}'
        $entries = @()

        $hkcuRun = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
        $props = Get-ItemProperty $hkcuRun -ErrorAction SilentlyContinue
        if ($props) {
          $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
            $entries += [PSCustomObject]@{
              Id = 'hkcu_' + $_.Name
              Name = $_.Name
              Command = [string]$_.Value
              Location = 'HKCU'
              Enabled = [bool](Get-Approved $approvedHkcu $_.Name)
              ApprovedName = $_.Name
            }
          }
        }

        $hklmRun = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
        $props = Get-ItemProperty $hklmRun -ErrorAction SilentlyContinue
        if ($props) {
          $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
            $entries += [PSCustomObject]@{
              Id = 'hklm_' + $_.Name
              Name = $_.Name
              Command = [string]$_.Value
              Location = 'HKLM'
              Enabled = [bool](Get-Approved $approvedHklm $_.Name)
              ApprovedName = $_.Name
            }
          }
        }

        $startupFolder = [Environment]::GetFolderPath('Startup')
        Get-ChildItem $startupFolder -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
            $entries += [PSCustomObject]@{
              Id = 'startup_' + $_.Name
              Name = $_.BaseName
              Command = $_.FullName
              Location = 'Startup'
              Enabled = [bool](Get-Approved $approvedFolder $_.Name)
              ApprovedName = $_.Name
            }
          }

        @($entries) | ConvertTo-Json -Compress
      `
      const { stdout } = await this.ps(ps, 20000)
      this.entries.clear()
      if (!stdout.trim() || stdout.trim() === 'null') return []

      const raw = JSON.parse(stdout)
      const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw]
      const result: StartupEntry[] = []
      for (const item of items) {
        if (!item || !item.Id) continue
        const entry: StartupEntry = {
          id: String(item.Id),
          name: String(item.Name ?? ''),
          command: String(item.Command ?? ''),
          publisher: '',
          location: (item.Location as StartupEntry['location']) ?? 'HKCU',
          enabled: Boolean(item.Enabled ?? true),
          impact: this.estimateImpact(String(item.Command ?? '')),
          description: ''
        }
        this.entries.set(entry.id, {
          entry,
          approvedName: String(item.ApprovedName ?? item.Name ?? '')
        })
        result.push(entry)
      }
      return result
    } catch (err) {
      // Never show invented programs on a real Windows machine.
      log.warn('listStartupEntries error:', err)
      return []
    }
  }

  async toggleEntry(id: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'win32') {
      return { success: true }
    }
    if (typeof id !== 'string' || typeof enabled !== 'boolean') {
      return { success: false, error: 'Petición inválida' }
    }

    // The renderer may toggle before this process has listed entries (e.g.
    // after the main process restarted): refresh once instead of failing.
    let internal = this.entries.get(id)
    if (!internal) {
      await this.listEntries()
      internal = this.entries.get(id)
    }
    if (!internal) {
      return { success: false, error: `Entrada no encontrada: ${id}` }
    }

    const { entry, approvedName } = internal
    const approvedKey = APPROVED_KEYS[entry.location]
    if (!approvedKey) {
      return { success: false, error: `Ubicación no soportada: ${entry.location}` }
    }

    try {
      const safeName = approvedName.replace(/'/g, "''")
      const safeKey = approvedKey.replace(/'/g, "''")
      // 02 = enabled, 03 = disabled; the remaining 8 bytes hold a FILETIME.
      const flag = enabled ? 2 : 3
      const ps = `
        if (-not (Test-Path -LiteralPath '${safeKey}')) { New-Item -Path '${safeKey}' -Force -ErrorAction Stop | Out-Null }
        $val = [byte[]](${flag},0,0,0,0,0,0,0,0,0,0,0)
        Set-ItemProperty -LiteralPath '${safeKey}' -Name '${safeName}' -Value $val -Type Binary -ErrorAction Stop
      `
      const result = await this.ps(ps, 10000)
      if (!result.ok) {
        return { success: false, error: describePowerShellError(result.stderr) }
      }
      entry.enabled = enabled
      return { success: true }
    } catch (err) {
      log.error('toggleStartupEntry error:', err)
      return { success: false, error: String(err) }
    }
  }

  private estimateImpact(command: string): StartupEntry['impact'] {
    const highImpact = ['chrome', 'teams', 'discord', 'slack', 'spotify', 'onedrive', 'skype']
    const mediumImpact = ['steam', 'adobe', 'dropbox', 'googledrive', 'zoom']
    const cmd = command.toLowerCase()
    if (highImpact.some((h) => cmd.includes(h))) return 'High'
    if (mediumImpact.some((m) => cmd.includes(m))) return 'Medium'
    return 'Low'
  }

  private getMockEntries(): StartupEntry[] {
    return [
      { id: 'hkcu_Teams', name: 'Microsoft Teams', command: 'C:\\...\\Teams.exe --processStart', publisher: 'Microsoft', location: 'HKCU', enabled: true, impact: 'High', description: 'Microsoft Teams' },
      { id: 'hkcu_Discord', name: 'Discord', command: 'C:\\...\\Discord.exe', publisher: 'Discord Inc.', location: 'HKCU', enabled: true, impact: 'High', description: 'Discord' },
      { id: 'hklm_OneDrive', name: 'OneDrive', command: 'C:\\...\\OneDrive.exe /background', publisher: 'Microsoft', location: 'HKLM', enabled: true, impact: 'Medium', description: 'OneDrive' },
      { id: 'hkcu_Steam', name: 'Steam', command: 'C:\\...\\Steam.exe -silent', publisher: 'Valve', location: 'HKCU', enabled: false, impact: 'Medium', description: 'Steam' }
    ]
  }
}
