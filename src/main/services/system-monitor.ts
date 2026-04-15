import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import type { SystemMetrics, CpuMetrics, RamMetrics, DiskMetrics, NetworkMetrics } from '../../shared/types'

const execAsync = promisify(exec)

const HISTORY_SIZE = 60 // Keep last 60 data points

export class SystemMonitor {
  private intervalId: NodeJS.Timer | null = null
  private cpuHistory: number[] = []
  private ramHistory: number[] = []
  private lastNetworkBytes = { rx: 0, tx: 0, ts: 0 }

  /** Start continuous monitoring, calling `callback` every `intervalMs`. */
  start(callback: (metrics: SystemMetrics) => void, intervalMs = 3000): void {
    this.stop()
    this.intervalId = setInterval(async () => {
      try {
        const metrics = await this.getSnapshot()
        callback(metrics)
      } catch (err) {
        log.warn('SystemMonitor tick error:', err)
      }
    }, intervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId as unknown as number)
      this.intervalId = null
    }
  }

  /** Returns a single snapshot of all system metrics. */
  async getSnapshot(): Promise<SystemMetrics> {
    const [cpu, ram, disk] = await Promise.all([
      this.getCpu(),
      this.getRam(),
      this.getDisks()
    ])

    // Update histories
    this.cpuHistory.push(cpu.usagePercent)
    if (this.cpuHistory.length > HISTORY_SIZE) this.cpuHistory.shift()
    this.ramHistory.push(ram.usagePercent)
    if (this.ramHistory.length > HISTORY_SIZE) this.ramHistory.shift()

    cpu.history = [...this.cpuHistory]
    ram.history = [...this.ramHistory]

    const network = await this.getNetwork()

    return {
      cpu,
      ram,
      disk,
      network,
      temperatures: [],
      timestamp: Date.now()
    }
  }

  private async getCpu(): Promise<CpuMetrics> {
    if (process.platform !== 'win32') {
      return this.getMockCpu()
    }
    try {
      const ps = `
        $cpu = Get-WmiObject Win32_Processor | Select-Object -First 1
        $load = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        [PSCustomObject]@{
          Name = $cpu.Name
          NumberOfCores = $cpu.NumberOfCores
          NumberOfLogicalProcessors = $cpu.NumberOfLogicalProcessors
          MaxClockSpeed = $cpu.MaxClockSpeed
          LoadPercentage = [int]$load
        } | ConvertTo-Json
      `
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`)
      const data = JSON.parse(stdout.trim())
      return {
        usagePercent: data.LoadPercentage ?? 0,
        coreCount: data.NumberOfCores ?? 1,
        logicalCount: data.NumberOfLogicalProcessors ?? 1,
        speed: (data.MaxClockSpeed ?? 0) / 1000,
        model: data.Name ?? 'Unknown',
        history: []
      }
    } catch (err) {
      log.warn('getCpu error:', err)
      return this.getMockCpu()
    }
  }

  private async getRam(): Promise<RamMetrics> {
    if (process.platform !== 'win32') {
      return this.getMockRam()
    }
    try {
      const ps = `
        $os = Get-WmiObject Win32_OperatingSystem
        [PSCustomObject]@{
          TotalVisibleMemorySize = $os.TotalVisibleMemorySize
          FreePhysicalMemory = $os.FreePhysicalMemory
        } | ConvertTo-Json
      `
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`)
      const data = JSON.parse(stdout.trim())
      const totalMB = Math.round(data.TotalVisibleMemorySize / 1024)
      const freeMB = Math.round(data.FreePhysicalMemory / 1024)
      const usedMB = totalMB - freeMB
      return {
        totalMB,
        usedMB,
        freeMB,
        usagePercent: Math.round((usedMB / totalMB) * 100),
        history: []
      }
    } catch (err) {
      log.warn('getRam error:', err)
      return this.getMockRam()
    }
  }

  private async getDisks(): Promise<DiskMetrics[]> {
    if (process.platform !== 'win32') {
      return this.getMockDisks()
    }
    try {
      const ps = `
        Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" |
        Select-Object DeviceID, VolumeName, Size, FreeSpace |
        ConvertTo-Json
      `
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`)
      const raw = JSON.parse(stdout.trim())
      const items = Array.isArray(raw) ? raw : [raw]
      return items.map((d) => {
        const totalGB = d.Size / (1024 ** 3)
        const freeGB = d.FreeSpace / (1024 ** 3)
        const usedGB = totalGB - freeGB
        return {
          drive: d.DeviceID,
          label: d.VolumeName || d.DeviceID,
          totalGB: Math.round(totalGB * 10) / 10,
          usedGB: Math.round(usedGB * 10) / 10,
          freeGB: Math.round(freeGB * 10) / 10,
          usagePercent: Math.round((usedGB / totalGB) * 100),
          readSpeedMBs: 0,
          writeSpeedMBs: 0
        }
      })
    } catch (err) {
      log.warn('getDisks error:', err)
      return this.getMockDisks()
    }
  }

  private async getNetwork(): Promise<NetworkMetrics> {
    return { uploadKBs: 0, downloadKBs: 0, adapter: 'Unknown' }
  }

  // ── Mock data for non-Windows environments (dev/test) ──
  private getMockCpu(): CpuMetrics {
    return {
      usagePercent: Math.round(Math.random() * 40 + 10),
      coreCount: 8,
      logicalCount: 16,
      speed: 3.6,
      model: 'Intel Core i7 (Demo)',
      history: []
    }
  }

  private getMockRam(): RamMetrics {
    const totalMB = 16384
    const usedMB = Math.round(Math.random() * 4096 + 4096)
    return {
      totalMB,
      usedMB,
      freeMB: totalMB - usedMB,
      usagePercent: Math.round((usedMB / totalMB) * 100),
      history: []
    }
  }

  private getMockDisks(): DiskMetrics[] {
    return [
      {
        drive: 'C:',
        label: 'Windows',
        totalGB: 500,
        usedGB: 280,
        freeGB: 220,
        usagePercent: 56,
        readSpeedMBs: 0,
        writeSpeedMBs: 0
      }
    ]
  }
}
