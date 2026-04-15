import { HistoryService } from '../src/main/services/history'
import type { ActionHistory } from '../src/shared/types'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('HistoryService', () => {
  const storeFile = path.join(os.homedir(), 'NitroFlow', 'history.json')

  beforeEach(() => {
    // Reset singleton for isolated tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(HistoryService as any).instance = undefined
    // Remove any existing history file to start fresh
    if (fs.existsSync(storeFile)) {
      fs.unlinkSync(storeFile)
    }
  })

  afterEach(() => {
    if (fs.existsSync(storeFile)) {
      fs.unlinkSync(storeFile)
    }
  })

  describe('getInstance', () => {
    it('returns the same instance (singleton)', () => {
      const a = HistoryService.getInstance()
      const b = HistoryService.getInstance()
      expect(a).toBe(b)
    })
  })

  describe('record', () => {
    it('records an action and returns it', () => {
      const service = HistoryService.getInstance()
      const entry = service.record({
        type: 'cleanup',
        description: 'Limpieza completada',
        details: 'Se limpiaron 100 MB',
        reversible: false
      })
      expect(entry.id).toBeTruthy()
      expect(entry.type).toBe('cleanup')
      expect(entry.description).toBe('Limpieza completada')
      expect(entry.reversible).toBe(false)
      expect(entry.undone).toBe(false)
      expect(entry.timestamp).toBeGreaterThan(0)
    })

    it('adds entry to the list', () => {
      const service = HistoryService.getInstance()
      service.record({ type: 'cleanup', description: 'Test', details: '', reversible: false })
      expect(service.list().length).toBe(1)
    })

    it('most recent entry appears first', () => {
      const service = HistoryService.getInstance()
      service.record({ type: 'cleanup', description: 'First', details: '', reversible: false })
      service.record({ type: 'registry', description: 'Second', details: '', reversible: true })
      const list = service.list()
      expect(list[0].description).toBe('Second')
      expect(list[1].description).toBe('First')
    })

    it('limits history to 200 entries', () => {
      const service = HistoryService.getInstance()
      for (let i = 0; i < 210; i++) {
        service.record({ type: 'cleanup', description: `Action ${i}`, details: '', reversible: false })
      }
      expect(service.list().length).toBeLessThanOrEqual(200)
    })
  })

  describe('list', () => {
    it('returns empty array initially', () => {
      const service = HistoryService.getInstance()
      expect(service.list()).toEqual([])
    })

    it('returns all recorded actions', () => {
      const service = HistoryService.getInstance()
      service.record({ type: 'startup', description: 'Startup disabled', details: '', reversible: true })
      service.record({ type: 'process', description: 'Process killed', details: '', reversible: false })
      expect(service.list().length).toBe(2)
    })
  })

  describe('undo', () => {
    it('returns error for unknown action id', async () => {
      const service = HistoryService.getInstance()
      const result = await service.undo('nonexistent-id')
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('returns error for non-reversible action', async () => {
      const service = HistoryService.getInstance()
      const entry = service.record({ type: 'cleanup', description: 'Cleanup', details: '', reversible: false })
      const result = await service.undo(entry.id)
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/reversible/i)
    })

    it('marks reversible action as undone', async () => {
      const service = HistoryService.getInstance()
      const entry = service.record({ type: 'startup', description: 'Toggle startup', details: '', reversible: true })
      const result = await service.undo(entry.id)
      expect(result.success).toBe(true)
      const updated = service.list().find((h: ActionHistory) => h.id === entry.id)
      expect(updated?.undone).toBe(true)
    })

    it('cannot undo an already-undone action', async () => {
      const service = HistoryService.getInstance()
      const entry = service.record({ type: 'startup', description: 'Toggle', details: '', reversible: true })
      await service.undo(entry.id)
      const result = await service.undo(entry.id)
      expect(result.success).toBe(false)
    })
  })
})

