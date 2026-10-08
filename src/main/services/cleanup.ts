import * as fs from 'fs'
import * as path from 'path'
import log from 'electron-log'
import { runPowerShell, runPowerShellResult } from '../utils/powershell'
import { isPathSafe } from '../utils/security'
import type { CleanupCategory, CleanupResult } from '../../shared/types'

export const CLEANUP_CATEGORIES: Omit<CleanupCategory, 'sizeMB' | 'fileCount'>[] = [
  {
    id: 'temp_windows',
    name: 'Archivos temporales de Windows',
    description: 'Archivos en %WINDIR%\\Temp',
    paths: ['%WINDIR%\\Temp'],
    safe: true
  },
  {
    id: 'temp_user',
    name: 'Archivos temporales del usuario',
    description: 'Archivos en %TEMP% del usuario actual',
    paths: ['%TEMP%'],
    safe: true
  },
  {
    id: 'prefetch',
    name: 'Archivos Prefetch',
    description: 'Archivos de precarga de aplicaciones (C:\\Windows\\Prefetch)',
    paths: ['%WINDIR%\\Prefetch'],
    safe: true
  },
  {
    id: 'recent',
    name: 'Lista de archivos recientes',
    description: 'Historial de archivos recientes del Explorador',
    paths: ['%APPDATA%\\Microsoft\\Windows\\Recent'],
    safe: true
  },
  {
    id: 'thumbnail_cache',
    name: 'Caché de miniaturas',
    description: 'Caché de miniaturas del Explorador',
    paths: ['%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer'],
    safe: true
  },
  {
    id: 'recycle_bin',
    name: 'Papelera de reciclaje',
    description: 'Archivos en la Papelera de reciclaje',
    paths: [],
    safe: true
  },
  {
    id: 'windows_update',
    name: 'Caché de Windows Update',
    description: 'Archivos de actualización descargados',
    paths: ['%WINDIR%\\SoftwareDistribution\\Download'],
    safe: true
  },
  {
    id: 'event_logs',
    name: 'Registros de eventos obsoletos',
    description: 'Logs de eventos de aplicaciones no críticos',
    paths: ['%WINDIR%\\Logs'],
    safe: false
  }
]

