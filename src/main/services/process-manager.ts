import * as os from 'os'
import log from 'electron-log'
import { runPowerShellResult } from '../utils/powershell'
import type { PowerShellRunner } from '../utils/powershell'
import { isProcessProtected } from '../utils/security'
import { describePowerShellError } from '../utils/ps-errors'
import type { ProcessInfo, ServiceInfo } from '../../shared/types'

/**
 * Services that Windows (or the user's security) depends on. They are never
 * offered for optimisation in the UI AND are rejected by the backend, so a
 * compromised or buggy renderer cannot stop them either.
 */
const CRITICAL_SERVICES: ReadonlySet<string> = new Set([
  'windefend', 'wuauserv', 'bits', 'cryptsvc', 'eventlog', 'lsa', 'samss',
  'schedule', 'spooler', 'rpcss', 'rpceptmapper', 'dcomlaunch', 'lsm',
  'plugplay', 'power', 'profsvc', 'bfe', 'mpssvc', 'dhcp', 'dnscache', 'nsi',
  'lanmanworkstation', 'keyiso', 'trustedinstaller', 'usermanager',
  'systemeventsbroker', 'timebrokersvc', 'gpsvc', 'winmgmt', 'wscsvc',
  'securityhealthservice', 'sgrmbroker'
])

/** How many processes the list returns (sorted by CPU, then RAM). */
const MAX_PROCESSES = 80

interface RawProcess {
  Id?: unknown
  ProcessName?: unknown
  CPU?: unknown
  WorkingSet?: unknown
  Path?: unknown
  Description?: unknown
}

