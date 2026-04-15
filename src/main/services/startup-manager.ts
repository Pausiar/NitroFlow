import log from 'electron-log'
import { runPowerShell } from '../utils/powershell'
import type { StartupEntry } from '../../shared/types'

export class StartupManager {
  private entries: Map<string, StartupEntry> = new Map()

  async listEntries(): Promise<StartupEntry[]> {
    if (process.platform !== 'win32') {
      return this.getMockEntries()
    }
    try {
      const ps = `
        $entries = @()
        $hkcuRun = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
        $props = Get-ItemProperty $hkcuRun -ErrorAction SilentlyContinue
        if ($props) {
          $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
            $entries += [PSCustomObject]@{
              Id = 'hkcu_' + $_.Name
              Name = $_.Name
              Command = $_.Value
              Location = 'HKCU'
              Enabled = $true
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
              Command = $_.Value
              Location = 'HKLM'
              Enabled = $true
            }
          }
        }
        $startupFolder = [Environment]::GetFolderPath('Startup')
        Get-ChildItem $startupFolder -ErrorAction SilentlyContinue | ForEach-Object {
          $entries += [PSCustomObject]@{
            Id = 'startup_' + $_.Name
            Name = $_.BaseName
            Command = $_.FullName
            Location = 'Startup'
            Enabled = $true
          }
        }
        $entries | ConvertTo-Json
      `
      const stdout = await runPowerShell(ps, 15000)
      if (!stdout.trim()) return []
      const raw = JSON.parse(stdout)
      const items = Array.isArray(raw) ? raw : [raw]
      return items.map((item: Record<string, unknown>) => {
        const entry: StartupEntry = {
          id: String(item.Id ?? ''),
          name: String(item.Name ?? ''),
          command: String(item.Command ?? ''),
          publisher: '',
          location: (item.Location as StartupEntry['location']) ?? 'HKCU',
          enabled: Boolean(item.Enabled ?? true),
          impact: this.estimateImpact(String(item.Command ?? '')),
          description: ''
        }
        this.entries.set(entry.id, entry)
        return entry
      })
    } catch (err) {
      log.warn('listStartupEntries error:', err)
      return this.getMockEntries()
    }
  }

  async toggleEntry(id: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'win32') {
      return { success: true }
    }
    const entry = this.entries.get(id)
    if (!entry) {
      return { success: false, error: `Entrada no encontrada: ${id}` }
    }
    try {
      const disabledKey =
        entry.location === 'HKCU'
          ? 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
          : 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'

      const safeName = entry.name.replace(/'/g, "''")
      const safeKey = disabledKey.replace(/'/g, "''")

      const ps = enabled
        ? `$val = [byte[]](2,0,0,0,0,0,0,0,0,0,0,0); Set-ItemProperty -Path '${safeKey}' -Name '${safeName}' -Value $val -Type Binary`
        : `if (!(Test-Path '${safeKey}')) { New-Item -Path '${safeKey}' -Force | Out-Null }; $val = [byte[]](3,0,0,0,0,0,0,0,0,0,0,0); Set-ItemProperty -Path '${safeKey}' -Name '${safeName}' -Value $val -Type Binary`

      await runPowerShell(ps, 5000)
      entry.enabled = enabled
      this.entries.set(id, entry)
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
