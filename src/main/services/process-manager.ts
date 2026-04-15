import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import { runPowerShell } from '../utils/powershell'
import { PROTECTED_PROCESSES } from '../utils/security'
import type { ProcessInfo, ServiceInfo } from '../../shared/types'

const execAsync = promisify(exec)

export class ProcessManager {
  async listProcesses(): Promise<ProcessInfo[]> {
    if (process.platform !== 'win32') {
      return this.getMockProcesses()
    }
    try {
      const ps = `
        Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet, Path, Description |
        Sort-Object CPU -Descending | Select-Object -First 50 |
        ConvertTo-Json
      `
      const stdout = await runPowerShell(ps, 10000)
      const raw: unknown[] = JSON.parse(stdout)
      const items = Array.isArray(raw) ? raw : [raw]
      return items.map((p: unknown) => {
        const proc = p as Record<string, unknown>
        const name = String(proc.ProcessName ?? '')
        return {
          pid: Number(proc.Id ?? 0),
          name,
          cpuPercent: Math.round(Number(proc.CPU ?? 0) * 10) / 10,
          ramMB: Math.round(Number(proc.WorkingSet ?? 0) / (1024 * 1024)),
          status: 'Running',
          path: String(proc.Path ?? ''),
          description: String(proc.Description ?? ''),
          canTerminate: !PROTECTED_PROCESSES.has(name.toLowerCase())
        }
      })
    } catch (err) {
      log.warn('listProcesses error:', err)
      return this.getMockProcesses()
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
    try {
      // First verify the process is not protected
      const checkPs = `
        $proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
        if ($proc) { $proc.ProcessName } else { '' }
      `
      const name = (await runPowerShell(checkPs, 5000)).trim().toLowerCase()
      if (PROTECTED_PROCESSES.has(name)) {
        return { success: false, error: `El proceso "${name}" está protegido y no puede terminarse` }
      }
      await runPowerShell(`Stop-Process -Id ${pid} -Force`, 5000)
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
        Get-Service | Select-Object Name, DisplayName, Status, StartType, Description |
        ConvertTo-Json
      `
      const stdout = await runPowerShell(ps, 15000)
      const raw: unknown[] = JSON.parse(stdout)
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
      return this.getMockServices()
    }
  }

  async setServiceState(
    name: string,
    action: 'start' | 'stop' | 'disable'
  ): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'win32') {
      return { success: true }
    }
    // Sanitize service name: allow only alphanumeric, underscore, hyphen, dot
    const safeName = name.replace(/[^a-zA-Z0-9_\-.]/g, '')
    if (!safeName || safeName !== name) {
      return { success: false, error: 'Nombre de servicio inválido' }
    }
    try {
      let ps: string
      switch (action) {
        case 'start':
          ps = `Start-Service -Name '${safeName}'`
          break
        case 'stop':
          ps = `Stop-Service -Name '${safeName}' -Force`
          break
        case 'disable':
          ps = `Set-Service -Name '${safeName}' -StartupType Disabled`
          break
      }
      await runPowerShell(ps, 10000)
      return { success: true }
    } catch (err) {
      log.error('setServiceState error:', err)
      return { success: false, error: String(err) }
    }
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
    const critical = [
      'windefend', 'wuauserv', 'bits', 'cryptsvc', 'eventlog',
      'lsa', 'samss', 'schedule', 'spooler', 'rpcss', 'dcomlaunch'
    ]
    return !critical.includes(name.toLowerCase())
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