interface CpuSample {
  at: number
  /** Cumulative CPU seconds per PID. */
  cpu: Map<number, number>
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class ProcessManager {
  private lastSample: CpuSample | null = null

  /** `ps` is injectable so the service can be tested without PowerShell. */
  constructor(private readonly ps: PowerShellRunner = runPowerShellResult) {}

  async listProcesses(): Promise<ProcessInfo[]> {
    if (process.platform !== 'win32') {
      return this.getMockProcesses()
    }
    try {
      // `Get-Process.CPU` is cumulative CPU *seconds*, not a percentage. To
      // show a real CPU% we need two samples; the first call primes one.
      if (!this.lastSample) {
        const primed = await this.sampleProcesses()
        if (primed) this.lastSample = primed.sample
        await sleep(800)
      }

      const current = await this.sampleProcesses()
      if (!current) return []

      const previous = this.lastSample
      const elapsedSec = previous ? (current.sample.at - previous.at) / 1000 : 0
      const cores = Math.max(1, os.cpus().length)
      this.lastSample = current.sample

      const list: ProcessInfo[] = current.raw.map((p) => {
        const pid = Number(p.Id ?? 0)
        const name = String(p.ProcessName ?? '')
        const cpuSec = Number(p.CPU ?? 0)
        const prevSec = previous?.cpu.get(pid)

        let cpuPercent = 0
        if (prevSec !== undefined && elapsedSec > 0.3 && cpuSec >= prevSec) {
          cpuPercent = ((cpuSec - prevSec) / elapsedSec / cores) * 100
        }

        return {
          pid,
          name,
          cpuPercent: Math.min(100, Math.round(cpuPercent * 10) / 10),
          ramMB: Math.round(Number(p.WorkingSet ?? 0) / (1024 * 1024)),
          status: 'Running',
          path: String(p.Path ?? ''),
          description: String(p.Description ?? ''),
          canTerminate: !isProcessProtected(name) && pid !== process.pid
        }
      })

      return list
        .sort((a, b) => b.cpuPercent - a.cpuPercent || b.ramMB - a.ramMB)
        .slice(0, MAX_PROCESSES)
    } catch (err) {
      // Never show invented processes on a real Windows machine.
      log.warn('listProcesses error:', err)
      return []
    }
  }

  async killProcess(pid: number): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'win32') {
      return { success: true }
    }
    // Validate pid is a safe integer
    if (!Number.isInteger(pid) || pid <= 0) {
      return { success: false, error: 'PID inválido' }
    }
    if (pid === process.pid) {
      return { success: false, error: 'NitroFlow no puede terminarse a sí mismo' }
    }
    try {
      // First verify the process still exists and is not protected
      const check = await this.ps(
        `$proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
         if ($proc) { $proc.ProcessName }`,
        5000
      )
      const name = check.stdout.trim()
      if (!name) {
        return { success: false, error: 'El proceso ya no existe' }
      }
      if (isProcessProtected(name)) {
        return { success: false, error: `El proceso "${name}" está protegido y no puede terminarse` }
      }

      // `-ErrorAction Stop` is required: the PowerShell wrapper defaults to
      // SilentlyContinue, which would otherwise report success on failure.
      const result = await this.ps(`Stop-Process -Id ${pid} -Force -ErrorAction Stop`, 8000)
      if (!result.ok) {
        return { success: false, error: describePowerShellError(result.stderr) }
      }
      return { success: true }
    } catch (err) {
      log.error('killProcess error:', err)
      return { success: false, error: String(err) }
    }
  }

  async listServices(): Promise<ServiceInfo[]> {
    if (process.platform !== 'win32') {
      return this.getMockServices()
    }
    try {
      const ps = `
        Get-Service | Select-Object Name, DisplayName, Status, StartType |
        ConvertTo-Json -Compress
      `
      const { stdout } = await this.ps(ps, 15000)
      if (!stdout) return []
      const raw: unknown = JSON.parse(stdout)
      const items = Array.isArray(raw) ? raw : [raw]
      return items.map((s: unknown) => {
        const svc = s as Record<string, unknown>
        return {
          name: String(svc.Name ?? ''),
          displayName: String(svc.DisplayName ?? ''),
          status: this.mapServiceStatus(Number(svc.Status ?? 1)),
          startType: this.mapStartType(Number(svc.StartType ?? 1)),
          description: String(svc.Description ?? ''),
          canOptimize: this.canOptimizeService(String(svc.Name ?? ''))
        }
      })
    } catch (err) {
      log.warn('listServices error:', err)
      return []
    }
  }

  async setServiceState(
    name: string,
    action: 'start' | 'stop' | 'disable'
  ): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'win32') {
      return { success: true }
    }
    if (typeof name !== 'string' || !['start', 'stop', 'disable'].includes(action)) {
      return { success: false, error: 'Petición de servicio inválida' }
    }
    // Sanitize service name: allow only alphanumeric, underscore, hyphen, dot
    const safeName = name.replace(/[^a-zA-Z0-9_\-.]/g, '')
    if (!safeName || safeName !== name) {
      return { success: false, error: 'Nombre de servicio inválido' }
    }
    // Starting a critical service is harmless; stopping/disabling it is not.
    if (action !== 'start' && !this.canOptimizeService(safeName)) {
      return {
        success: false,
        error: `El servicio "${safeName}" es crítico para Windows y no se puede modificar`
      }
    }
    try {
      let ps: string
      switch (action) {
        case 'start':
          ps = `Start-Service -Name '${safeName}' -ErrorAction Stop`
          break
        case 'stop':
          ps = `Stop-Service -Name '${safeName}' -Force -ErrorAction Stop`
          break
        case 'disable':
          ps = `Set-Service -Name '${safeName}' -StartupType Disabled -ErrorAction Stop`
          break
      }
      const result = await this.ps(ps, 20000)
      if (!result.ok) {
        return { success: false, error: describePowerShellError(result.stderr) }
      }
      return { success: true }
    } catch (err) {
      log.error('setServiceState error:', err)
      return { success: false, error: String(err) }
    }
  }

  /** Reads the process table once and returns it with a timestamped CPU sample. */
  private async sampleProcesses(): Promise<{ raw: RawProcess[]; sample: CpuSample } | null> {
    const ps = `
      Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet, Path, Description |
      ConvertTo-Json -Compress
    `
    const { stdout } = await this.ps(ps, 20000)
    if (!stdout) return null
    const parsed: unknown = JSON.parse(stdout)
    const raw = (Array.isArray(parsed) ? parsed : [parsed]) as RawProcess[]
    const cpu = new Map<number, number>()
    for (const p of raw) cpu.set(Number(p.Id ?? 0), Number(p.CPU ?? 0))
    return { raw, sample: { at: Date.now(), cpu } }
  }

  private mapServiceStatus(n: number): ServiceInfo['status'] {
    const map: Record<number, ServiceInfo['status']> = {
      1: 'Stopped',
      2: 'StartPending',
      3: 'StopPending',
      4: 'Running',
      6: 'Paused'
    }
    return map[n] ?? 'Stopped'
  }

  private mapStartType(n: number): ServiceInfo['startType'] {
    // ServiceStartMode: Boot=0, System=1, Automatic=2, Manual=3, Disabled=4
    const map: Record<number, ServiceInfo['startType']> = {
      0: 'Auto',
      1: 'Auto',
      2: 'Auto',
      3: 'Manual',
      4: 'Disabled'
    }
    return map[n] ?? 'Manual'
  }

  private canOptimizeService(name: string): boolean {
    return !CRITICAL_SERVICES.has(name.toLowerCase())
  }

  private getMockProcesses(): ProcessInfo[] {
    return [
      { pid: 1234, name: 'chrome.exe', cpuPercent: 12.5, ramMB: 450, status: 'Running', path: '', description: 'Google Chrome', canTerminate: true },
      { pid: 2345, name: 'code.exe', cpuPercent: 8.3, ramMB: 380, status: 'Running', path: '', description: 'Visual Studio Code', canTerminate: true },
      { pid: 3456, name: 'explorer.exe', cpuPercent: 0.5, ramMB: 60, status: 'Running', path: '', description: 'Windows Explorer', canTerminate: false },
      { pid: 4567, name: 'svchost.exe', cpuPercent: 2.1, ramMB: 120, status: 'Running', path: '', description: 'Service Host', canTerminate: false }
    ]
  }

  private getMockServices(): ServiceInfo[] {
    return [
      { name: 'Themes', displayName: 'Themes', status: 'Running', startType: 'Auto', description: 'Provides user experience theme management', canOptimize: true },
      { name: 'SysMain', displayName: 'SysMain (Superfetch)', status: 'Running', startType: 'Auto', description: 'Maintains and improves system performance', canOptimize: true },
      { name: 'WSearch', displayName: 'Windows Search', status: 'Running', startType: 'Auto', description: 'Provides content indexing and search', canOptimize: true }
    ]
  }
}
