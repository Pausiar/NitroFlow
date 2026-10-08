import { HistoryService } from '../src/main/services/history'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('HistoryService undo with payload', () => {
  const originalHome = process.env.HOME
  const originalProfile = process.env.USERPROFILE
  let tmpHome: string

  beforeAll(() => {
    // Isolated home so this suite never races the other history tests on ~/NitroFlow.
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nitroflow-history-'))
    process.env.HOME = tmpHome
    process.env.USERPROFILE = tmpHome
  })

  afterAll(() => {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = originalProfile
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(HistoryService as any).instance = undefined
  })

  it('does not claim to undo an action when no executor is registered', async () => {
    const service = HistoryService.getInstance()
    const entry = service.record({
      type: 'startup',
      description: 'Toggle',
      details: '',
      reversible: true,
      undo: { kind: 'startup', id: 'hkcu_Discord', enabled: true }
    })
    const result = await service.undo(entry.id)
    expect(result.success).toBe(false)
    expect(service.list()[0].undone).toBe(false)
  })

  it('runs the executor with the stored payload and then marks the action undone', async () => {
    const service = HistoryService.getInstance()
    const executed: unknown[] = []
    service.setUndoExecutor(async (payload) => {
      executed.push(payload)
      return { success: true }
    })
    const entry = service.record({
      type: 'startup',
      description: 'Toggle',
      details: '',
      reversible: true,
      undo: { kind: 'startup', id: 'hkcu_Discord', enabled: true }
    })
    const result = await service.undo(entry.id)
    expect(result.success).toBe(true)
    expect(executed).toEqual([{ kind: 'startup', id: 'hkcu_Discord', enabled: true }])
    expect(service.list()[0].undone).toBe(true)
  })

  it('leaves the action un-undone when the executor fails', async () => {
    const service = HistoryService.getInstance()
    service.setUndoExecutor(async () => ({ success: false, error: 'boom' }))
    const entry = service.record({
      type: 'service',
      description: 'Service',
      details: '',
      reversible: true,
      undo: { kind: 'service', name: 'SysMain', action: 'start' }
    })
    const result = await service.undo(entry.id)
    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')
    expect(service.list()[0].undone).toBe(false)
  })

  it('rejects registry backups outside the NitroFlow backup folder', async () => {
    const service = HistoryService.getInstance()
    const entry = service.record({
      type: 'registry',
      description: 'Registry',
      details: '',
      reversible: true,
      backupPath: path.join(os.tmpdir(), 'somewhere-else.reg')
    })
    const result = await service.undo(entry.id)
    expect(result.success).toBe(false)
    expect(service.list()[0].undone).toBe(false)
  })
})
