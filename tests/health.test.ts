import { HealthService, computeScore, disableCandidates } from '../src/main/services/health'
import type { HealthDependencies, SmartActionEvent } from '../src/main/services/health'
import type { CleanupCategory, CleanupResult, HealthIssue, RestorePointResult, StartupEntry } from '../src/shared/types'
import type { PowerShellResult } from '../src/main/utils/powershell'

const cat = (id: string, sizeMB: number, recommended: boolean): CleanupCategory => ({
  id, name: id, description: '', paths: [], sizeMB, fileCount: 1, safe: true, recommended
})

const entry = (id: string, over: Partial<StartupEntry> = {}): StartupEntry => ({
  id, name: id, command: '', publisher: '', location: 'HKCU', enabled: true, impact: 'High', description: '',
  recommendation: 'disable', ...over
})

function makeDeps(over: Partial<HealthDependencies> & {
  categories?: CleanupCategory[]
  entries?: StartupEntry[]
  restore?: RestorePointResult
  psReply?: (script: string) => Partial<PowerShellResult>
} = {}) {
  const cleaned: string[][] = []
  const toggled: { id: string; enabled: boolean }[] = []
  const scripts: string[] = []
  let restoreCalls = 0
  const deps: Partial<HealthDependencies> = {
    cleanup: {
      scan: async () => over.categories ?? [cat('temp_user', 600, true), cat('recycle_bin', 900, false)],
      clean: async (ids: string[]): Promise<CleanupResult[]> => {
        cleaned.push(ids)
        return ids.map((id) => ({ categoryId: id, freedMB: 100, deletedFiles: 1, errors: [], success: true }))
      }
    },
    startup: {
      listEntries: async () => over.entries ?? [
        entry('discord'),
        entry('antivirus', { essential: true }),
        entry('steam', { enabled: false }),
        entry('driver', { recommendation: 'keep' })
      ],
      toggleEntry: async (id: string, enabled: boolean) => {
        toggled.push({ id, enabled })
        return { success: true }
      }
    },
    restorePoint: {
      create: async () => {
        restoreCalls++
        return over.restore ?? { success: true, message: 'ok' }
      }
    },
    ps: async (script: string) => {
      scripts.push(script)
      const r = over.psReply?.(script) ?? {}
      return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', ok: r.ok ?? !r.stderr }
    },
    isAdmin: async () => true,
    shouldCreateRestorePoint: () => true,
    getMemory: () => ({ totalMB: 16000, freeMB: 8000 }),
    getSystemDrive: async () => ({ drive: 'C:', freeGB: 200, totalGB: 500 }),
    ...over
  }
  return { deps, cleaned, toggled, scripts, restoreCalls: () => restoreCalls }
}

describe('HealthService.scan', () => {
  let originalPlatform: PropertyDescriptor | undefined
  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  })
  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('finds safe cleanup, recycle bin (not auto) and startup issues', async () => {
    const { deps } = makeDeps()
    const report = await new HealthService(deps).scan()
    const byFix = (id: string) => report.issues.find((i) => i.fixId === id)

    expect(byFix('cleanup_safe')?.autoFix).toBe(true)
    expect(byFix('empty_recycle_bin')?.autoFix).toBe(false)
    const startup = byFix('startup_disable_recommended')
    expect(startup?.autoFix).toBe(true)
    // Only Discord: the essential, already-disabled and "keep" entries are excluded.
    expect(startup?.title).toMatch(/Un programa/)
    expect(report.isAdmin).toBe(true)
    expect(report.score).toBeLessThan(100)
    expect(report.summary.length).toBeGreaterThan(10)
  })

  it('skips cleanup below 100 MB and never counts the recycle bin as safe', async () => {
    const { deps } = makeDeps({ categories: [cat('temp_user', 50, true), cat('recycle_bin', 5000, true)] })
    const report = await new HealthService(deps).scan()
    expect(report.issues.find((i) => i.fixId === 'cleanup_safe')).toBeUndefined()
  })

  it('reports a perfect score when everything is fine', async () => {
    const { deps } = makeDeps({ categories: [], entries: [] })
    const report = await new HealthService(deps).scan()
    expect(report.issues).toEqual([])
    expect(report.score).toBe(100)
    expect(report.summary).toMatch(/buen estado/)
  })

  it('flags critically low disk space and high memory as advice', async () => {
    const { deps } = makeDeps({
      categories: [], entries: [],
      getSystemDrive: async () => ({ drive: 'C:', freeGB: 3, totalGB: 250 }),
      getMemory: () => ({ totalMB: 8000, freeMB: 400 })
    })
    const report = await new HealthService(deps).scan()
    const disk = report.issues.find((i) => i.id === 'disk_space')
    expect(disk?.severity).toBe('critical')
    expect(disk?.autoFix).toBe(false)
    expect(disk?.page).toBe('cleanup')
    expect(report.issues[0].id).toBe('disk_space') // critical first
    expect(report.issues.find((i) => i.id === 'memory_usage')).toBeDefined()
  })

  it('suggests the Balanced plan for Power saver only on desktops', async () => {
    const powerReply = (battery: number) => (s: string) =>
      s.includes('getactivescheme')
        ? { stdout: JSON.stringify({ scheme: 'GUID: a1841308-3d3d-4fc8-a8ea-123 (Power saver)', battery }) }
        : {}
    const desktop = await new HealthService(makeDeps({ categories: [], entries: [], psReply: powerReply(0) }).deps).scan()
    expect(desktop.issues.find((i) => i.fixId === 'power_plan_balanced')?.autoFix).toBe(true)
    const laptop = await new HealthService(makeDeps({ categories: [], entries: [], psReply: powerReply(1) }).deps).scan()
    expect(laptop.issues.find((i) => i.fixId === 'power_plan_balanced')).toBeUndefined()
  })

  it('never throws when individual checks fail', async () => {
    const { deps } = makeDeps({
      cleanup: { scan: async () => { throw new Error('x') }, clean: async () => [] },
      startup: { listEntries: async () => { throw new Error('y') }, toggleEntry: async () => ({ success: true }) },
      isAdmin: async () => { throw new Error('z') },
      getSystemDrive: async () => { throw new Error('w') }
    })
    const report = await new HealthService(deps).scan()
    expect(report.isAdmin).toBe(false)
    expect(Array.isArray(report.issues)).toBe(true)
  })
})

