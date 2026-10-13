import * as fs from 'fs'
import log from 'electron-log'
import { runPowerShellResult, type PowerShellRunner } from '../utils/powershell'
import { isPathSafe } from '../utils/security'
import type { CleanupCategory, CleanupResult } from '../../shared/types'

type BaseCategory = Omit<CleanupCategory, 'sizeMB' | 'fileCount'>

/** Scan result: a category plus, optionally, why it cannot be cleaned right now. */
export interface CleanupCategoryScan extends CleanupCategory {
  /** E.g. "Cierra Google Chrome para limpiar su caché" when the browser is running. */
  blockedReason?: string
}

/** Clean result with extra, UI-friendly detail. Extends the shared type (fields are kept). */
export interface CleanupRunResult extends CleanupResult {
  /** The category was intentionally not cleaned (browser open, update in progress...). */
  skippedReason?: string
  /** Files that were in use and therefore left untouched ("en uso"). */
  lockedFiles?: number
}

/**
 * Categories. `recommended` = no user data can be lost and nothing gets slower
 * afterwards, so the UI pre-selects it and the one-click optimization uses it.
 * `safe` = cleaning it can never break Windows (it may still lose user data,
 * e.g. the recycle bin, which is why those are not `recommended`).
 */
export const CLEANUP_CATEGORIES: BaseCategory[] = [
  {
    id: 'temp_user',
    name: 'Archivos temporales del usuario',
    description: 'Archivos temporales de tus programas con más de 24 horas de antigüedad',
    paths: ['%TEMP%'],
    safe: true,
    recommended: true
  },
  {
    id: 'temp_windows',
    name: 'Archivos temporales de Windows',
    description: 'Archivos temporales del sistema con más de 24 horas de antigüedad',
    paths: ['%WINDIR%\\Temp'],
    safe: true,
    recommended: true
  },
  {
    id: 'windows_update',
    name: 'Caché de Windows Update',
    description: 'Instaladores de actualizaciones ya descargados (Windows los vuelve a bajar si hacen falta)',
    paths: ['%WINDIR%\\SoftwareDistribution\\Download'],
    safe: true,
    recommended: true
  },
  {
    id: 'delivery_optimization',
    name: 'Caché de optimización de entrega',
    description: 'Copias de actualizaciones que Windows guarda para compartir con otros equipos',
    paths: [
      '%WINDIR%\\SoftwareDistribution\\DeliveryOptimization',
      '%WINDIR%\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache'
    ],
    safe: true,
    recommended: true
  },
  {
    id: 'thumbnail_cache',
    name: 'Caché de miniaturas',
    description: 'Miniaturas e iconos en caché del Explorador (se regeneran solos)',
    paths: ['%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer'],
    safe: true,
    recommended: true
  },
  {
    id: 'error_reports',
    name: 'Informes de errores de Windows',
    description: 'Informes de fallos ya generados por Windows',
    paths: [
      '%PROGRAMDATA%\\Microsoft\\Windows\\WER\\ReportArchive',
      '%PROGRAMDATA%\\Microsoft\\Windows\\WER\\ReportQueue',
      '%LOCALAPPDATA%\\Microsoft\\Windows\\WER\\ReportArchive',
      '%LOCALAPPDATA%\\Microsoft\\Windows\\WER\\ReportQueue'
    ],
    safe: true,
    recommended: true
  },
  {
    id: 'crash_dumps',
    name: 'Volcados de errores de aplicaciones',
    description: 'Archivos de diagnóstico que dejan los programas al cerrarse con un error',
    paths: ['%LOCALAPPDATA%\\CrashDumps'],
    safe: true,
    recommended: true
  },
  {
    id: 'shader_cache',
    name: 'Caché de sombreadores DirectX',
    description: 'Caché gráfica de juegos y apps (se vuelve a crear automáticamente)',
    paths: ['%LOCALAPPDATA%\\D3DSCache'],
    safe: true,
    recommended: true
  },
  {
    id: 'browser_chrome',
    name: 'Caché de Google Chrome',
    description: 'Solo la caché de páginas web. No toca contraseñas, historial ni sesiones',
    paths: chromiumCachePaths('%LOCALAPPDATA%\\Google\\Chrome\\User Data'),
    safe: true,
    recommended: true
  },
  {
    id: 'browser_edge',
    name: 'Caché de Microsoft Edge',
    description: 'Solo la caché de páginas web. No toca contraseñas, historial ni sesiones',
    paths: chromiumCachePaths('%LOCALAPPDATA%\\Microsoft\\Edge\\User Data'),
    safe: true,
    recommended: true
  },
  {
    id: 'browser_brave',
    name: 'Caché de Brave',
    description: 'Solo la caché de páginas web. No toca contraseñas, historial ni sesiones',
    paths: chromiumCachePaths('%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data'),
    safe: true,
    recommended: true
  },
  {
    id: 'browser_firefox',
    name: 'Caché de Mozilla Firefox',
    description: 'Solo la caché de páginas web. No toca contraseñas, historial ni sesiones',
    paths: ['%LOCALAPPDATA%\\Mozilla\\Firefox\\Profiles\\*\\cache2'],
    safe: true,
    recommended: true
  },
  {
    id: 'recycle_bin',
    name: 'Papelera de reciclaje',
    description: 'Archivos que has eliminado y siguen en la Papelera',
    paths: [],
    safe: true,
    recommended: false,
    warning: 'Los archivos de la papelera se borrarán para siempre'
  },
  {
    id: 'prefetch',
    name: 'Archivos Prefetch',
    description: 'Datos de precarga que Windows usa para abrir programas más rápido',
    paths: ['%WINDIR%\\Prefetch'],
    safe: true,
    recommended: false,
    warning:
      'Windows los vuelve a crear, pero los próximos arranques y aperturas de programas serán más lentos'
  },
  {
    id: 'recent',
    name: 'Lista de archivos recientes',
    description: 'Accesos directos a los últimos archivos que abriste',
    paths: ['%APPDATA%\\Microsoft\\Windows\\Recent'],
    safe: true,
    recommended: false,
    warning: 'Perderás la lista de archivos recientes del Explorador y de Office'
  },
  {
    id: 'event_logs',
    name: 'Registros de Windows',
    description: 'Archivos de registro (.log y .etl) de Windows con más de 7 días',
    paths: ['%WINDIR%\\Logs'],
    safe: false,
    recommended: false,
    warning: 'Pueden ser útiles si necesitas diagnosticar un problema del sistema más adelante'
  }
]

