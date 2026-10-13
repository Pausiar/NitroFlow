import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  OptimizerService,
  POWER_PLAN_BALANCED,
  POWER_PLAN_HIGH_PERFORMANCE
} from '../src/main/services/optimizer'
import type { OptimizerSnapshot } from '../src/main/services/optimizer'
import type { PowerShellResult } from '../src/main/utils/powershell'
import type { PerformanceMode } from '../src/shared/types'

// The singleton (getInstance) uses the real SettingsService; keep it off disk.
jest.mock('../src/main/services/settings', () => ({
  SettingsService: {
    getInstance: jest.fn(() => ({ get: () => ({ performanceMode: 'balanced' }), save: jest.fn() }))
  }
}))

type Reply = { stdout?: string; stderr?: string }
type Handler = (step: string, script: string) => Reply | undefined

const USER_PLAN = '11111111-2222-3333-4444-555555555555'
const CREATED_PLAN = '99999999-8888-7777-6666-555555555555'

const ALL_VALUES = [
  { id: 'visualFx', exists: true, kind: 'DWord', value: 3 },
  { id: 'systemResponsiveness', exists: true, kind: 'DWord', value: 20 },
  { id: 'networkThrottling', exists: true, kind: 'DWord', value: 10 },
  { id: 'gamesPriority', exists: true, kind: 'DWord', value: 2 },
  { id: 'gamesScheduling', exists: true, kind: 'String', value: 'Medium' },
  { id: 'gamesSfio', exists: true, kind: 'String', value: 'Normal' },
  { id: 'allowAutoGameMode', exists: false, kind: null, value: null },
  { id: 'autoGameModeEnabled', exists: false, kind: null, value: null },
  { id: 'gameDvr', exists: true, kind: 'DWord', value: 1 },
  { id: 'gameDvrFse', exists: false, kind: null, value: null }
]

function probeJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    isAdmin: true,
    isLaptop: false,
    activeScheme: USER_PLAN,
    target: POWER_PLAN_HIGH_PERFORMANCE,
    targetAc: 5,
    targetDc: 5,
    values: ALL_VALUES,
    ...over
  })
}

function makeRunner(handler: Handler = () => undefined) {
  const calls: { step: string; script: string }[] = []
  const run = async (script: string): Promise<PowerShellResult> => {
    const step = /# NF-STEP: (\S+)/.exec(script)?.[1] ?? 'other'
    calls.push({ step, script })
    let r = handler(step, script)
    if (!r) {
      if (step === 'probe') r = { stdout: probeJson() }
      else if (step === 'power') r = { stdout: POWER_PLAN_HIGH_PERFORMANCE }
      else if (step === 'admin') r = { stdout: 'True' }
      else r = {}
    }
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', ok: !r.stderr }
  }
  const steps = () => calls.map((c) => c.step)
  const script = (step: string) => calls.find((c) => c.step === step)?.script ?? ''
  return { run, calls, steps, script }
}

function makeSettings(mode: PerformanceMode = 'balanced') {
  const state = { performanceMode: mode }
  return {
    state,
    get: jest.fn(() => ({ ...state })),
    save: jest.fn((u: { performanceMode?: PerformanceMode }) => {
      if (u.performanceMode) state.performanceMode = u.performanceMode
    })
  }
}

