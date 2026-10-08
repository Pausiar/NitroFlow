import { StartupManager } from '../src/main/services/startup-manager'
import type { PowerShellResult } from '../src/main/utils/powershell'

type Reply = { stdout?: string; stderr?: string }

function makeRunner(handler: (script: string) => Reply) {
  const calls: string[] = []
  const run = async (script: string): Promise<PowerShellResult> => {
    calls.push(script)
    const r = handler(script)
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', ok: !r.stderr }
  }
  return { run, calls }
}

const LIST_JSON = JSON.stringify([
  { Id: 'hkcu_Discord', Name: 'Discord', Command: 'C:\\D\\Discord.exe', Location: 'HKCU', Enabled: false, ApprovedName: 'Discord' },
  { Id: 'hklm_OneDrive', Name: 'OneDrive', Command: 'C:\\O\\OneDrive.exe /background', Location: 'HKLM', Enabled: true, ApprovedName: 'OneDrive' },
  { Id: 'startup_My App.lnk', Name: 'My App', Command: 'C:\\s\\My App.lnk', Location: 'Startup', Enabled: true, ApprovedName: 'My App.lnk' }
])

describe('StartupManager (Windows)', () => {
  let originalPlatform: PropertyDescriptor | undefined

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  })

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  })

  const listing = (s: string): Reply => (s.includes('Get-Approved') ? { stdout: LIST_JSON } : {})

  it('reads the real enabled state (entries disabled earlier stay disabled)', async () => {
    const { run, calls } = makeRunner(listing)
    const entries = await new StartupManager(run).listEntries()
    expect(entries.length).toBe(3)
    expect(entries[0].enabled).toBe(false)
    expect(entries[1].enabled).toBe(true)
    expect(entries[0].impact).toBe('High')
    expect(calls[0]).toContain('StartupApproved\\Run')
    expect(calls[0]).toContain('StartupApproved\\StartupFolder')
  })

  it('returns an empty list (not demo programs) when PowerShell output is unusable', async () => {
    const entries = await new StartupManager(makeRunner(() => ({ stdout: 'garbage' })).run).listEntries()
    expect(entries).toEqual([])
  })

  it('enables an HKCU entry by writing flag 02 to StartupApproved\\Run', async () => {
    const { run, calls } = makeRunner(listing)
    const sm = new StartupManager(run)
    await sm.listEntries()
    calls.length = 0
    const result = await sm.toggleEntry('hkcu_Discord', true)
    expect(result.success).toBe(true)
    expect(calls[0]).toContain('[byte[]](2,0,0,0')
    expect(calls[0]).toContain('HKCU:\\SOFTWARE')
    expect(calls[0]).toContain("-Name 'Discord'")
  })

  it('uses the StartupFolder key and the real file name for Startup-folder items', async () => {
    const { run, calls } = makeRunner(listing)
    const sm = new StartupManager(run)
    await sm.listEntries()
    calls.length = 0
    await sm.toggleEntry('startup_My App.lnk', false)
    expect(calls[0]).toContain('[byte[]](3,0,0,0')
    expect(calls[0]).toContain('StartupFolder')
    expect(calls[0]).toContain("-Name 'My App.lnk'")
  })

  it('writes HKLM entries under HKLM', async () => {
    const { run, calls } = makeRunner(listing)
    const sm = new StartupManager(run)
    await sm.listEntries()
    calls.length = 0
    await sm.toggleEntry('hklm_OneDrive', false)
    expect(calls[0]).toContain('HKLM:\\SOFTWARE')
  })

  it('reports a failed toggle instead of a fake success', async () => {
    const { run } = makeRunner((s) =>
      s.includes('Get-Approved') ? { stdout: LIST_JSON } : { stderr: 'Attempted to perform an unauthorized operation.' }
    )
    const sm = new StartupManager(run)
    await sm.listEntries()
    const result = await sm.toggleEntry('hklm_OneDrive', false)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('refreshes the list on its own when toggled before being listed', async () => {
    const result = await new StartupManager(makeRunner(listing).run).toggleEntry('hkcu_Discord', false)
    expect(result.success).toBe(true)
  })

  it('rejects unknown ids', async () => {
    const result = await new StartupManager(makeRunner(listing).run).toggleEntry('nope', true)
    expect(result.success).toBe(false)
  })
})
