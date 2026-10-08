import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import log from 'electron-log'
import type { ActionHistory, ActionType, UndoPayload } from '../../shared/types'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Executes the revert described by an {@link UndoPayload}. Registered by the IPC layer. */
export type UndoExecutor = (payload: UndoPayload) => Promise<{ success: boolean; error?: string }>

export class HistoryService {
  private static instance: HistoryService
  private history: ActionHistory[] = []
  private storePath: string
  private undoExecutor: UndoExecutor | null = null

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

  /** Registers the function that performs reverts that need other services. */
  setUndoExecutor(executor: UndoExecutor): void {
    this.undoExecutor = executor
  }

  record(opts: {
    type: ActionType
    description: string
    details: string
    reversible: boolean
    backupPath?: string
    undo?: UndoPayload
  }): ActionHistory {
    const entry: ActionHistory = {
      id: generateId(),
      timestamp: Date.now(),
      type: opts.type,
      description: opts.description,
      details: opts.details,
      reversible: opts.reversible,
      undone: false,
      backupPath: opts.backupPath,
      undo: opts.undo
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
      if (entry.undo) {
        // Previously this only flipped `undone = true` for startup / service /
        // optimizer actions, claiming a revert that never happened.
        if (!this.undoExecutor) {
          return { success: false, error: 'No se puede deshacer esta acción ahora mismo' }
        }
        const result = await this.undoExecutor(entry.undo)
        if (!result.success) {
          return { success: false, error: result.error ?? 'No se pudo deshacer la acción' }
        }
      }
      entry.undone = true
      this.save()
      return { success: true }
    } catch (err) {
      log.error('undo error:', err)
      return { success: false, error: String(err) }
    }
  }

  /**
   * Re-imports the .reg backup(s) of a registry action. `backupPath` is a
   * folder with one .reg per modified key (current format) or a single .reg
   * file (older versions). Only paths inside NitroFlow's own backup folder are
   * accepted, since history.json is a plain user-writable file.
   */
  private async restoreRegistryBackup(backupPath: string): Promise<void> {
    const root = path.resolve(os.homedir(), 'NitroFlow', 'registry-backups')
    const target = path.resolve(backupPath)
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error('Ruta de copia de seguridad no válida')
    }
    if (!fs.existsSync(target)) {
      throw new Error('La copia de seguridad ya no existe')
    }

    const files = fs.statSync(target).isDirectory()
      ? fs
          .readdirSync(target)
          .filter((f) => f.toLowerCase().endsWith('.reg'))
          .sort()
          .map((f) => path.join(target, f))
      : [target]
    if (files.length === 0) throw new Error('La copia de seguridad está vacía')

    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const execFileAsync = promisify(execFile)
    for (const file of files) {
      await execFileAsync('reg', ['import', file], { timeout: 30000 })
    }
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
