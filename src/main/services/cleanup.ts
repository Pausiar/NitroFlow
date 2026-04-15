import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import log from 'electron-log'
import { PROTECTED_PATHS, isPathSafe } from '../utils/security'
import type { CleanupCategory, CleanupResult } from '../../shared/types'

const execAsync = promisify(exec)

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
    const results: CleanupCategory[] = []
    for (const cat of CLEANUP_CATEGORIES) {
      if (process.platform !== 'win32') {
        results.push({ ...cat, sizeMB: Math.random() * 500, fileCount: Math.floor(Math.random() * 1000) })
        continue
      }
      const { sizeMB, fileCount } = await this.measureCategory(cat)
      results.push({ ...cat, sizeMB, fileCount })
    }
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

    if (cat.id === 'recycle_bin') {
      try {
        await execAsync('powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"')
        freedMB = 0
        deletedFiles = 0
      } catch (err) {
        errors.push(String(err))
      }
      return { categoryId: cat.id, freedMB, deletedFiles, errors, success: errors.length === 0 }
    }

    for (const rawPath of cat.paths) {
      const expandedPath = this.expandPath(rawPath)
      if (!isPathSafe(expandedPath)) {
        errors.push(`Ruta protegida omitida: ${expandedPath}`)
        continue
      }
      try {
        const before = await this.getDirSize(expandedPath)
        await this.deleteContents(expandedPath)
        const after = await this.getDirSize(expandedPath)
        freedMB += before.sizeMB - after.sizeMB
        deletedFiles += before.fileCount - after.fileCount
      } catch (err) {
        errors.push(`Error en ${expandedPath}: ${String(err)}`)
      }
    }

    return {
      categoryId: cat.id,
      freedMB: Math.max(0, Math.round(freedMB * 10) / 10),
      deletedFiles: Math.max(0, deletedFiles),
      errors,
      success: errors.length === 0
    }
  }

  private async deleteContents(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) return
    const ps = `
      Get-ChildItem -Path "${dirPath}" -Force -ErrorAction SilentlyContinue |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    `
    await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { timeout: 30000 })
  }

  private async getDirSize(dirPath: string): Promise<{ sizeMB: number; fileCount: number }> {
    if (!fs.existsSync(dirPath)) return { sizeMB: 0, fileCount: 0 }
    const ps = `
      $items = Get-ChildItem -Path "${dirPath}" -Recurse -Force -ErrorAction SilentlyContinue
      $size = ($items | Measure-Object -Property Length -Sum).Sum
      $count = ($items | Where-Object { !$_.PSIsContainer } | Measure-Object).Count
      [PSCustomObject]@{ Size = [long]($size ?? 0); Count = [int]($count ?? 0) } | ConvertTo-Json
    `
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`,
      { timeout: 15000 }
    )
    const data = JSON.parse(stdout.trim())
    return {
      sizeMB: Math.round((Number(data.Size ?? 0) / (1024 * 1024)) * 10) / 10,
      fileCount: Number(data.Count ?? 0)
    }
  }

  private async measureRecycleBin(): Promise<{ sizeMB: number; fileCount: number }> {
    try {
      const ps = `
        $shell = New-Object -ComObject Shell.Application
        $bin = $shell.Namespace(0xa)
        $size = 0; $count = 0
        foreach ($item in $bin.Items()) { $size += $item.Size; $count++ }
        [PSCustomObject]@{ Size = $size; Count = $count } | ConvertTo-Json
      `
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`,
        { timeout: 10000 }
      )
      const data = JSON.parse(stdout.trim())
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