/** Cache-only sub-folders of a Chromium browser's "User Data" (never cookies, history, passwords...). */
function chromiumCachePaths(userData: string): string[] {
  const out: string[] = []
  for (const profile of ['Default', 'Profile *']) {
    for (const dir of ['Cache', 'Code Cache', 'GPUCache']) {
      out.push(`${userData}\\${profile}\\${dir}`)
    }
  }
  return out
}

/** How a category is measured / cleaned (kept out of the shared type on purpose). */
export interface CategoryRule {
  /** Only touch files older than this (newest of modified/created time). */
  minAgeHours?: number
  /** Only touch files whose name matches one of these wildcards. */
  patterns?: string[]
  /** Look into sub-folders (default true). */
  recurse?: boolean
  /** Every resolved root must end with a folder matching this (guards against a hijacked %TEMP%). */
  leafName?: RegExp
  /** Skip while this program is running (cache of an open browser). */
  browser?: { label: string; processes: string[] }
  /** Use the Windows cmdlet first, then clean what is left. */
  deliveryOptimization?: boolean
  /** Do not clean while a BITS/Windows Update download is active. */
  downloadGuard?: boolean
  kind?: 'recycle_bin'
}

export const CATEGORY_RULES: Record<string, CategoryRule> = {
  temp_user: { minAgeHours: 24, leafName: /^(temp|tmp)$/i },
  temp_windows: { minAgeHours: 24, leafName: /^temp$/i },
  windows_update: { minAgeHours: 1, downloadGuard: true },
  delivery_optimization: { minAgeHours: 1, deliveryOptimization: true, downloadGuard: true },
  thumbnail_cache: { patterns: ['thumbcache_*.db', 'iconcache_*.db'], recurse: false },
  error_reports: { minAgeHours: 1 },
  crash_dumps: { minAgeHours: 24 },
  shader_cache: {},
  browser_chrome: { browser: { label: 'Google Chrome', processes: ['chrome'] } },
  browser_edge: { browser: { label: 'Microsoft Edge', processes: ['msedge'] } },
  browser_brave: { browser: { label: 'Brave', processes: ['brave'] } },
  browser_firefox: { browser: { label: 'Mozilla Firefox', processes: ['firefox'] } },
  recycle_bin: { kind: 'recycle_bin' },
  prefetch: { patterns: ['*.pf'], recurse: false },
  recent: { patterns: ['*.lnk'], recurse: false },
  event_logs: { minAgeHours: 24 * 7, patterns: ['*.log', '*.etl'] }
}

