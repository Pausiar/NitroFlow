import log from 'electron-log'
import { runPowerShell } from '../utils/powershell'
import type { PerformanceMode, OptimizerStatus } from '../../shared/types'
import { SettingsService } from './settings'

// GUIDs for built-in Windows power plans
const POWER_PLAN_BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e'
const POWER_PLAN_HIGH_PERFORMANCE = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'

export class OptimizerService {
  private static instance: OptimizerService

  static getInstance(): OptimizerService {
    if (!OptimizerService.instance) {
      OptimizerService.instance = new OptimizerService()
    }
    return OptimizerService.instance
  }

  getStatus(): OptimizerStatus {
    const settings = SettingsService.getInstance().get()
    return {
      currentMode: settings.performanceMode,
      appliedAt: null
    }
  }

  async applyMode(mode: PerformanceMode): Promise<{ success: boolean; error?: string }> {
    try {
      if (process.platform !== 'win32') {
        SettingsService.getInstance().save({ performanceMode: mode })
        return { success: true }
      }

      switch (mode) {
        case 'balanced':
          await this.applyBalanced()
          break
        case 'performance':
          await this.applyPerformance()
          break
        case 'gaming':
          await this.applyGaming()
          break
      }

      SettingsService.getInstance().save({ performanceMode: mode })
      log.info(`OptimizerService: applied mode "${mode}"`)
      return { success: true }
    } catch (err) {
      log.error('OptimizerService.applyMode error:', err)
      return { success: false, error: String(err) }
    }
  }

  // ── Balanced ────────────────────────────────────────────────────────────────

  private async applyBalanced(): Promise<void> {
    // Restore balanced power plan
    await runPowerShell(
      `powercfg /setactive ${POWER_PLAN_BALANCED}`,
      10000
    )

    // Restore visual effects to default (let Windows decide)
    await runPowerShell(
      `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name VisualFXSetting -Value 0 -Type DWord -ErrorAction SilentlyContinue`,
      5000
    )

    // Re-enable network throttling
    await runPowerShell(
      `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name NetworkThrottlingIndex -Value 10 -Type DWord -ErrorAction SilentlyContinue`,
      5000
    )

    // Remove Nagle-disable tweaks on all TCP interfaces
    await runPowerShell(
      `$path = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
       Get-ChildItem -Path $path -ErrorAction SilentlyContinue | ForEach-Object {
         Remove-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -ErrorAction SilentlyContinue
         Remove-ItemProperty -Path $_.PSPath -Name TCPNoDelay -ErrorAction SilentlyContinue
       }`,
      10000
    )

    // Restore game scheduling to normal priority
    await runPowerShell(
      `$gamesPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games'
       if (Test-Path $gamesPath) {
         Set-ItemProperty -Path $gamesPath -Name Priority -Value 2 -Type DWord -ErrorAction SilentlyContinue
         Set-ItemProperty -Path $gamesPath -Name 'Scheduling Category' -Value 'Medium' -Type String -ErrorAction SilentlyContinue
       }`,
      5000
    )
  }

  // ── Performance ─────────────────────────────────────────────────────────────

  private async applyPerformance(): Promise<void> {
    // Activate High Performance power plan (create if missing)
    await runPowerShell(
      `$plan = powercfg /list | Select-String '${POWER_PLAN_HIGH_PERFORMANCE}'
       if (-not $plan) { powercfg /duplicatescheme ${POWER_PLAN_HIGH_PERFORMANCE} }
       powercfg /setactive ${POWER_PLAN_HIGH_PERFORMANCE}`,
      10000
    )

    // Minimize visual effects for best performance
    await runPowerShell(
      `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name VisualFXSetting -Value 2 -Type DWord -ErrorAction SilentlyContinue`,
      5000
    )

    // Set CPU to 100% minimum processor state
    await runPowerShell(
      `powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 100
       powercfg /setactive SCHEME_CURRENT`,
      10000
    )

    // Disable background app CPU time limit
    await runPowerShell(
      `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name SystemResponsiveness -Value 0 -Type DWord -ErrorAction SilentlyContinue`,
      5000
    )
  }

  // ── Gaming ──────────────────────────────────────────────────────────────────

  private async applyGaming(): Promise<void> {
    // Apply everything from performance mode first
    await this.applyPerformance()

    // Disable Nagle's algorithm on all TCP interfaces (reduces latency/ping)
    await runPowerShell(
      `$path = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
       Get-ChildItem -Path $path -ErrorAction SilentlyContinue | ForEach-Object {
         Set-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -Value 1 -Type DWord -ErrorAction SilentlyContinue
         Set-ItemProperty -Path $_.PSPath -Name TCPNoDelay -Value 1 -Type DWord -ErrorAction SilentlyContinue
       }`,
      10000
    )

    // Disable network throttling (removes bandwidth cap on game traffic)
    await runPowerShell(
      `Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -Name NetworkThrottlingIndex -Value 0xffffffff -Type DWord -ErrorAction SilentlyContinue`,
      5000
    )

    // Boost scheduling priority for games in the multimedia profile
    await runPowerShell(
      `$gamesPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games'
       if (-not (Test-Path $gamesPath)) { New-Item -Path $gamesPath -Force | Out-Null }
       Set-ItemProperty -Path $gamesPath -Name Priority -Value 6 -Type DWord -ErrorAction SilentlyContinue
       Set-ItemProperty -Path $gamesPath -Name 'Scheduling Category' -Value 'High' -Type String -ErrorAction SilentlyContinue
       Set-ItemProperty -Path $gamesPath -Name 'SFIO Priority' -Value 'High' -Type String -ErrorAction SilentlyContinue`,
      5000
    )

    // Enable Windows Game Mode
    await runPowerShell(
      `$gameBarPath = 'HKCU:\\Software\\Microsoft\\GameBar'
       if (-not (Test-Path $gameBarPath)) { New-Item -Path $gameBarPath -Force | Out-Null }
       Set-ItemProperty -Path $gameBarPath -Name AllowAutoGameMode -Value 1 -Type DWord -ErrorAction SilentlyContinue
       Set-ItemProperty -Path $gameBarPath -Name AutoGameModeEnabled -Value 1 -Type DWord -ErrorAction SilentlyContinue`,
      5000
    )

    // Disable Xbox Game DVR background recording (frees GPU/RAM)
    await runPowerShell(
      `$dvrPath = 'HKCU:\\System\\GameConfigStore'
       if (-not (Test-Path $dvrPath)) { New-Item -Path $dvrPath -Force | Out-Null }
       Set-ItemProperty -Path $dvrPath -Name GameDVR_Enabled -Value 0 -Type DWord -ErrorAction SilentlyContinue
       Set-ItemProperty -Path $dvrPath -Name GameDVR_FSEBehaviorMode -Value 2 -Type DWord -ErrorAction SilentlyContinue`,
      5000
    )
  }
}
