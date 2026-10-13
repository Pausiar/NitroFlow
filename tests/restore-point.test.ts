import { RestorePointService, RESTORE_POINT_MESSAGES } from '../src/main/services/restore-point'
import type { PowerShellResult } from '../src/main/utils/powershell'

type Reply = { stdout?: string; stderr?: string }

function makeRunner(reply: Reply) {
  const calls: { script: string; timeout?: number }[] = []
  const run = async (script: string, timeout?: number): Promise<PowerShellResult> => {
    calls.push({ script, timeout })
    return { stdout: reply.stdout ?? '', stderr: reply.stderr ?? '', ok: !reply.stderr }
  }
  return { run, calls }
}

const json = (o: Record<string, unknown>) =>
  JSON.stringify({ srEnabled: true, before: -1, after: -1, warning: '', error: '', ...o })

describe('RestorePointService', () => {
  let originalPlatform: PropertyDescriptor | undefined

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  })

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('reports success when a new restore point appears', async () => {
    const { run, calls } = makeRunner({ stdout: json({ before: 4, after: 5 }) })
    const result = await new RestorePointService(run).create('Prueba')
    expect(result).toEqual({ success: true, message: RESTORE_POINT_MESSAGES.created })
    expect(calls[0].script).toContain('Checkpoint-Computer')
    expect(calls[0].script).toContain('MODIFY_SETTINGS')
    expect(calls[0].timeout).toBeGreaterThanOrEqual(60_000)
  })

  it('treats the 24 h limit warning as skipped (still protected)', async () => {
    const warning = 'A new system restore point cannot be created because one has already been created within the past 1440 minutes.'
    const { run } = makeRunner({ stdout: json({ before: 7, after: 7, warning }) })
    const result = await new RestorePointService(run).create()
    expect(result.success).toBe(true)
    expect(result.skipped).toBe(true)
    expect(result.message).toMatch(/Ya existe un punto de restauración reciente/)
  })

  it('treats an unchanged newest point as skipped even without warning text', async () => {
    const { run } = makeRunner({ stdout: json({ before: 3, after: 3 }) })
    const result = await new RestorePointService(run).create()
    expect(result).toMatchObject({ success: true, skipped: true })
  })

  it('fails clearly (and does not enable it) when System Restore is disabled', async () => {
    const { run, calls } = makeRunner({ stdout: json({ srEnabled: false }) })
    const result = await new RestorePointService(run).create()
    expect(result.success).toBe(false)
    expect(result.message).toBe(RESTORE_POINT_MESSAGES.disabled)
    expect(calls[0].script).not.toMatch(/Enable-ComputerRestore/)
  })

  it('maps access denied to an administrator message', async () => {
    const { run } = makeRunner({ stdout: json({ error: 'Access is denied' }) })
    const result = await new RestorePointService(run).create()
    expect(result).toEqual({ success: false, message: RESTORE_POINT_MESSAGES.admin })
  })

  it('fails gracefully on unusable output', async () => {
    const { run } = makeRunner({ stdout: '', stderr: 'boom' })
    const result = await new RestorePointService(run).create()
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/boom/)
  })

  it('escapes single quotes in the description', async () => {
    const { run, calls } = makeRunner({ stdout: json({ before: 1, after: 2 }) })
    await new RestorePointService(run).create("it's'; Remove-Item C:\\ -Recurse; '")
    expect(calls[0].script).toContain("-Description 'it''s''; Remove-Item C:\\ -Recurse; '''")
  })

  it('returns demo success outside Windows without running PowerShell', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    const { run, calls } = makeRunner({})
    const result = await new RestorePointService(run).create()
    expect(result.success).toBe(true)
    expect(calls.length).toBe(0)
  })
})