export class CleanupService {
  async scan(): Promise<CleanupCategory[]> {
    const measure = async (
      cat: (typeof CLEANUP_CATEGORIES)[number]
    ): Promise<CleanupCategory> => {
      if (process.platform !== 'win32') {
        return { ...cat, sizeMB: Math.random() * 500, fileCount: Math.floor(Math.random() * 1000) }
      }
      const { sizeMB, fileCount } = await this.measureCategory(cat)
      return { ...cat, sizeMB, fileCount }
    }

    // Each Windows measurement spawns PowerShell and walks a directory tree.
    // Running them one after another made the scan take the sum of all of
    // them; a small pool keeps it fast without launching 8 shells at once.
    const results: CleanupCategory[] = new Array(CLEANUP_CATEGORIES.length)
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < CLEANUP_CATEGORIES.length) {
        const index = next++
        results[index] = await measure(CLEANUP_CATEGORIES[index])
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, CLEANUP_CATEGORIES.length) }, worker))
    return results
  }

  async clean(categoryIds: string[]): Promise<CleanupResult[]> {
    const results: CleanupResult[] = []
    const categories = CLEANUP_CATEGORIES.filter((c) => categoryIds.includes(c.id))

    for (const cat of categories) {
      if (process.platform !== 'win32') {
        results.push({ categoryId: cat.id, freedMB: Math.random() * 200, deletedFiles: Math.floor(Math.random() * 500), errors: [], success: true })
        continue
      }
      const result = await this.cleanCategory(cat)
      results.push(result)
    }
    return results
  }

  private async measureCategory(
    cat: Omit<CleanupCategory, 'sizeMB' | 'fileCount'>
  ): Promise<{ sizeMB: number; fileCount: number }> {
    if (cat.id === 'recycle_bin') {
      return this.measureRecycleBin()
    }
    let totalSize = 0
    let totalFiles = 0
    for (const rawPath of cat.paths) {
      const expandedPath = this.expandPath(rawPath)
      if (!isPathSafe(expandedPath)) continue
      try {
        const { sizeMB, fileCount } = await this.getDirSize(expandedPath)
        totalSize += sizeMB
        totalFiles += fileCount
      } catch {
        // Path may not exist
      }
    }
    return { sizeMB: Math.round(totalSize * 10) / 10, fileCount: totalFiles }
  }

  private async cleanCategory(
    cat: Omit<CleanupCategory, 'sizeMB' | 'fileCount'>
  ): Promise<CleanupResult> {
    const errors: string[] = []
    let freedMB = 0
    let deletedFiles = 0
    let requiresAdmin = false
    let hadContent = false

    if (cat.id === 'recycle_bin') {
      const { stderr } = await runPowerShellResult(
        'Clear-RecycleBin -Force -ErrorAction SilentlyContinue',
        15000
      )
      if (stderr && !/no items|vacía|empty/i.test(stderr)) {
        if (this.isAccessDenied(stderr)) requiresAdmin = true
        else errors.push(this.humanizeError('Papelera de reciclaje', stderr))
      }
      return {
        categoryId: cat.id,
        freedMB: 0,
        deletedFiles: 0,
        errors,
        success: errors.length === 0,
        requiresAdmin
      }
    }

    for (const rawPath of cat.paths) {
      const expandedPath = this.expandPath(rawPath)
      if (!isPathSafe(expandedPath)) {
        errors.push(`Ruta protegida omitida: ${expandedPath}`)
        continue
      }
      if (!fs.existsSync(expandedPath)) {
        // Missing path is not an error — simply nothing to clean here.
        continue
      }
      try {
        const before = await this.getDirSize(expandedPath)
        if (before.fileCount > 0 || before.sizeMB > 0) hadContent = true
        const stderr = await this.deleteContents(expandedPath)
        if (stderr) {
          if (this.isAccessDenied(stderr)) requiresAdmin = true
          else errors.push(this.humanizeError(expandedPath, stderr))
        }
        const after = await this.getDirSize(expandedPath)
        freedMB += before.sizeMB - after.sizeMB
        deletedFiles += before.fileCount - after.fileCount
      } catch (err) {
        const msg = String(err)
        if (this.isAccessDenied(msg)) requiresAdmin = true
        else errors.push(this.humanizeError(expandedPath, msg))
      }
    }

    return {
      categoryId: cat.id,
      freedMB: Math.max(0, Math.round(freedMB * 10) / 10),
      deletedFiles: Math.max(0, deletedFiles),
      errors,
      // A category with no content and no hard errors is a success (0 files),
      // not a failure. Admin-only locked content is reported separately.
      success: errors.length === 0,
      requiresAdmin: requiresAdmin || undefined,
      empty: !hadContent && errors.length === 0 && !requiresAdmin ? true : undefined
    }
  }

  private isAccessDenied(message: string): boolean {
    return /access.*denied|acceso.*denegado|UnauthorizedAccess|PermissionDenied|denied/i.test(
      message
    )
  }

  private humanizeError(target: string, raw: string): string {
    // Keep technical detail in logs, show a concise message to the user.
    log.warn(`Cleanup error on ${target}: ${raw}`)
    if (/in use|being used|siendo utilizado|bloque/i.test(raw)) {
      return `Algunos archivos estaban en uso y no se pudieron eliminar.`
    }
    return `No se pudieron eliminar algunos archivos.`
  }

  private async deleteContents(dirPath: string): Promise<string> {
    if (!fs.existsSync(dirPath)) return ''
    // Single-quoted path inside the script — no user input, expandPath is our own logic
    const safePath = dirPath.replace(/'/g, "''")
    const ps = `
      Get-ChildItem -Path '${safePath}' -Force -ErrorAction SilentlyContinue |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    `
    const { stderr } = await runPowerShellResult(ps, 30000)
    return stderr
  }

  private async getDirSize(dirPath: string): Promise<{ sizeMB: number; fileCount: number }> {
    if (!fs.existsSync(dirPath)) return { sizeMB: 0, fileCount: 0 }
    const safePath = dirPath.replace(/'/g, "''")
    const ps = `
      $items = Get-ChildItem -Path '${safePath}' -Recurse -Force -ErrorAction SilentlyContinue
      $sizeRaw = ($items | Measure-Object -Property Length -Sum).Sum
      $countRaw = ($items | Where-Object { !$_.PSIsContainer } | Measure-Object).Count
      $size = if ($sizeRaw -ne $null) { [long]$sizeRaw } else { 0L }
      $count = if ($countRaw -ne $null) { [int]$countRaw } else { 0 }
      [PSCustomObject]@{ Size = $size; Count = $count } | ConvertTo-Json -Compress
    `
    const stdout = await runPowerShell(ps, 45000)
    const data = this.safeParse(stdout)
    return {
      sizeMB: Math.round((Number(data.Size ?? 0) / (1024 * 1024)) * 10) / 10,
      fileCount: Number(data.Count ?? 0)
    }
  }

  private safeParse(stdout: string): { Size?: number; Count?: number } {
    const trimmed = (stdout ?? '').trim()
    if (!trimmed) return { Size: 0, Count: 0 }
    try {
      return JSON.parse(trimmed)
    } catch {
      log.warn('Cleanup: could not parse PowerShell size output')
      return { Size: 0, Count: 0 }
    }
  }

  private async measureRecycleBin(): Promise<{ sizeMB: number; fileCount: number }> {
    try {
      const ps = `
        $shell = New-Object -ComObject Shell.Application
        $bin = $shell.Namespace(0xa)
        $size = 0; $count = 0
        foreach ($item in $bin.Items()) { $size += $item.Size; $count++ }
        [PSCustomObject]@{ Size = $size; Count = $count } | ConvertTo-Json -Compress
      `
      const stdout = await runPowerShell(ps, 10000)
      const data = this.safeParse(stdout)
      return {
        sizeMB: Math.round((Number(data.Size ?? 0) / (1024 * 1024)) * 10) / 10,
        fileCount: Number(data.Count ?? 0)
      }
    } catch {
      return { sizeMB: 0, fileCount: 0 }
    }
  }

  private expandPath(rawPath: string): string {
    return rawPath
      .replace('%WINDIR%', process.env.WINDIR ?? 'C:\\Windows')
      .replace('%TEMP%', process.env.TEMP ?? process.env.TMP ?? path.join(process.env.USERPROFILE ?? 'C:\\Users\\Default', 'AppData', 'Local', 'Temp'))
      .replace('%APPDATA%', process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? 'C:\\Users\\Default', 'AppData', 'Roaming'))
      .replace('%LOCALAPPDATA%', process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? 'C:\\Users\\Default', 'AppData', 'Local'))
  }
}
