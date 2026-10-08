import * as os from 'os'
import log from 'electron-log'
import { runPowerShellResult } from '../utils/powershell'
import type { SystemMetrics, CpuMetrics, RamMetrics, DiskMetrics, NetworkMetrics } from '../../shared/types'

const HISTORY_SIZE = 60 // Keep last 60 data points
/** Disk capacity changes slowly; querying it every tick spawned PowerShell for nothing. */
const DISK_CACHE_MS = 30_000
/** Two CPU samples closer than this give a noisy delta, so the last value is reused. */
const MIN_CPU_SAMPLE_MS = 500

interface CpuTimes {
  idle: number
  total: number
}

export class SystemMonitor {
  private timer: ReturnType<typeof setInterval> | null = null
  /** Incremented on every start/stop so in-flight ticks can detect they are stale. */
  private generation = 0
  private busy = false

  private cpuHistory: number[] = []
  private ramHistory: number[] = []

  private prevCpuTimes: CpuTimes | null = null
  private lastCpuAt = 0
  private lastCpuUsage = 0
  private physicalCores: number | null = null
  private physicalCoresPromise: Promise<number> | null = null

  private diskCache: { at: number; data: DiskMetrics[] } | null = null
  private diskPromise: Promise<DiskMetrics[]> | null = null

  /**
   * Start continuous monitoring, calling `callback` every `intervalMs`.
   * A new tick is skipped while the previous one is still running, and no
   * callback fires after `stop()`.
   */
  start(callback: (metrics: SystemMetrics) => void, intervalMs = 3000): void {
    this.stop()
    const generation = ++this.generation
    const safeInterval = Math.max(100, Number(intervalMs) || 3000)

    const tick = async (): Promise<void> => {
      if (this.busy) return // previous snapshot still in flight
      this.busy = true
      try {
        const metrics = await this.getSnapshot()
        if (generation === this.generation) callback(metrics)
      } catch (err) {
        log.warn('SystemMonitor tick error:', err)
      } finally {
        this.busy = false
      }
    }

    this.timer = setInterval(tick, safeInterval)
    void tick() // first reading immediately instead of after one full interval
  }

  stop(): void {
    this.generation++
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Returns a single snapshot of all system metrics. */
  async getSnapshot(): Promise<SystemMetrics> {
    const [cpu, disk] = await Promise.all([this.getCpu(), this.getDisks()])
    const ram = this.getRam()

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

  // ── CPU ────────────────────────────────────────────────────────────────────
  // Usage comes from the delta of Node's cumulative CPU times (no external
  // process, ~microseconds). The old implementation spawned PowerShell + WMI
  // on every tick, whose `LoadPercentage` is also a coarse, laggy figure.

  private async getCpu(): Promise<CpuMetrics> {
    const cpus = os.cpus()
    const logicalCount = Math.max(1, cpus.length)
    const physical = await this.getPhysicalCores(logicalCount)

    return {
      usagePercent: this.readCpuUsage(cpus),
      coreCount: physical,
      logicalCount,
      speed: Math.round(((cpus[0]?.speed ?? 0) / 1000) * 100) / 100,
      model: (cpus[0]?.model ?? 'Unknown').trim() || 'Unknown',
      history: []
    }
  }

  private readCpuUsage(cpus: os.CpuInfo[]): number {
    let idle = 0
    let total = 0
    for (const c of cpus) {
      const t = c.times
      idle += t.idle
      total += t.user + t.nice + t.sys + t.idle + t.irq
    }

    const now = Date.now()
    const prev = this.prevCpuTimes
    if (prev && now - this.lastCpuAt < MIN_CPU_SAMPLE_MS) {
      return this.lastCpuUsage
    }

    this.prevCpuTimes = { idle, total }
    this.lastCpuAt = now
    if (!prev) return this.lastCpuUsage

    const dTotal = total - prev.total
    const dIdle = idle - prev.idle
    if (dTotal <= 0) return this.lastCpuUsage

    this.lastCpuUsage = Math.min(100, Math.max(0, Math.round((1 - dIdle / dTotal) * 100)))
    return this.lastCpuUsage
  }

  /**
   * Physical core count. Node only exposes logical processors, so on Windows
   * it is read once (and cached) from WMI; elsewhere the logical count is used.
   */
  private async getPhysicalCores(logicalCount: number): Promise<number> {
    if (this.physicalCores !== null) return this.physicalCores
    if (process.platform !== 'win32') {
      this.physicalCores = logicalCount
      return this.physicalCores
    }
    if (!this.physicalCoresPromise) {
      this.physicalCoresPromise = (async () => {
        const { stdout } = await runPowerShellResult(
          '(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum',
          10000
        )
        const n = parseInt(stdout, 10)
        this.physicalCores = Number.isFinite(n) && n > 0 ? n : logicalCount
        return this.physicalCores
      })().catch(() => {
        this.physicalCores = logicalCount
        return logicalCount
      })
    }
    return this.physicalCoresPromise
  }

  // ── RAM ────────────────────────────────────────────────────────────────────

  private getRam(): RamMetrics {
    const totalMB = Math.round(os.totalmem() / (1024 * 1024))
    const freeMB = Math.round(os.freemem() / (1024 * 1024))
    const usedMB = Math.max(0, totalMB - freeMB)
    return {
      totalMB,
      usedMB,
      freeMB,
      usagePercent: totalMB > 0 ? Math.min(100, Math.round((usedMB / totalMB) * 100)) : 0,
      history: []
    }
  }

  // ── Disks ──────────────────────────────────────────────────────────────────

  private async getDisks(): Promise<DiskMetrics[]> {
    if (process.platform !== 'win32') {
      return this.getMockDisks()
    }
    const cached = this.diskCache
    if (cached && Date.now() - cached.at < DISK_CACHE_MS) return cached.data

    // Share one in-flight query between concurrent callers.
    if (!this.diskPromise) {
      this.diskPromise = this.queryDisks().finally(() => {
        this.diskPromise = null
      })
    }
    return this.diskPromise
  }

  private async queryDisks(): Promise<DiskMetrics[]> {
    try {
      const ps = `
        @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
          Select-Object DeviceID, VolumeName, Size, FreeSpace) |
        ConvertTo-Json -Compress
      `
      const { stdout } = await runPowerShellResult(ps, 15000)
      if (!stdout || stdout === 'null') {
        // Keep showing the last known disks rather than flashing an empty list.
        return this.diskCache?.data ?? []
      }
      const raw = JSON.parse(stdout)
      const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw]
      const data = items
        .filter((d) => Number(d.Size) > 0)
        .map((d) => {
          const totalGB = Number(d.Size) / 1024 ** 3
          const freeGB = Number(d.FreeSpace) / 1024 ** 3
          const usedGB = totalGB - freeGB
          return {
            drive: String(d.DeviceID ?? ''),
            label: String(d.VolumeName || d.DeviceID),
            totalGB: Math.round(totalGB * 10) / 10,
            usedGB: Math.round(usedGB * 10) / 10,
            freeGB: Math.round(freeGB * 10) / 10,
            usagePercent: Math.round((usedGB / totalGB) * 100),
            readSpeedMBs: 0,
            writeSpeedMBs: 0
          }
        })
      this.diskCache = { at: Date.now(), data }
      return data
    } catch (err) {
      log.warn('getDisks error:', err)
      return this.diskCache?.data ?? []
    }
  }

  private async getNetwork(): Promise<NetworkMetrics> {
    return { uploadKBs: 0, downloadKBs: 0, adapter: 'Unknown' }
  }

  // ── Mock data for non-Windows environments (dev/test) ──
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
