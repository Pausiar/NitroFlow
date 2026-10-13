/**
 * End-to-end checks that run the REAL PowerShell scripts on Windows.
 *
 * They only run when NITROFLOW_WINDOWS_E2E=1 (set by the CI workflow on a
 * disposable GitHub Actions Windows runner), because some of them change the
 * system: never enable this on your own PC.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const scriptErrors: string[] = []

jest.mock('../src/main/utils/powershell', () => {
  const actual = jest.requireActual('../src/main/utils/powershell')
  const PARSE_ERROR = /ParserError|Unexpected token|Missing (closing|expression|argument)|is not recognized as|The term '.*' is not recognized/i
  const wrapped = async (script: string, timeoutMs?: number) => {
    const result = await actual.runPowerShellResult(script, timeoutMs)
    if (result.stderr) {
      // Printed so CI logs show the exact PowerShell error behind a failure.
      console.log(`[powershell stderr] ${result.stderr}\n--- script ---\n${script}`)
    }
    if (PARSE_ERROR.test(result.stderr)) {
      scriptErrors.push(`${result.stderr}\n--- script ---\n${script.slice(0, 400)}`)
    }
    return result
  }
  return {
    ...actual,
    runPowerShellResult: wrapped,
    runPowerShell: async (script: string, timeoutMs?: number) => (await wrapped(script, timeoutMs)).stdout
  }
})

const enabled = process.platform === 'win32' && process.env.NITROFLOW_WINDOWS_E2E === '1'
const describeWin = enabled ? describe : describe.skip

jest.setTimeout(10 * 60 * 1000)

describeWin('Windows end-to-end (real PowerShell)', () => {
  afterEach(() => {
    const errors = scriptErrors.splice(0)
    expect(errors).toEqual([])
  })

  it('reads system metrics', async () => {
    const { SystemMonitor } = await import('../src/main/services/system-monitor')
    const m = await new SystemMonitor().getSnapshot()
    expect(m.cpu.logicalCount).toBeGreaterThan(0)
    expect(m.ram.totalMB).toBeGreaterThan(0)
    expect(m.disk.length).toBeGreaterThan(0)
  })

  it('lists processes and services', async () => {
    const { ProcessManager } = await import('../src/main/services/process-manager')
    const pm = new ProcessManager()
    expect((await pm.listProcesses()).length).toBeGreaterThan(5)
    expect((await pm.listServices()).length).toBeGreaterThan(5)
  })

  it('lists startup entries with recommendations', async () => {
    const { StartupManager } = await import('../src/main/services/startup-manager')
    const entries = await new StartupManager().listEntries()
    for (const e of entries) expect(e.recommendation).toBeDefined()
  })

  it('scans the registry without errors', async () => {
    const { RegistryService } = await import('../src/main/services/registry')
    const entries = await new RegistryService().scan()
    expect(Array.isArray(entries)).toBe(true)
  })

  it('scans and cleans only old temp files, keeping fresh ones', async () => {
    const tempDir = process.env.TEMP as string
    const fresh = path.join(tempDir, `nitroflow-e2e-fresh-${Date.now()}.txt`)
    const old = path.join(tempDir, `nitroflow-e2e-old-${Date.now()}.txt`)
    fs.writeFileSync(fresh, 'fresh')
    fs.writeFileSync(old, 'x'.repeat(1024 * 1024))
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000)
    fs.utimesSync(old, twoDaysAgo, twoDaysAgo)
    // CreationTime also counts as "recent"; age it through PowerShell.
    const { runPowerShellResult } = await import('../src/main/utils/powershell')
    await runPowerShellResult(
      `(Get-Item -LiteralPath '${old.replace(/'/g, "''")}').CreationTime = (Get-Date).AddDays(-2)`
    )

    const { CleanupService } = await import('../src/main/services/cleanup')
    const service = new CleanupService()
    const categories = await service.scan()
    expect(categories.length).toBeGreaterThan(5)
    // The 1 MB old file must be measured (the scan used to report 0 MB silently).
    expect(categories.find((c) => c.id === 'temp_user')?.sizeMB ?? 0).toBeGreaterThanOrEqual(1)
    const results = await service.clean(['temp_user'])
    expect(results[0].errors).toEqual([])
    expect(results[0].freedMB).toBeGreaterThanOrEqual(1)
    expect(fs.existsSync(fresh)).toBe(true)
    expect(fs.existsSync(old)).toBe(false)
    fs.rmSync(fresh, { force: true })
  })

  it('never touches files outside the temp folders', async () => {
    const docs = path.join(os.homedir(), 'Documents')
    fs.mkdirSync(docs, { recursive: true })
    const marker = path.join(docs, `nitroflow-e2e-keep-${Date.now()}.txt`)
    fs.writeFileSync(marker, 'keep me')
    const { CleanupService, CLEANUP_CATEGORIES } = await import('../src/main/services/cleanup')
    await new CleanupService().clean(CLEANUP_CATEGORIES.filter((c) => c.recommended).map((c) => c.id))
    expect(fs.existsSync(marker)).toBe(true)
    fs.rmSync(marker, { force: true })
  })

  it('runs the health check and the one-click optimization', async () => {
    const { HealthService } = await import('../src/main/services/health')
    const health = new HealthService()
    const report = await health.scan()
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
    const progress: number[] = []
    const result = await health.smartOptimize(['cleanup_safe', 'startup_disable_recommended'], (p) =>
      progress.push(p.percent)
    )
    expect(result.restorePoint.message.length).toBeGreaterThan(0)
    expect(result.results.length).toBe(2)
    expect(progress.length).toBeGreaterThan(0)
  })

  it('creates a restore point or explains why not', async () => {
    const { RestorePointService } = await import('../src/main/services/restore-point')
    const r = await new RestorePointService().create('NitroFlow CI')
    expect(r.message.length).toBeGreaterThan(0)
  })

  it('gaming mode is fully reverted by balanced mode', async () => {
    const { runPowerShellResult } = await import('../src/main/utils/powershell')
    const readState = async (): Promise<string> =>
      (
        await runPowerShellResult(`
          $p = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
          $g = 'HKCU:\\System\\GameConfigStore'
          $sp = Get-ItemProperty -Path $p -ErrorAction SilentlyContinue
          $gc = Get-ItemProperty -Path $g -ErrorAction SilentlyContinue
          $plan = (powercfg /getactivescheme) -join ' '
          [PSCustomObject]@{
            SystemResponsiveness = $sp.SystemResponsiveness
            NetworkThrottlingIndex = $sp.NetworkThrottlingIndex
            GameDVR = $gc.GameDVR_Enabled
            Plan = $plan
          } | ConvertTo-Json -Compress`)
      ).stdout

    const { OptimizerService } = await import('../src/main/services/optimizer')
    const optimizer = OptimizerService.getInstance()
    const before = await readState()

    const gaming = await optimizer.applyMode('gaming')
    expect(gaming.error).toBeUndefined()
    expect(gaming.success).toBe(true)
    expect(await readState()).not.toEqual(before)

    const balanced = await optimizer.applyMode('balanced')
    expect(balanced.error).toBeUndefined()
    expect(balanced.success).toBe(true)
    expect(await readState()).toEqual(before)
  })
})