// ─── Path helpers (pure, exported for tests) ──────────────────────────────

type Env = Record<string, string | undefined>

function envLookup(env: Env, name: string): string | undefined {
  const upper = name.toUpperCase()
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === upper && env[key]) return env[key]
  }
  return undefined
}

/** Resolve one `%VAR%` (with sensible fallbacks). Returns '' when it cannot be resolved. */
function resolveVariable(env: Env, name: string): string {
  const profile = envLookup(env, 'USERPROFILE')
  switch (name.toUpperCase()) {
    case 'WINDIR':
    case 'SYSTEMROOT':
      return envLookup(env, 'WINDIR') ?? envLookup(env, 'SYSTEMROOT') ?? 'C:\\Windows'
    case 'TEMP':
    case 'TMP':
      return (
        envLookup(env, 'TEMP') ??
        envLookup(env, 'TMP') ??
        (profile ? `${profile}\\AppData\\Local\\Temp` : '')
      )
    case 'APPDATA':
      return envLookup(env, 'APPDATA') ?? (profile ? `${profile}\\AppData\\Roaming` : '')
    case 'LOCALAPPDATA':
      return envLookup(env, 'LOCALAPPDATA') ?? (profile ? `${profile}\\AppData\\Local` : '')
    case 'PROGRAMDATA':
      return envLookup(env, 'PROGRAMDATA') ?? envLookup(env, 'ALLUSERSPROFILE') ?? 'C:\\ProgramData'
    default:
      return envLookup(env, name) ?? ''
  }
}

/** Expand `%VARS%` in a path. Returns '' if any variable cannot be resolved. */
export function expandPath(rawPath: string, env: Env = process.env): string {
  let unresolved = false
  const expanded = rawPath.replace(/%([A-Za-z_]+)%/g, (_m, name: string) => {
    const value = resolveVariable(env, name)
    if (!value) unresolved = true
    return value
  })
  if (unresolved) return ''
  return expanded.replace(/\//g, '\\').replace(/\\+$/, '')
}

function defaultListDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return []
  }
}

function segmentRegex(segment: string): RegExp {
  const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

/**
 * Expand variables and `*` wildcards (one directory level per `*` segment).
 * Only existing sub-folders are returned for wildcard segments.
 */
export function expandCategoryPaths(
  rawPath: string,
  env: Env = process.env,
  listDirs: (dir: string) => string[] = defaultListDirs
): string[] {
  const expanded = expandPath(rawPath, env)
  if (!expanded) return []
  if (!expanded.includes('*')) return [expanded]

  const segments = expanded.split('\\')
  let candidates: string[] = [segments[0]]
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg.includes('*')) {
      candidates = candidates.map((c) => `${c}\\${seg}`)
      continue
    }
    const re = segmentRegex(seg)
    const next: string[] = []
    for (const base of candidates) {
      for (const name of listDirs(`${base}\\`)) {
        if (re.test(name)) next.push(`${base}\\${name}`)
      }
    }
    candidates = next
  }
  return [...new Set(candidates)]
}

