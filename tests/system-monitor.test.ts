import { SystemMonitor } from '../src/main/services/system-monitor'

describe('SystemMonitor', () => {
  let monitor: SystemMonitor

  beforeEach(() => {
    monitor = new SystemMonitor()
  })

  afterEach(() => {
    monitor.stop()
  })

  describe('getSnapshot', () => {
    it('returns a valid metrics snapshot', async () => {
      const snapshot = await monitor.getSnapshot()
      expect(snapshot).toBeDefined()
      expect(snapshot.timestamp).toBeGreaterThan(0)

      // CPU
      expect(typeof snapshot.cpu.usagePercent).toBe('number')
      expect(snapshot.cpu.usagePercent).toBeGreaterThanOrEqual(0)
      expect(snapshot.cpu.usagePercent).toBeLessThanOrEqual(100)
      expect(typeof snapshot.cpu.coreCount).toBe('number')
      expect(snapshot.cpu.coreCount).toBeGreaterThan(0)
      expect(typeof snapshot.cpu.model).toBe('string')

      // RAM
      expect(typeof snapshot.ram.totalMB).toBe('number')
      expect(snapshot.ram.totalMB).toBeGreaterThan(0)
      expect(snapshot.ram.usedMB).toBeGreaterThanOrEqual(0)
      expect(snapshot.ram.freeMB).toBeGreaterThanOrEqual(0)
      expect(snapshot.ram.usagePercent).toBeGreaterThanOrEqual(0)
      expect(snapshot.ram.usagePercent).toBeLessThanOrEqual(100)

      // Disk
      expect(Array.isArray(snapshot.disk)).toBe(true)
      if (snapshot.disk.length > 0) {
        const disk = snapshot.disk[0]
        expect(disk.drive).toBeTruthy()
        expect(disk.totalGB).toBeGreaterThan(0)
        expect(disk.usagePercent).toBeGreaterThanOrEqual(0)
        expect(disk.usagePercent).toBeLessThanOrEqual(100)
      }

      // Network
      expect(typeof snapshot.network.downloadKBs).toBe('number')
      expect(typeof snapshot.network.uploadKBs).toBe('number')

      // Arrays
      expect(Array.isArray(snapshot.temperatures)).toBe(true)
      expect(Array.isArray(snapshot.cpu.history)).toBe(true)
      expect(Array.isArray(snapshot.ram.history)).toBe(true)
    })

    it('accumulates history across multiple snapshots', async () => {
      await monitor.getSnapshot()
      await monitor.getSnapshot()
      const snapshot = await monitor.getSnapshot()
      expect(snapshot.cpu.history.length).toBeGreaterThanOrEqual(3)
      expect(snapshot.ram.history.length).toBeGreaterThanOrEqual(3)
    })

    it('limits history to 60 data points', async () => {
      for (let i = 0; i < 65; i++) {
        await monitor.getSnapshot()
      }
      const snapshot = await monitor.getSnapshot()
      expect(snapshot.cpu.history.length).toBeLessThanOrEqual(60)
      expect(snapshot.ram.history.length).toBeLessThanOrEqual(60)
    })
  })

  describe('start/stop', () => {
    it('calls callback with metrics when started', async () => {
      const callback = jest.fn()
      monitor.start(callback, 100) // fast interval for test

      await new Promise((resolve) => setTimeout(resolve, 250))
      monitor.stop()

      expect(callback).toHaveBeenCalled()
      const firstCall = callback.mock.calls[0][0]
      expect(firstCall.cpu).toBeDefined()
      expect(firstCall.ram).toBeDefined()
    })

    it('stop prevents further callbacks', async () => {
      const callback = jest.fn()
      monitor.start(callback, 100)
      await new Promise((resolve) => setTimeout(resolve, 150))
      monitor.stop()
      const callCount = callback.mock.calls.length

      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(callback.mock.calls.length).toBe(callCount)
    })
  })
})
