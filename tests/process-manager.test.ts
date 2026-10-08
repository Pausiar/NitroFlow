import { ProcessManager } from '../src/main/services/process-manager'
import type { PowerShellResult } from '../src/main/utils/powershell'

type Reply = { stdout?: string; stderr?: string }

/** Fake PowerShell: records every script and answers through `handler`. */
function makeRunner(handler: (script: string) => Reply) {
  const calls: string[] = []
  const run = async (script: string): Promise<PowerShellResult> => {
    calls.push(script)
    const r = handler(script)
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', ok: !r.stderr }
  }
  return { run, calls }
}

describe('ProcessManager', () => {
  let originalPlatform: PropertyDescriptor | undefined

  const setPlatform = (value: string) =>
    Object.defineProperty(process, 'platform', { value, configurable: true })

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  })

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  })

  describe('non-Windows', () => {
    it('returns demo data', async () => {
      setPlatform('linux')
      const pm = new ProcessManager(makeRunner(() => ({})).run)
      const list = await pm.listProcesses()
      expect(list.length).toBeGreaterThan(0)
      expect((await pm.killProcess(1234)).success).toBe(true)
    })
  })

  describe('killProcess (Windows)', () => {
    beforeEach(() => setPlatform('win32'))

    it('refuses to kill protected processes reported without .exe (lsass, svchost, ...)', async () => {
      for (const name of ['lsass', 'svchost', 'csrss', 'winlogon', 'explorer']) {
        const { run, calls } = makeRunner(() => ({ stdout: name }))
        const result = await new ProcessManager(run).killProcess(700)
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/protegido/)
        expect(calls.some((s) => s.includes('Stop-Process'))).toBe(false)
      }
    })

    it('kills an ordinary process using -ErrorAction Stop', async () => {
      const { run, calls } = makeRunner((s) => (s.includes('Get-Process -Id') ? { stdout: 'chrome' } : {}))
      const result = await new ProcessManager(run).killProcess(1234)
      expect(result.success).toBe(true)
      expect(calls.some((s) => s.includes('Stop-Process -Id 1234 -Force -ErrorAction Stop'))).toBe(true)
    })

    it('reports failure (instead of a fake success) when Stop-Process fails', async () => {
      const { run } = makeRunner((s) =>
        s.includes('Get-Process -Id') ? { stdout: 'chrome' } : { stderr: 'Access is denied' }
      )
      const result = await new ProcessManager(run).killProcess(1234)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/administrador/)
    })

    it('reports a process that no longer exists', async () => {
      const result = await new ProcessManager(makeRunner(() => ({ stdout: '' })).run).killProcess(99999)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/ya no existe/)
    })

    it('rejects invalid PIDs without touching PowerShell', async () => {
      const { run, calls } = makeRunner(() => ({}))
      const pm = new ProcessManager(run)
      for (const bad of [0, -1, 1.5, NaN]) {
        expect((await pm.killProcess(bad)).success).toBe(false)
      }
      expect(calls.length).toBe(0)
    })
  })

  describe('setServiceState (Windows)', () => {
    beforeEach(() => setPlatform('win32'))

    it('never stops or disables critical services', async () => {
      const { run, calls } = makeRunner(() => ({}))
      const pm = new ProcessManager(run)
      for (const name of ['wuauserv', 'WinDefend', 'RpcSs', 'EventLog']) {
        const result = await pm.setServiceState(name, 'stop')
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/crítico/)
      }
      expect((await pm.setServiceState('WinDefend', 'disable')).success).toBe(false)
      expect(calls.length).toBe(0)
    })

    it('stops a normal service with -ErrorAction Stop', async () => {
      const { run, calls } = makeRunner(() => ({}))
      const result = await new ProcessManager(run).setServiceState('SysMain', 'stop')
      expect(result.success).toBe(true)
      expect(calls[0]).toContain("Stop-Service -Name 'SysMain' -Force -ErrorAction Stop")
    })

    it('surfaces PowerShell errors instead of reporting success', async () => {
      const { run } = makeRunner(() => ({ stderr: 'Cannot open SysMain service. Access is denied' }))
      const result = await new ProcessManager(run).setServiceState('SysMain', 'stop')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/administrador/)
    })

    it('rejects names that could inject PowerShell', async () => {
      const { run, calls } = makeRunner(() => ({}))
      const result = await new ProcessManager(run).setServiceState("x'; Remove-Item *", 'stop')
      expect(result.success).toBe(false)
      expect(calls.length).toBe(0)
    })
  })

  describe('listProcesses (Windows)', () => {
    beforeEach(() => setPlatform('win32'))

    it('computes a real CPU percentage from two samples and flags protected processes', async () => {
      let sample = 0
      const { run } = makeRunner(() => {
        sample++
        const cpu = sample === 1 ? 10 : 10.8
        return {
          stdout: JSON.stringify([
            { Id: 100, ProcessName: 'busy', CPU: cpu, WorkingSet: 200 * 1048576, Path: 'C:\\x\\busy.exe', Description: 'Busy' },
            { Id: 4, ProcessName: 'svchost', CPU: 1, WorkingSet: 50 * 1048576 },
            { Id: 200, ProcessName: 'idle', CPU: 5, WorkingSet: 900 * 1048576 }
          ])
        }
      })
      const list = await new ProcessManager(run).listProcesses()
      const busy = list.find((p) => p.pid === 100)!
      expect(busy.cpuPercent).toBeGreaterThan(0)
      expect(busy.cpuPercent).toBeLessThanOrEqual(100)
      expect(busy.canTerminate).toBe(true)
      expect(list.find((p) => p.pid === 4)!.canTerminate).toBe(false)
      expect(list[0].pid).toBe(100) // highest CPU% first
    })

    it('returns an empty list (not invented processes) when PowerShell output is unusable', async () => {
      const list = await new ProcessManager(makeRunner(() => ({ stdout: 'not json' })).run).listProcesses()
      expect(list).toEqual([])
    })
  })
})