describe('OptimizerService', () => {
  let dir: string
  let snapshotPath: string
  let originalPlatform: PropertyDescriptor | undefined

  const setPlatform = (value: string) =>
    Object.defineProperty(process, 'platform', { value, configurable: true })

  const readSnap = (): OptimizerSnapshot => JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'))

  function create(handler?: Handler, mode: PerformanceMode = 'balanced') {
    const runner = makeRunner(handler)
    const settings = makeSettings(mode)
    const service = new OptimizerService({ ps: runner.run, snapshotPath, settings, now: () => 1234 })
    return { service, runner, settings }
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-opt-'))
    snapshotPath = path.join(dir, 'optimizer-snapshot.json')
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    setPlatform('win32')
  })

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('is a singleton', () => {
    ;(OptimizerService as unknown as { instance?: OptimizerService }).instance = undefined
    expect(OptimizerService.getInstance()).toBe(OptimizerService.getInstance())
  })

  describe('non-Windows', () => {
    beforeEach(() => setPlatform('linux'))

    it('persists the mode without calling PowerShell and records appliedAt', async () => {
      const { service, runner, settings } = create()
      const result = await service.applyMode('gaming')
      expect(result.success).toBe(true)
      expect(runner.calls).toHaveLength(0)
      expect(settings.save).toHaveBeenCalledWith({ performanceMode: 'gaming' })
      const status = service.getStatus()
      expect(status.currentMode).toBe('gaming')
      expect(status.appliedAt).toBe(1234)
      expect(status.isLaptop).toBe(false)
    })

    it('returns success: false when saving settings throws', async () => {
      const { service, settings } = create()
      settings.save.mockImplementationOnce(() => {
        throw new Error('disk full')
      })
      const result = await service.applyMode('performance')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/disk full/)
    })
  })

  describe('performance / gaming', () => {
    it('captures a snapshot of the original state before changing anything', async () => {
      let snapshotAtFirstChange: OptimizerSnapshot | null = null
      const { service, runner, settings } = create((step) => {
        if (step === 'power') {
          snapshotAtFirstChange = fs.existsSync(snapshotPath) ? readSnap() : null
          return { stdout: POWER_PLAN_HIGH_PERFORMANCE }
        }
        return undefined
      })

      const result = await service.applyMode('performance')
      expect(result).toEqual({ success: true, warnings: [] })
      expect(runner.steps()[0]).toBe('probe')
      expect(snapshotAtFirstChange).not.toBeNull()

      const snap = readSnap()
      expect(snap.activeScheme).toBe(USER_PLAN)
      expect(snap.throttle[POWER_PLAN_HIGH_PERFORMANCE]).toEqual({ ac: 5, dc: 5 })
      expect(snap.values.systemResponsiveness).toEqual({ exists: true, kind: 'DWord', value: 20 })
      expect(snap.values.gameDvrFse).toEqual({ exists: false })
      expect(snap.mode).toBe('performance')
      expect(settings.save).toHaveBeenCalledWith({ performanceMode: 'performance' })
      expect(service.getStatus().appliedAt).toBe(1234)
    })

    it('never touches the user plan: activates High Performance and sets CPU min (AC only) there', async () => {
      const { service, runner } = create()
      await service.applyMode('performance')
      expect(runner.script('power')).toContain(POWER_PLAN_HIGH_PERFORMANCE)
      const cpu = runner.script('cpu')
      expect(cpu).toContain(`/setacvalueindex ${POWER_PLAN_HIGH_PERFORMANCE} SUB_PROCESSOR PROCTHROTTLEMIN 100`)
      expect(cpu).not.toContain('SCHEME_CURRENT')
      expect(cpu).not.toContain('setdcvalueindex')
      expect(runner.calls.map((c) => c.script).join('\n')).not.toContain(USER_PLAN)
    })

    it('duplicates High Performance when missing and remembers the created plan', async () => {
      const { service, runner } = create((step) => {
        if (step === 'probe') return { stdout: probeJson({ target: null, targetAc: null, targetDc: null }) }
        if (step === 'power') return { stdout: CREATED_PLAN }
        return undefined
      })
      const result = await service.applyMode('performance')
      expect(result.success).toBe(true)
      expect(runner.script('power')).toContain('/duplicatescheme')
      expect(runner.script('cpu')).toContain(CREATED_PLAN)
      const snap = readSnap()
      expect(snap.createdScheme).toBe(CREATED_PLAN)
      expect(snap.throttle).toEqual({})
    })

    it('gaming applies network/game tweaks but no longer touches Nagle', async () => {
      const { service, runner } = create()
      await service.applyMode('gaming')
      const all = runner.calls.map((c) => c.script).join('\n')
      expect(runner.steps()).toEqual(
        expect.arrayContaining(['network', 'games', 'gamemode', 'gamedvr'])
      )
      expect(all).not.toMatch(/TcpAckFrequency|TCPNoDelay/)
      expect(runner.script('network')).toContain('NetworkThrottlingIndex')
    })

    it('does not take a second snapshot when switching performance -> gaming', async () => {
      const { service } = create()
      await service.applyMode('performance')
      const first = readSnap()

      // Now the probe sees the modified values; they must not overwrite the originals.
      const modified = ALL_VALUES.map((v) =>
        v.id === 'systemResponsiveness' ? { ...v, value: 10 } : v
      )
      const second = create((step) =>
        step === 'probe' ? { stdout: probeJson({ activeScheme: POWER_PLAN_HIGH_PERFORMANCE, targetAc: 100, values: modified }) } : undefined
      , 'performance')
      const result = await second.service.applyMode('gaming')
      expect(result.success).toBe(true)
      const snap = readSnap()
      expect(snap.activeScheme).toBe(USER_PLAN)
      expect(snap.values).toEqual(first.values)
      expect(snap.throttle).toEqual(first.throttle)
      expect(snap.mode).toBe('gaming')
    })

    it('aborts before changing anything when the snapshot cannot be saved', async () => {
      // Make the snapshot path unwritable: its parent is a regular file.
      const blocker = path.join(dir, 'blocker')
      fs.writeFileSync(blocker, 'x')
      const runner = makeRunner()
      const settings = makeSettings()
      const service = new OptimizerService({
        ps: runner.run,
        snapshotPath: path.join(blocker, 'snap.json'),
        settings
      })
      const result = await service.applyMode('gaming')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/no se ha cambiado nada/)
      expect(runner.steps()).toEqual(['probe'])
      expect(settings.save).not.toHaveBeenCalled()
    })

    it('aborts with a clear message without admin rights', async () => {
      const { service, runner, settings } = create((step) =>
        step === 'probe' ? { stdout: probeJson({ isAdmin: false }) } : undefined
      )
      const result = await service.applyMode('performance')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Ejecuta NitroFlow como administrador/)
      expect(runner.steps()).toEqual(['probe'])
      expect(fs.existsSync(snapshotPath)).toBe(false)
      expect(settings.save).not.toHaveBeenCalled()
    })

    it('aborts when the current state cannot be read', async () => {
      const { service, runner } = create((step) => (step === 'probe' ? { stderr: 'boom' } : undefined))
      const result = await service.applyMode('performance')
      expect(result.success).toBe(false)
      expect(runner.steps()).toEqual(['probe'])
    })

    it('on laptops does not force the CPU to 100% and tells the user', async () => {
      const { service, runner } = create((step) =>
        step === 'probe' ? { stdout: probeJson({ isLaptop: true }) } : undefined
      )
      const result = await service.applyMode('performance')
      expect(result.success).toBe(true)
      expect(runner.steps()).not.toContain('cpu')
      expect(result.warnings?.join(' ')).toMatch(/portátil/)
      expect(service.getStatus().isLaptop).toBe(true)
    })

    it('reports failed steps as Spanish warnings and still applies the rest', async () => {
      const { service, settings } = create((step) => {
        if (step === 'power') return { stderr: 'Invalid parameters' }
        if (step === 'visual') return { stderr: 'whatever' }
        return undefined
      })
      const result = await service.applyMode('performance')
      expect(result.success).toBe(true)
      expect(result.warnings).toEqual([
        expect.stringMatching(/plan de energía/),
        expect.stringMatching(/efectos visuales/)
      ])
      expect(settings.save).toHaveBeenCalledWith({ performanceMode: 'performance' })
      expect(service.getStatus().warnings).toHaveLength(2)
    })

    it('fails (and keeps the old mode) when no step could be applied', async () => {
      const { service, settings } = create((step) =>
        step === 'probe' ? undefined : { stderr: 'Access is denied' }
      )
      const result = await service.applyMode('performance')
      expect(result.success).toBe(false)
      expect(settings.save).not.toHaveBeenCalled()
    })

    it('reports a thrown runner error instead of crashing', async () => {
      const runner = jest.fn().mockRejectedValue(new Error('spawn failed'))
      const service = new OptimizerService({ ps: runner, snapshotPath, settings: makeSettings() })
      const result = await service.applyMode('performance')
      expect(result.success).toBe(false)
    })
  })

  describe('balanced (restore)', () => {
    it('restores the snapshot exactly and deletes it', async () => {
      await create().service.applyMode('gaming')
      expect(fs.existsSync(snapshotPath)).toBe(true)

      const { service, runner, settings } = create(undefined, 'gaming')
      const result = await service.applyMode('balanced')
      expect(result.success).toBe(true)
      expect(settings.save).toHaveBeenCalledWith({ performanceMode: 'balanced' })
      expect(fs.existsSync(snapshotPath)).toBe(false)

      const reg = runner.script('restore-registry')
      expect(reg).toContain("'SystemResponsiveness' 'DWord' ([int32]20)")
      expect(reg).toContain("'VisualFXSetting' 'DWord' ([int32]3)")
      expect(reg).toContain("'NetworkThrottlingIndex' 'DWord' ([int32]10)")
      expect(reg).toContain("'Scheduling Category' 'String' 'Medium'")
      // Values that did not exist before are deleted, not set to a guess.
      expect(reg).toMatch(/Remove-NfValue '[^']+' 'GameDVR_FSEBehaviorMode'/)
      expect(reg).toMatch(/Remove-NfValue '[^']+' 'AutoGameModeEnabled'/)

      const power = runner.script('power-restore')
      expect(power).toContain(`$original = '${USER_PLAN}'`)
      expect(power).toContain(`/setacvalueindex ${POWER_PLAN_HIGH_PERFORMANCE} SUB_PROCESSOR PROCTHROTTLEMIN 5`)
      expect(power).toContain(`/setdcvalueindex ${POWER_PLAN_HIGH_PERFORMANCE} SUB_PROCESSOR PROCTHROTTLEMIN 5`)
      expect(runner.steps()).toContain('power-cleanup')
      expect(runner.steps()).not.toContain('legacy-nagle')
    })

    it('keeps the snapshot and the mode when the restore fails', async () => {
      await create().service.applyMode('performance')
      const { service, settings } = create(
        (step) => (step === 'restore-registry' ? { stderr: 'SystemResponsiveness: Access is denied' } : undefined),
        'performance'
      )
      const result = await service.applyMode('balanced')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/administrador/)
      expect(fs.existsSync(snapshotPath)).toBe(true)
      expect(settings.save).not.toHaveBeenCalled()
    })

    it('without a snapshot is a safe no-op that only leaves a NitroFlow plan', async () => {
      const { service, runner } = create()
      const result = await service.applyMode('balanced')
      expect(result.success).toBe(true)
      expect(runner.steps()).toEqual(['power-restore', 'power-cleanup'])
      expect(runner.script('power-restore')).toContain("$original = ''")
      expect(runner.script('power-restore')).not.toContain('PROCTHROTTLEMIN')
    })

    it('cleans up after NitroFlow <= 1.2 (gaming without snapshot) with Windows defaults', async () => {
      const { service, runner } = create(undefined, 'gaming')
      const result = await service.applyMode('balanced')
      expect(result.success).toBe(true)
      expect(runner.script('restore-registry')).toContain("'SystemResponsiveness' 'DWord' ([int32]20)")
      expect(runner.script('power-restore')).toContain(`$original = '${POWER_PLAN_BALANCED}'`)
      const nagle = runner.script('legacy-nagle')
      expect(nagle).toContain('TcpAckFrequency -eq 1 -and $p.TCPNoDelay -eq 1')
      expect(fs.existsSync(snapshotPath)).toBe(false)
    })

    it('a legacy install switching modes snapshots Windows defaults, not the modified values', async () => {
      const modified = ALL_VALUES.map((v) =>
        v.id === 'systemResponsiveness' ? { ...v, value: 0 } : v
      )
      const { service } = create(
        (step) =>
          step === 'probe'
            ? { stdout: probeJson({ activeScheme: POWER_PLAN_HIGH_PERFORMANCE, values: modified }) }
            : undefined,
        'gaming'
      )
      await service.applyMode('performance')
      const snap = readSnap()
      expect(snap.legacyFrom).toBe('gaming')
      expect(snap.values.systemResponsiveness).toEqual({ exists: true, kind: 'DWord', value: 20 })
      expect(snap.activeScheme).toBe(POWER_PLAN_BALANCED)
    })

    it('refuses to restore without admin rights', async () => {
      await create().service.applyMode('performance')
      const { service } = create((step) => (step === 'admin' ? { stdout: 'False' } : undefined), 'performance')
      const result = await service.applyMode('balanced')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Ejecuta NitroFlow como administrador/)
      expect(fs.existsSync(snapshotPath)).toBe(true)
    })
  })
})
