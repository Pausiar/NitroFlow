import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import log from 'electron-log'
import type { ActionHistory, ActionType } from '../../shared/types'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export class HistoryService {
  private static instance: HistoryService
  private history: ActionHistory[] = []
  private storePath: string

  private constructor() {
    const dir = path.join(os.homedir(), 'NitroFlow')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.storePath = path.join(dir, 'history.json')
    this.load()
  }

  static getInstance(): HistoryService {
    if (!HistoryService.instance) {
      HistoryService.instance = new HistoryService()
    }
    return HistoryService.instance
  }

  record(opts: {
    type: ActionType
    description: string
    details: string
    reversible: boolean
    backupPath?: string
  }): ActionHistory {
    const entry: ActionHistory = {
      id: generateId(),
      timestamp: Date.now(),
      type: opts.type,
      description: opts.description,
      details: opts.details,
      reversible: opts.reversible,
      undone: false,
      backupPath: opts.backupPath
    }
    this.history.unshift(entry)
    if (this.history.length > 200) this.history = this.history.slice(0, 200)
    this.save()
    return entry
  }

  list(): ActionHistory[] {
    return this.history
  }

  async undo(id: string): Promise<{ success: boolean; error?: string }> {
    const entry = this.history.find((h) => h.id === id)
    if (!entry) return { success: false, error: 'Acción no encontrada' }
    if (!entry.reversible) return { success: false, error: 'Esta acción no es reversible' }
    if (entry.undone) return { success: false, error: 'Esta acción ya fue deshecha' }

    try {
      if (entry.type === 'registry' && entry.backupPath) {
        await this.restoreRegistryBackup(entry.backupPath)
      }
      entry.undone = true
      this.save()
      return { success: true }
    } catch (err) {
      log.error('undo error:', err)
      return { success: false, error: String(err) }
    }
  }

  private async restoreRegistryBackup(backupPath: string): Promise<void> {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    await execAsync(`reg import "${backupPath}"`, { timeout: 30000 })
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8')
        this.history = JSON.parse(raw)
      }
    } catch (err) {
      log.warn('Failed to load history:', err)
      this.history = []
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.history, null, 2), 'utf-8')
    } catch (err) {
      log.warn('Failed to save history:', err)
    }
  }
}