/** A root must be an absolute drive path, not a drive root and free of `..` segments. */
export function isRootAcceptable(root: string, rule?: CategoryRule): boolean {
  if (!/^[A-Za-z]:\\/.test(root)) return false
  const segments = root.split('\\').filter(Boolean)
  if (segments.length < 2) return false
  if (segments.includes('..') || segments.includes('.')) return false
  if (rule?.leafName && !rule.leafName.test(segments[segments.length - 1])) return false
  return true
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

interface ScriptOptions {
  roots: string[]
  doDelete: boolean
  minAgeHours: number
  patterns: string[]
  recurse: boolean
  downloadGuard: boolean
}

/**
 * One PowerShell script per category. It walks with .NET enumeration (fast
 * on huge trees), never follows junctions/symlinks, never deletes anything
 * newer than the cutoff, and reports bytes actually deleted.
 */
export function buildCleanupScript(opts: ScriptOptions): string {
  const roots = opts.roots.map(psQuote).join(',')
  const patterns = opts.patterns.map(psQuote).join(',')
  return `
$doDelete = ${opts.doDelete ? '$true' : '$false'}
$recurse = ${opts.recurse ? '$true' : '$false'}
$guard = ${opts.downloadGuard ? '$true' : '$false'}
$roots = @(${roots})
$patterns = @(${patterns})
$cutoff = [long]0
${opts.minAgeHours > 0 ? `$cutoff = [DateTime]::UtcNow.AddHours(-${opts.minAgeHours}).Ticks` : ''}
$reparse = [System.IO.FileAttributes]::ReparsePoint
$size = [long]0; $count = 0; $freed = [long]0; $deleted = 0; $locked = 0; $denied = 0; $busy = 0

if ($guard -and $doDelete) {
  $jobs = @(Get-BitsTransfer -AllUsers -ErrorAction SilentlyContinue | Where-Object { $_.JobState -eq 'Transferring' -or $_.JobState -eq 'Connecting' })
  if ($jobs.Count -gt 0) { $busy = 1 }
}

if ($busy -eq 0) {
  foreach ($r in $roots) {
    if (-not [System.IO.Directory]::Exists($r)) { continue }
    $rootInfo = New-Object System.IO.DirectoryInfo($r)
    if ($rootInfo.Attributes -band $reparse) { continue }
    $stack = New-Object 'System.Collections.Generic.Stack[string]'
    $dirs = New-Object 'System.Collections.Generic.List[string]'
    $dirAge = New-Object 'System.Collections.Generic.List[long]'
    $stack.Push($r)
    while ($stack.Count -gt 0) {
      $d = $stack.Pop()
      $di = New-Object System.IO.DirectoryInfo($d)
      if ($d -ne $r) {
        $dt = $di.LastWriteTimeUtc.Ticks
        $dc = $di.CreationTimeUtc.Ticks
        if ($dc -gt $dt) { $dt = $dc }
        $dirs.Add($d); $dirAge.Add($dt)
      }
      if ($recurse) {
        try {
          foreach ($sub in $di.EnumerateDirectories()) {
            if (-not ($sub.Attributes -band $reparse)) { $stack.Push($sub.FullName) }
          }
        } catch {}
      }
      try {
        foreach ($f in $di.EnumerateFiles()) {
          try {
            if ($f.Attributes -band $reparse) { continue }
            if ($patterns.Count -gt 0) {
              $match = $false
              foreach ($p in $patterns) { if ($f.Name -like $p) { $match = $true; break } }
              if (-not $match) { continue }
            }
            if ($cutoff -gt 0) {
              $t = $f.LastWriteTimeUtc.Ticks
              $c = $f.CreationTimeUtc.Ticks
              if ($c -gt $t) { $t = $c }
              if ($t -gt $cutoff) { continue }
            }
            $len = [long]$f.Length
            $size += $len; $count++
            if ($doDelete) {
              try {
                if ($f.IsReadOnly) { $f.IsReadOnly = $false }
                $f.Delete()
                $freed += $len; $deleted++
              } catch [System.UnauthorizedAccessException] { $denied++ }
              catch { $locked++ }
            }
          } catch {}
        }
      } catch {}
    }
    if ($doDelete -and $recurse -and $patterns.Count -eq 0) {
      for ($i = $dirs.Count - 1; $i -ge 0; $i--) {
        if ($cutoff -gt 0 -and $dirAge[$i] -gt $cutoff) { continue }
        try { [System.IO.Directory]::Delete($dirs[$i], $false) } catch {}
      }
    }
  }
}
[PSCustomObject]@{ Size = $size; Count = $count; Freed = $freed; Deleted = $deleted; Locked = $locked; Denied = $denied; Busy = $busy } | ConvertTo-Json -Compress
`
}

interface ScriptStats {
  size: number
  count: number
  freed: number
  deleted: number
  locked: number
  denied: number
  busy: boolean
}

const MB = 1024 * 1024
const toMB = (bytes: number): number => Math.round((bytes / MB) * 10) / 10

const MEASURE_TIMEOUT_MS = 120_000
const CLEAN_TIMEOUT_MS = 300_000

export class CleanupService {
  constructor(
    private readonly run: PowerShellRunner = runPowerShellResult,
    private readonly listDirs: (dir: string) => string[] = defaultListDirs
  ) {}

  async scan(): Promise<CleanupCategoryScan[]> {
    const win = process.platform === 'win32'
    const running = win ? await this.getRunningProcesses() : new Set<string>()

    const measure = async (cat: BaseCategory): Promise<CleanupCategoryScan> => {
      if (!win) {
        return { ...cat, sizeMB: Math.random() * 500, fileCount: Math.floor(Math.random() * 1000) }
      }
      try {
        const { bytes, fileCount } = await this.measureCategory(cat)
        const blockedReason = this.browserBlock(cat, running)
        return {
          ...cat,
          sizeMB: toMB(bytes),
          fileCount,
          ...(blockedReason ? { blockedReason } : {})
        }
      } catch (err) {
        log.warn(`Cleanup: measuring ${cat.id} failed: ${String(err)}`)
        return { ...cat, sizeMB: 0, fileCount: 0 }
      }
    }

    // Each Windows measurement spawns PowerShell and walks a directory tree.
    // A small pool keeps the scan fast without launching a shell per category.
    const results: CleanupCategoryScan[] = new Array(CLEANUP_CATEGORIES.length)
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

  async clean(categoryIds: string[]): Promise<CleanupRunResult[]> {
    const results: CleanupRunResult[] = []
    const categories = CLEANUP_CATEGORIES.filter((c) => categoryIds.includes(c.id))
    const win = process.platform === 'win32'
    const running: Set<string> | null = win && categories.some((c) => CATEGORY_RULES[c.id]?.browser)
      ? await this.getRunningProcesses()
      : new Set<string>()

    for (const cat of categories) {
      if (!win) {
        results.push({
          categoryId: cat.id,
          freedMB: Math.random() * 200,
          deletedFiles: Math.floor(Math.random() * 500),
          errors: [],
          success: true
        })
        continue
      }
      try {
        results.push(await this.cleanCategory(cat, running))
      } catch (err) {
        log.error(`Cleanup: ${cat.id} failed: ${String(err)}`)
        results.push({
          categoryId: cat.id,
          freedMB: 0,
          deletedFiles: 0,
          errors: [`No se pudo limpiar "${cat.name}".`],
          success: false
        })
      }
    }
    return results
  }

  // ─── Internals ──────────────────────────────────────────────

  /** Resolved, validated roots for a category. `rejected` lists protected ones. */
  private resolveRoots(cat: BaseCategory): { roots: string[]; rejected: string[] } {
    const rule = CATEGORY_RULES[cat.id]
    const roots: string[] = []
    const rejected: string[] = []
    for (const raw of cat.paths) {
      for (const expanded of expandCategoryPaths(raw, process.env, this.listDirs)) {
        if (!isPathSafe(expanded) || !isRootAcceptable(expanded, rule)) {
          rejected.push(expanded)
          continue
        }
        roots.push(expanded)
      }
    }
    return { roots: [...new Set(roots)], rejected }
  }

  /** `running` is null when the process list could not be read: fail closed (never clean an open browser). */
  private browserBlock(cat: BaseCategory, running: Set<string> | null): string | undefined {
    const browser = CATEGORY_RULES[cat.id]?.browser
    if (!browser) return undefined
    if (!running) {
      return `No se pudo comprobar si ${browser.label} está abierto. Ciérralo y vuelve a intentarlo`
    }
    if (browser.processes.some((p) => running.has(p.toLowerCase()))) {
      return `Cierra ${browser.label} para limpiar su caché`
    }
    return undefined
  }

  /** Running process names, or null if they could not be read (a real Windows always has some). */
  private async getRunningProcesses(): Promise<Set<string> | null> {
    try {
      const { stdout } = await this.run(
        'Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique',
        15000
      )
      const names = new Set(
        stdout
          .split(/\r?\n/)
          .map((l) => l.trim().toLowerCase())
          .filter(Boolean)
      )
      return names.size > 0 ? names : null
    } catch {
      return null
    }
  }

  private scriptOptionsFor(cat: BaseCategory, roots: string[], doDelete: boolean): ScriptOptions {
    const rule = CATEGORY_RULES[cat.id] ?? {}
    return {
      roots,
      doDelete,
      minAgeHours: rule.minAgeHours ?? 0,
      patterns: rule.patterns ?? [],
      recurse: rule.recurse !== false,
      downloadGuard: !!rule.downloadGuard
    }
  }

  private async runScript(
    script: string,
    timeoutMs: number
  ): Promise<{ stats: ScriptStats | null; stderr: string }> {
    const { stdout, stderr } = await this.run(script, timeoutMs)
    const line = stdout
      .split(/\r?\n/)
      .reverse()
      .find((l) => l.trim().startsWith('{'))
    if (!line) return { stats: null, stderr }
    try {
      const d = JSON.parse(line) as Record<string, number>
      return {
        stats: {
          size: Number(d.Size ?? 0),
          count: Number(d.Count ?? 0),
          freed: Number(d.Freed ?? 0),
          deleted: Number(d.Deleted ?? 0),
          locked: Number(d.Locked ?? 0),
          denied: Number(d.Denied ?? 0),
          busy: Number(d.Busy ?? 0) > 0
        },
        stderr
      }
    } catch {
      log.warn('Cleanup: could not parse PowerShell output')
      return { stats: null, stderr }
    }
  }

  private async measureCategory(
    cat: BaseCategory
  ): Promise<{ bytes: number; fileCount: number }> {
    if (CATEGORY_RULES[cat.id]?.kind === 'recycle_bin') {
      const rb = await this.measureRecycleBin()
      return { bytes: rb.bytes, fileCount: rb.fileCount }
    }
    const { roots } = this.resolveRoots(cat)
    if (roots.length === 0) return { bytes: 0, fileCount: 0 }
    const { stats } = await this.runScript(
      buildCleanupScript(this.scriptOptionsFor(cat, roots, false)),
      MEASURE_TIMEOUT_MS
    )
    return { bytes: stats?.size ?? 0, fileCount: stats?.count ?? 0 }
  }

  private async cleanCategory(cat: BaseCategory, running: Set<string> | null): Promise<CleanupRunResult> {
    const rule = CATEGORY_RULES[cat.id] ?? {}
    const base = { categoryId: cat.id }

    const blocked = this.browserBlock(cat, running)
    if (blocked) {
      return { ...base, freedMB: 0, deletedFiles: 0, errors: [], success: false, skippedReason: blocked }
    }

    if (rule.kind === 'recycle_bin') return this.cleanRecycleBin(cat)

    const errors: string[] = []
    const { roots, rejected } = this.resolveRoots(cat)
    for (const r of rejected) {
      log.warn(`Cleanup: protected or invalid path skipped: ${r}`)
    }
    if (roots.length === 0) {
      return {
        ...base,
        freedMB: 0,
        deletedFiles: 0,
        errors: rejected.length ? ['Se omitió una ruta protegida.'] : [],
        success: rejected.length === 0,
        empty: rejected.length === 0 ? true : undefined
      }
    }

    let freedBytes = 0
    let deletedFiles = 0
    let locked = 0
    let denied = 0
    let seen = 0

    // Delivery Optimization: let Windows do it first when the cmdlet exists.
    if (rule.deliveryOptimization) {
      const before = await this.runScript(
        buildCleanupScript(this.scriptOptionsFor(cat, roots, false)),
        MEASURE_TIMEOUT_MS
      )
      const { ok, stderr } = await this.run(
        `$jobs = @(Get-BitsTransfer -AllUsers -ErrorAction SilentlyContinue | Where-Object { $_.JobState -eq 'Transferring' -or $_.JobState -eq 'Connecting' })
        if ($jobs.Count -eq 0 -and (Get-Command Delete-DeliveryOptimizationCache -ErrorAction SilentlyContinue)) { Delete-DeliveryOptimizationCache -Force -ErrorAction SilentlyContinue }`,
        60_000
      )
      if (!ok && stderr) log.warn(`Cleanup: Delete-DeliveryOptimizationCache: ${stderr}`)
      const after = await this.runScript(
        buildCleanupScript(this.scriptOptionsFor(cat, roots, false)),
        MEASURE_TIMEOUT_MS
      )
      if (before.stats && after.stats) {
        freedBytes += Math.max(0, before.stats.size - after.stats.size)
        deletedFiles += Math.max(0, before.stats.count - after.stats.count)
        seen += before.stats.count
      }
    }

    const { stats, stderr } = await this.runScript(
      buildCleanupScript(this.scriptOptionsFor(cat, roots, true)),
      CLEAN_TIMEOUT_MS
    )

    if (!stats) {
      log.warn(`Cleanup: ${cat.id} produced no result: ${stderr}`)
      errors.push(`No se pudo completar la limpieza de "${cat.name}". Inténtalo de nuevo.`)
    } else if (stats.busy) {
      return {
        ...base,
        freedMB: toMB(freedBytes),
        deletedFiles,
        errors: [],
        success: false,
        skippedReason: 'Hay una descarga de Windows en curso; inténtalo más tarde'
      }
    } else {
      freedBytes += stats.freed
      deletedFiles += stats.deleted
      locked += stats.locked
      denied += stats.denied
      seen += stats.count
    }

    // Access denied is only reported as "needs admin" when we are not elevated;
    // otherwise those files are simply in use.
    let requiresAdmin = false
    if (denied > 0) {
      if (await this.isElevated()) locked += denied
      else requiresAdmin = true
    }

    return {
      ...base,
      freedMB: toMB(freedBytes),
      deletedFiles,
      errors,
      success: errors.length === 0,
      requiresAdmin: requiresAdmin || undefined,
      lockedFiles: locked || undefined,
      empty: seen === 0 && errors.length === 0 && !requiresAdmin ? true : undefined
    }
  }

  private async isElevated(): Promise<boolean> {
    const { stdout } = await this.run(
      '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)',
      8000
    )
    return stdout.trim().toLowerCase() === 'true'
  }

  private async measureRecycleBin(): Promise<{ bytes: number; fileCount: number }> {
    try {
      const { stdout } = await this.run(
        `
        $shell = New-Object -ComObject Shell.Application
        $bin = $shell.Namespace(0xa)
        $size = [long]0; $count = 0
        foreach ($item in $bin.Items()) { $size += [long]$item.Size; $count++ }
        [PSCustomObject]@{ Size = $size; Count = $count } | ConvertTo-Json -Compress
      `,
        20_000
      )
      const line = stdout.split(/\r?\n/).reverse().find((l) => l.trim().startsWith('{'))
      if (!line) return { bytes: 0, fileCount: 0 }
      const d = JSON.parse(line) as { Size?: number; Count?: number }
      return { bytes: Number(d.Size ?? 0), fileCount: Number(d.Count ?? 0) }
    } catch {
      return { bytes: 0, fileCount: 0 }
    }
  }

  private async cleanRecycleBin(cat: BaseCategory): Promise<CleanupRunResult> {
    const before = await this.measureRecycleBin()
    const { stderr } = await this.run('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', 60_000)
    const after = await this.measureRecycleBin()
    const freed = Math.max(0, before.bytes - after.bytes)
    const deleted = Math.max(0, before.fileCount - after.fileCount)
    const errors: string[] = []
    // An empty bin makes Clear-RecycleBin complain; that is not a problem.
    if (stderr && !/no items|vac[ií]a|empty|no hay/i.test(stderr) && after.fileCount > 0) {
      log.warn(`Cleanup: recycle bin: ${stderr}`)
      errors.push('No se pudo vaciar por completo la Papelera de reciclaje.')
    }
    return {
      categoryId: cat.id,
      freedMB: toMB(freed),
      deletedFiles: deleted,
      errors,
      success: errors.length === 0,
      empty: before.fileCount === 0 && errors.length === 0 ? true : undefined
    }
  }
}