describe('HealthService.smartOptimize', () => {
  let originalPlatform: PropertyDescriptor | undefined
  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  })
  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('creates a restore point first, then applies fixes with progress', async () => {
    const { deps, cleaned, toggled, restoreCalls } = makeDeps()
    const svc = new HealthService(deps)
    await svc.scan()
    const progress: number[] = []
    const events: SmartActionEvent[] = []
    const result = await svc.smartOptimize(
      ['cleanup_safe', 'startup_disable_recommended'],
      (p) => progress.push(p.percent),
      (e) => events.push(e)
    )
    expect(restoreCalls()).toBe(1)
    expect(result.restorePoint.success).toBe(true)
    // Recycle bin is never part of the safe cleanup.
    expect(cleaned).toEqual([['temp_user']])
    // Only the recommended, non-essential, enabled entry is disabled.
    expect(toggled).toEqual([{ id: 'discord', enabled: false }])
    expect(result.results.every((r) => r.success)).toBe(true)
    expect(result.results.find((r) => r.fixId === 'startup_disable_recommended')?.count).toBe(1)
    expect(result.freedMB).toBe(100)
    expect(progress[progress.length - 1]).toBe(100)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
    expect(events).toEqual(
      expect.arrayContaining([
        { kind: 'startup', id: 'discord', name: 'discord' },
        expect.objectContaining({ kind: 'cleanup', freedMB: 100 })
      ])
    )
  })

  it('continues with data-safe fixes when the restore point fails', async () => {
    const { deps, cleaned } = makeDeps({ restore: { success: false, message: 'Protección desactivada' } })
    const result = await new HealthService(deps).smartOptimize(['cleanup_safe'])
    expect(result.restorePoint.success).toBe(false)
    expect(cleaned.length).toBe(1)
    expect(result.results[0].success).toBe(true)
  })

  it('does not create a restore point when disabled in settings', async () => {
    const { deps, restoreCalls } = makeDeps({ shouldCreateRestorePoint: () => false })
    await new HealthService(deps).smartOptimize(['power_plan_balanced'])
    expect(restoreCalls()).toBe(0)
  })

  it('reports a powercfg failure signalled only by its exit code', async () => {
    const { deps, scripts } = makeDeps()
    await new HealthService(deps).smartOptimize(['power_plan_balanced'])
    const script = scripts.find((s) => s.includes('setactive')) ?? ''
    expect(script).toMatch(/\$LASTEXITCODE -ne 0/)
    expect(script).toMatch(/\[Console\]::Error\.WriteLine/)
  })

  it('ignores unknown fix ids and reports power plan failures', async () => {
    const { deps, scripts } = makeDeps({ psReply: (s) => (s.includes('setactive') ? { stderr: 'Access is denied' } : {}) })
    const result = await new HealthService(deps).smartOptimize(['power_plan_balanced', 'format_c' as never])
    expect(result.results.length).toBe(1)
    expect(result.results[0].success).toBe(false)
    expect(result.results[0].message).toMatch(/administrador/)
    expect(scripts.some((s) => s.includes('381b4222-f694-41f0-9685-ff5bb260df2e'))).toBe(true)
  })
})

describe('helpers', () => {
  it('computeScore subtracts per severity and clamps', () => {
    const issue = (severity: HealthIssue['severity']): HealthIssue => ({ id: 'x', title: '', description: '', severity, autoFix: false })
    expect(computeScore([])).toBe(100)
    expect(computeScore([issue('critical'), issue('warning')])).toBeLessThan(75)
    expect(computeScore(Array(10).fill(issue('critical')))).toBe(0)
  })

  it('disableCandidates keeps only enabled, non-essential "disable" entries', () => {
    const list = disableCandidates([
      entry('a'),
      entry('b', { essential: true }),
      entry('c', { enabled: false }),
      entry('d', { recommendation: 'optional' }),
      entry('e', { recommendation: undefined })
    ])
    expect(list.map((e) => e.id)).toEqual(['a'])
  })
})
