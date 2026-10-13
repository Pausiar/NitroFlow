import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import log from 'electron-log'
import { runPowerShellResult } from '../utils/powershell'
import type { PowerShellRunner } from '../utils/powershell'
import { describePowerShellError } from '../utils/ps-errors'
import type {
  AppSettings,
  OptimizerApplyResult,
  OptimizerStatus,
  PerformanceMode
} from '../../shared/types'
import { SettingsService } from './settings'

// ─── Constants ──────────────────────────────────────────────────────────────

// GUIDs of the built-in Windows power plans.
export const POWER_PLAN_BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e'
export const POWER_PLAN_HIGH_PERFORMANCE = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
export const POWER_PLAN_ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61'

/** Name given to a High Performance copy created by NitroFlow (so it can be found and removed later). */
export const NITROFLOW_PLAN_NAME = 'NitroFlow - Alto rendimiento'

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PS_GUID_RE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

const ADMIN_ERROR =
  'Ejecuta NitroFlow como administrador para cambiar el modo de rendimiento (clic derecho > "Ejecutar como administrador").'

const VISUAL_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects'
const PROFILE_KEY = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
const GAMES_KEY = `${PROFILE_KEY}\\Tasks\\Games`
const GAMEBAR_KEY = 'HKCU:\\Software\\Microsoft\\GameBar'
const GAMECFG_KEY = 'HKCU:\\System\\GameConfigStore'

type ValueKind = 'DWord' | 'String'

/** Every registry value the optimizer may touch. Restores only ever use these paths. */
const ENTRIES = {
  visualFx: { path: VISUAL_KEY, name: 'VisualFXSetting' },
  systemResponsiveness: { path: PROFILE_KEY, name: 'SystemResponsiveness' },
  networkThrottling: { path: PROFILE_KEY, name: 'NetworkThrottlingIndex' },
  gamesPriority: { path: GAMES_KEY, name: 'Priority' },
  gamesScheduling: { path: GAMES_KEY, name: 'Scheduling Category' },
  gamesSfio: { path: GAMES_KEY, name: 'SFIO Priority' },
  allowAutoGameMode: { path: GAMEBAR_KEY, name: 'AllowAutoGameMode' },
  autoGameModeEnabled: { path: GAMEBAR_KEY, name: 'AutoGameModeEnabled' },
  gameDvr: { path: GAMECFG_KEY, name: 'GameDVR_Enabled' },
  gameDvrFse: { path: GAMECFG_KEY, name: 'GameDVR_FSEBehaviorMode' }
} as const

export type EntryId = keyof typeof ENTRIES
const ENTRY_IDS = Object.keys(ENTRIES) as EntryId[]

export interface SnapshotValue {
  exists: boolean
  kind?: ValueKind | 'ExpandString'
  value?: number | string
}

/** Original state captured before NitroFlow changes anything. */
export interface OptimizerSnapshot {
  version: 1
  createdAt: number
  /** Mode currently applied on top of this snapshot. */
  mode: PerformanceMode
  appliedAt: number
  /** Active power plan before NitroFlow switched it. */
  activeScheme: string | null
  /** Original AC/DC minimum processor state of every existing plan NitroFlow modified. */
  throttle: Record<string, { ac: number | null; dc: number | null }>
  /** Power plan duplicated by NitroFlow (deleted on restore). */
  createdScheme?: string
  values: Partial<Record<EntryId, SnapshotValue>>
  /** Set when the snapshot was rebuilt for a NitroFlow ≤ 1.2 install (no original values known). */
  legacyFrom?: PerformanceMode
}

interface ProbeResult {
  isAdmin: boolean
  isLaptop: boolean
  activeScheme: string | null
  /** Built-in High Performance / Ultimate (or NitroFlow) plan that can be activated; null = must be created. */
  target: string | null
  targetAc: number | null
  targetDc: number | null
  values: Partial<Record<EntryId, SnapshotValue>>
}

/**
 * Values NitroFlow ≤ 1.2 wrote without saving the originals. When we find an
 * old install in a non-balanced mode we restore these Windows defaults
 * instead of the (already modified) current values.
 */
const LEGACY_DEFAULTS: Record<'performance' | 'gaming', Partial<Record<EntryId, SnapshotValue>>> = {
  performance: {
    visualFx: { exists: true, kind: 'DWord', value: 0 },
    systemResponsiveness: { exists: true, kind: 'DWord', value: 20 }
  },
  gaming: {
    visualFx: { exists: true, kind: 'DWord', value: 0 },
    systemResponsiveness: { exists: true, kind: 'DWord', value: 20 },
    networkThrottling: { exists: true, kind: 'DWord', value: 10 },
    gamesPriority: { exists: true, kind: 'DWord', value: 2 },
    gamesScheduling: { exists: true, kind: 'String', value: 'Medium' },
    gamesSfio: { exists: true, kind: 'String', value: 'Normal' },
    gameDvr: { exists: true, kind: 'DWord', value: 1 },
    gameDvrFse: { exists: true, kind: 'DWord', value: 0 }
  }
}

type SettingsLike = { get(): Pick<AppSettings, 'performanceMode'>; save(u: Partial<AppSettings>): void }

export interface OptimizerOptions {
  ps?: PowerShellRunner
  snapshotPath?: string
  settings?: SettingsLike
  now?: () => number
}

interface StepResult {
  ok: boolean
  stdout: string
  error?: string
}

// ─── PowerShell helpers ─────────────────────────────────────────────────────

const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`

const PS_HELPERS = `
function Set-NfValue($path, $name, $kind, $value) {
  if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force -ErrorAction Stop | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -Value $value -PropertyType $kind -Force -ErrorAction Stop | Out-Null
}
function Remove-NfValue($path, $name) {
  $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
  if ($item -and ($item.GetValueNames() -contains $name)) {
    Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction Stop
  }
}
function Invoke-NfPowerCfg {
  $out = & powercfg.exe @args 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw ("powercfg " + ($args -join ' ') + ": " + $out.Trim()) }
  return $out
}
`

/** PowerShell literal for a value of the given kind (validated: snapshot files are user-writable). */
function psValue(kind: string, value: unknown): string | null {
  if (kind === 'DWord') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 4294967295) {
      return null
    }
    // Pass as signed Int32 so Windows PowerShell stores e.g. 0xffffffff correctly.
    return `([int32]${value | 0})`
  }
  if (kind === 'String' || kind === 'ExpandString') {
    return typeof value === 'string' ? psQuote(value) : null
  }
  return null
}

function setValueLine(id: EntryId, kind: string, value: unknown): string {
  const e = ENTRIES[id]
  const lit = psValue(kind, value)
  if (lit === null) return `throw ${psQuote(`${id}: valor no válido`)}`
  return `Set-NfValue ${psQuote(e.path)} ${psQuote(e.name)} ${psQuote(kind)} ${lit}`
}

// ─── Service ────────────────────────────────────────────────────────────────

export class OptimizerService {
  private static instance: OptimizerService

  private readonly ps: PowerShellRunner
  private readonly snapshotPath: string
  private readonly settingsOverride?: SettingsLike
  private readonly now: () => number

  private lastAppliedAt: number | null = null
  private lastWarnings: string[] = []
  private isLaptop: boolean | undefined
  private laptopDetection: Promise<void> | null = null
  private busy = false

  constructor(options: OptimizerOptions = {}) {
    this.ps = options.ps ?? runPowerShellResult
    this.snapshotPath =
      options.snapshotPath ?? path.join(os.homedir(), 'NitroFlow', 'optimizer-snapshot.json')
    this.settingsOverride = options.settings
    this.now = options.now ?? Date.now
  }

  static getInstance(): OptimizerService {
    if (!OptimizerService.instance) {
      OptimizerService.instance = new OptimizerService()
    }
    return OptimizerService.instance
  }

  private get settings(): SettingsLike {
    return this.settingsOverride ?? SettingsService.getInstance()
  }

  getStatus(): OptimizerStatus {
    const currentMode = this.settings.get().performanceMode
    const snapshot = this.readSnapshot()
    if (process.platform === 'win32' && this.isLaptop === undefined) this.detectLaptop()
    return {
      currentMode,
      appliedAt:
        currentMode !== 'balanced' && snapshot ? snapshot.appliedAt : this.lastAppliedAt,
      isLaptop: process.platform === 'win32' ? this.isLaptop : false,
      warnings: [...this.lastWarnings],
      hasSnapshot: snapshot !== null
    }
  }

  async applyMode(mode: PerformanceMode): Promise<OptimizerApplyResult> {
    if (this.busy) {
      return { success: false, error: 'Ya se está aplicando un modo. Espera unos segundos.' }
    }
    this.busy = true
    try {
      if (process.platform !== 'win32') {
        this.settings.save({ performanceMode: mode })
        this.lastAppliedAt = this.now()
        this.lastWarnings = []
        return { success: true }
      }

      const result =
        mode === 'balanced' ? await this.applyBalanced() : await this.applyBoost(mode)

      if (result.success) {
        this.settings.save({ performanceMode: mode })
        this.lastAppliedAt = this.now()
        this.lastWarnings = result.warnings ?? []
        log.info(`OptimizerService: applied mode "${mode}"`, result.warnings ?? [])
      } else {
        log.warn(`OptimizerService: mode "${mode}" not applied: ${result.error}`)
      }
      return result
    } catch (err) {
      log.error('OptimizerService.applyMode error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      this.busy = false
    }
  }

  // ── Performance / Gaming ───────────────────────────────────────────────────

  private async applyBoost(mode: 'performance' | 'gaming'): Promise<OptimizerApplyResult> {
    const probe = await this.probe()
    if ('error' in probe) return { success: false, error: probe.error }
    if (!probe.isAdmin) return { success: false, error: ADMIN_ERROR }

    const warnings: string[] = []
    let snapshot = this.readSnapshot()

    // 1. Save the user's original state BEFORE touching anything.
    if (!snapshot) {
      try {
        snapshot = this.buildSnapshot(probe, mode)
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      if (!this.writeSnapshot(snapshot)) {
        return {
          success: false,
          error: 'No se pudo guardar la copia de tu configuración actual, así que no se ha cambiado nada.'
        }
      }
    }

    // A plan we have not modified before: remember its original CPU values first.
    let canTouchCpu = true
    const target = probe.target
    if (target && !snapshot.throttle[target] && target !== snapshot.createdScheme) {
      snapshot.throttle[target] = { ac: probe.targetAc, dc: probe.targetDc }
      if (probe.targetAc === null || !this.writeSnapshot(snapshot)) {
        delete snapshot.throttle[target]
        canTouchCpu = false
      }
    }

    // 2. Power plan: built-in High Performance (or a NitroFlow copy). Never the user's own plan.
    let activePlan: string | null = null
    const power = await this.step('power', this.powerPlanScript(target), 15000)
    const planMatch = power.stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    if (power.ok && planMatch) {
      activePlan = planMatch[0].toLowerCase()
      if (!target) {
        snapshot.createdScheme = activePlan
        this.writeSnapshot(snapshot)
      }
    } else {
      warnings.push(
        'No se pudo activar el plan de energía de alto rendimiento (tu equipo puede no permitirlo). Se mantiene tu plan actual.'
      )
    }

    // 3. CPU minimum 100 % (AC only) on that plan — not on laptops.
    if (probe.isLaptop) {
      warnings.push(
        'Tu equipo es un portátil: no se fuerza la CPU al 100 % para no gastar batería ni calentarlo de más.'
      )
    } else if (activePlan && canTouchCpu) {
      const cpu = await this.step('cpu', this.cpuScript(activePlan), 10000)
      if (!cpu.ok) warnings.push('No se pudo ajustar el procesador para máximo rendimiento.')
    }

    // 4. Registry tweaks.
    const regSteps: { id: string; script: string; warning: string }[] = [
      {
        id: 'visual',
        script: setValueLine('visualFx', 'DWord', 2),
        warning: 'No se pudieron reducir los efectos visuales.'
      },
      {
        id: 'responsiveness',
        script: setValueLine('systemResponsiveness', 'DWord', 10),
        warning: 'No se pudo dar más prioridad a los programas en primer plano.'
      }
    ]
    if (mode === 'gaming') {
      regSteps.push(
        {
          id: 'network',
          // 0xffffffff disables multimedia network throttling. Restored on "Equilibrado".
          script: setValueLine('networkThrottling', 'DWord', 4294967295),
          warning: 'No se pudo quitar el límite de red para juegos.'
        },
        {
          id: 'games',
          script: [
            setValueLine('gamesPriority', 'DWord', 6),
            setValueLine('gamesScheduling', 'String', 'High'),
            setValueLine('gamesSfio', 'String', 'High')
          ].join('\n'),
          warning: 'No se pudo subir la prioridad de los juegos.'
        },
        {
          id: 'gamemode',
          script: [
            setValueLine('allowAutoGameMode', 'DWord', 1),
            setValueLine('autoGameModeEnabled', 'DWord', 1)
          ].join('\n'),
          warning: 'No se pudo activar el Modo Juego de Windows.'
        },
        {
          id: 'gamedvr',
          script: [setValueLine('gameDvr', 'DWord', 0), setValueLine('gameDvrFse', 'DWord', 2)].join('\n'),
          warning: 'No se pudo desactivar la grabación en segundo plano de Xbox.'
        }
      )
    }

    let regOk = 0
    for (const s of regSteps) {
      const r = await this.step(s.id, s.script, 10000)
      if (r.ok) regOk++
      else warnings.push(s.warning)
    }

    if (!activePlan && regOk === 0) {
      return {
        success: false,
        error: 'No se pudo aplicar ningún cambio. Prueba a ejecutar NitroFlow como administrador.',
        warnings
      }
    }

    snapshot.mode = mode
    snapshot.appliedAt = this.now()
    this.writeSnapshot(snapshot)
    return { success: true, warnings }
  }

  // ── Balanced (restore) ─────────────────────────────────────────────────────

  private async applyBalanced(): Promise<OptimizerApplyResult> {
    const stored = this.readSnapshot()
    const storedMode = this.settings.get().performanceMode
    const legacyMode = !stored && storedMode !== 'balanced' ? storedMode : undefined

    // Nothing to restore: only make sure we are not stuck on a NitroFlow plan.
    if (!stored && !legacyMode) {
      const r = await this.step('power-restore', this.powerRestoreScript(null, {}), 15000)
      const warnings: string[] = []
      if (!r.ok) warnings.push('No se pudo comprobar el plan de energía.')
      await this.step('power-cleanup', this.planCleanupScript(), 15000)
      return { success: true, warnings }
    }

    const probeAdmin = await this.step('admin', ADMIN_CHECK_SCRIPT, 8000)
    if (probeAdmin.ok && probeAdmin.stdout.trim().toLowerCase() === 'false') {
      return { success: false, error: ADMIN_ERROR }
    }

    const snapshot: OptimizerSnapshot =
      stored ?? {
        version: 1,
        createdAt: this.now(),
        mode: legacyMode as PerformanceMode,
        appliedAt: this.now(),
        activeScheme: POWER_PLAN_BALANCED,
        throttle: {},
        values: { ...LEGACY_DEFAULTS[legacyMode as 'performance' | 'gaming'] },
        legacyFrom: legacyMode
      }

    const warnings: string[] = []
    const errors: string[] = []

    const reg = await this.step('restore-registry', this.registryRestoreScript(snapshot), 15000)
    if (!reg.ok) errors.push(`No se pudieron restaurar algunos ajustes: ${reg.error}`)

    const power = await this.step(
      'power-restore',
      this.powerRestoreScript(snapshot.activeScheme, snapshot.throttle),
      20000
    )
    if (!power.ok) errors.push(`No se pudo restaurar tu plan de energía: ${power.error}`)

    const cleanup = await this.step('power-cleanup', this.planCleanupScript(), 15000)
    if (!cleanup.ok) warnings.push('No se pudo eliminar el plan de energía creado por NitroFlow.')

    if (snapshot.legacyFrom === 'gaming') {
      const nagle = await this.step('legacy-nagle', LEGACY_NAGLE_CLEANUP, 15000)
      if (!nagle.ok) warnings.push('No se pudieron limpiar los ajustes de red de versiones anteriores.')
    }

    if (errors.length > 0) {
      // Keep the snapshot so the user can retry; nothing is lost.
      if (!stored) this.writeSnapshot(snapshot)
      return { success: false, error: errors.join(' '), warnings }
    }

    this.deleteSnapshot()
    return { success: true, warnings }
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  private async step(id: string, script: string, timeoutMs: number): Promise<StepResult> {
    try {
      const r = await this.ps(`# NF-STEP: ${id}\n${PS_HELPERS}\n${script}`, timeoutMs)
      if (!r.ok || r.stderr) {
        const error = describePowerShellError(r.stderr || 'Error desconocido')
        log.warn(`OptimizerService step "${id}" failed: ${r.stderr}`)
        return { ok: false, stdout: r.stdout, error }
      }
      return { ok: true, stdout: r.stdout }
    } catch (err) {
      log.warn(`OptimizerService step "${id}" threw:`, err)
      return { ok: false, stdout: '', error: err instanceof Error ? err.message : String(err) }
    }
  }

  private async probe(): Promise<ProbeResult | { error: string }> {
    const r = await this.step('probe', PROBE_SCRIPT, 30000)
    const fail = {
      error: 'No se pudo leer la configuración actual de Windows, así que no se ha cambiado nada.'
    }
    if (!r.ok) {
      if (r.error && /administrador/i.test(r.error)) return { error: ADMIN_ERROR }
      return fail
    }
    try {
      const raw = JSON.parse(r.stdout) as {
        isAdmin?: boolean
        isLaptop?: boolean
        activeScheme?: string | null
        target?: string | null
        targetAc?: number | null
        targetDc?: number | null
        values?: { id: string; exists: boolean; kind?: string | null; value?: number | string | null }[]
      }
      const values: Partial<Record<EntryId, SnapshotValue>> = {}
      const list = Array.isArray(raw.values) ? raw.values : raw.values ? [raw.values] : []
      for (const v of list) {
        if (!ENTRY_IDS.includes(v.id as EntryId)) continue
        values[v.id as EntryId] = v.exists
          ? { exists: true, kind: (v.kind ?? undefined) as SnapshotValue['kind'], value: v.value ?? undefined }
          : { exists: false }
      }
      const guid = (g: unknown): string | null =>
        typeof g === 'string' && GUID_RE.test(g) ? g.toLowerCase() : null
      const num = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null)
      this.isLaptop = raw.isLaptop === true
      return {
        isAdmin: raw.isAdmin === true,
        isLaptop: raw.isLaptop === true,
        activeScheme: guid(raw.activeScheme),
        target: guid(raw.target),
        targetAc: num(raw.targetAc),
        targetDc: num(raw.targetDc),
        values
      }
    } catch (err) {
      log.warn('OptimizerService: invalid probe output', err)
      return fail
    }
  }

  private buildSnapshot(probe: ProbeResult, mode: PerformanceMode): OptimizerSnapshot {
    const values: Partial<Record<EntryId, SnapshotValue>> = {}
    for (const id of ENTRY_IDS) {
      const v = probe.values[id]
      if (!v) throw new Error('No se pudo leer la configuración actual de Windows, así que no se ha cambiado nada.')
      if (v.exists && (!v.kind || psValue(v.kind, v.value) === null)) {
        throw new Error(
          `Un ajuste de Windows (${ENTRIES[id].name}) tiene un formato inesperado; por seguridad no se ha cambiado nada.`
        )
      }
      values[id] = v
    }

    // NitroFlow ≤ 1.2 changed values without keeping the originals: use Windows defaults for those.
    const storedMode = this.settings.get().performanceMode
    const legacyFrom = storedMode !== 'balanced' ? storedMode : undefined
    let activeScheme = probe.activeScheme
    if (legacyFrom) {
      Object.assign(values, LEGACY_DEFAULTS[legacyFrom])
      if (
        !activeScheme ||
        activeScheme === POWER_PLAN_HIGH_PERFORMANCE ||
        activeScheme === POWER_PLAN_ULTIMATE
      ) {
        activeScheme = POWER_PLAN_BALANCED
      }
    }

    const throttle: OptimizerSnapshot['throttle'] = {}
    if (probe.target && probe.targetAc !== null) {
      throttle[probe.target] = { ac: probe.targetAc, dc: probe.targetDc }
    }

    return {
      version: 1,
      createdAt: this.now(),
      mode,
      appliedAt: this.now(),
      activeScheme,
      throttle,
      values,
      ...(legacyFrom ? { legacyFrom } : {})
    }
  }

  private powerPlanScript(target: string | null): string {
    return `
$target = ${psQuote(target ?? '')}
if (-not $target) {
  $out = Invoke-NfPowerCfg /duplicatescheme ${POWER_PLAN_HIGH_PERFORMANCE}
  $m = [regex]::Match($out, '${PS_GUID_RE}')
  if (-not $m.Success) { throw "No se pudo crear el plan de alto rendimiento" }
  $target = $m.Value
  Invoke-NfPowerCfg /changename $target ${psQuote(NITROFLOW_PLAN_NAME)} 'Creado por NitroFlow. Se elimina al volver al modo Equilibrado.' | Out-Null
}
Invoke-NfPowerCfg /setactive $target | Out-Null
Write-Output $target
`
  }

  private cpuScript(plan: string): string {
    return `
Invoke-NfPowerCfg /setacvalueindex ${plan} SUB_PROCESSOR PROCTHROTTLEMIN 100 | Out-Null
Invoke-NfPowerCfg /setactive ${plan} | Out-Null
`
  }

  private registryRestoreScript(snapshot: OptimizerSnapshot): string {
    const lines: string[] = []
    for (const id of ENTRY_IDS) {
      const v = snapshot.values[id]
      if (!v) continue
      const e = ENTRIES[id]
      const action = v.exists
        ? setValueLine(id, v.kind ?? 'DWord', v.value)
        : `Remove-NfValue ${psQuote(e.path)} ${psQuote(e.name)}`
      lines.push(
        `try { ${action} } catch { [Console]::Error.WriteLine(${psQuote(e.name + ': ')} + $_.Exception.Message) }`
      )
    }
    return lines.join('\n')
  }

  /**
   * Switch back to the original plan (or Balanced if it no longer exists / was
   * a NitroFlow plan) and restore the CPU values of plans NitroFlow modified.
   * With `original` null only a NitroFlow plan that is active gets replaced.
   */
  private powerRestoreScript(
    original: string | null,
    throttle: OptimizerSnapshot['throttle']
  ): string {
    const restores: string[] = []
    for (const [guid, t] of Object.entries(throttle)) {
      if (!GUID_RE.test(guid)) continue
      const parts: string[] = []
      if (Number.isInteger(t.ac)) parts.push(`Invoke-NfPowerCfg /setacvalueindex ${guid} SUB_PROCESSOR PROCTHROTTLEMIN ${t.ac} | Out-Null`)
      if (Number.isInteger(t.dc)) parts.push(`Invoke-NfPowerCfg /setdcvalueindex ${guid} SUB_PROCESSOR PROCTHROTTLEMIN ${t.dc} | Out-Null`)
      if (parts.length) restores.push(`if (Test-NfPlan '${guid}') { ${parts.join('; ')} }`)
    }
    const orig = original && GUID_RE.test(original) ? original.toLowerCase() : ''
    return `
$list = (Invoke-NfPowerCfg /list) -split "\\r?\\n"
function Test-NfPlan($g) { return [bool]($list | Where-Object { $_ -match $g }) }
function Test-NfOwnPlan($g) { return [bool]($list | Where-Object { $_ -match $g -and $_ -match 'NitroFlow' }) }
$active = ([regex]::Match((Invoke-NfPowerCfg /getactivescheme), '${PS_GUID_RE}')).Value.ToLower()
$original = '${orig}'
$dest = $null
if ($original) {
  if ((Test-NfPlan $original) -and -not (Test-NfOwnPlan $original)) { $dest = $original } else { $dest = '${POWER_PLAN_BALANCED}' }
} elseif ($active -and (Test-NfOwnPlan $active)) {
  $dest = '${POWER_PLAN_BALANCED}'
}
${restores.join('\n')}
if ($dest) { Invoke-NfPowerCfg /setactive $dest | Out-Null }
elseif ($active) { Invoke-NfPowerCfg /setactive $active | Out-Null }
`
  }

  /** Deletes plans created by NitroFlow, never the active one. */
  private planCleanupScript(): string {
    return `
$active = ([regex]::Match((Invoke-NfPowerCfg /getactivescheme), '${PS_GUID_RE}')).Value.ToLower()
foreach ($line in ((Invoke-NfPowerCfg /list) -split "\\r?\\n")) {
  if ($line -match 'NitroFlow') {
    $m = [regex]::Match($line, '${PS_GUID_RE}')
    if ($m.Success -and $m.Value.ToLower() -ne $active) { Invoke-NfPowerCfg /delete $m.Value | Out-Null }
  }
}
`
  }

  // ── Laptop detection (for the "recommended" badge) ─────────────────────────

  private detectLaptop(): void {
    if (this.laptopDetection) return
    this.laptopDetection = this.ps(
      '@(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue).Count -gt 0',
      10000
    )
      .then((r) => {
        if (r.ok) this.isLaptop = r.stdout.trim().toLowerCase() === 'true'
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.isLaptop === undefined) this.laptopDetection = null
      })
  }

  // ── Snapshot persistence ───────────────────────────────────────────────────

  private readSnapshot(): OptimizerSnapshot | null {
    try {
      if (!fs.existsSync(this.snapshotPath)) return null
      const data = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf-8')) as OptimizerSnapshot
      if (data && data.version === 1 && typeof data.values === 'object' && data.values) {
        return { ...data, throttle: data.throttle ?? {} }
      }
      log.warn('OptimizerService: snapshot has an unknown format, ignoring it')
    } catch (err) {
      log.warn('OptimizerService: could not read snapshot', err)
    }
    return null
  }

  private writeSnapshot(snapshot: OptimizerSnapshot): boolean {
    try {
      fs.mkdirSync(path.dirname(this.snapshotPath), { recursive: true })
      const tmp = `${this.snapshotPath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf-8')
      fs.renameSync(tmp, this.snapshotPath)
      return true
    } catch (err) {
      log.error('OptimizerService: could not save snapshot', err)
      return false
    }
  }

  private deleteSnapshot(): void {
    try {
      if (fs.existsSync(this.snapshotPath)) fs.unlinkSync(this.snapshotPath)
    } catch (err) {
      log.warn('OptimizerService: could not delete snapshot', err)
    }
  }
}

// ─── Static scripts ─────────────────────────────────────────────────────────

const ADMIN_CHECK_SCRIPT =
  '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)'

const PROBE_SCRIPT = `
$guidRe = '${PS_GUID_RE}'
$isAdmin = ${ADMIN_CHECK_SCRIPT}
$isLaptop = @(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue).Count -gt 0
$active = $null
$m = [regex]::Match((powercfg /getactivescheme | Out-String), $guidRe)
if ($m.Success) { $active = $m.Value.ToLower() }
$plans = @()
foreach ($line in (powercfg /list)) {
  $g = [regex]::Match($line, $guidRe)
  if ($g.Success) { $plans += [PSCustomObject]@{ guid = $g.Value.ToLower(); line = $line } }
}
$target = $null
foreach ($cand in @('${POWER_PLAN_HIGH_PERFORMANCE}', '${POWER_PLAN_ULTIMATE}')) {
  if ($plans | Where-Object { $_.guid -eq $cand }) { $target = $cand; break }
}
if (-not $target) {
  $own = $plans | Where-Object { $_.line -match 'NitroFlow' } | Select-Object -First 1
  if ($own) { $target = $own.guid }
}
$ac = $null; $dc = $null
if ($target) {
  $q = [regex]::Matches((powercfg /query $target SUB_PROCESSOR PROCTHROTTLEMIN | Out-String), '0x([0-9a-fA-F]{8})')
  if ($q.Count -ge 2) {
    $ac = [Convert]::ToInt64($q[$q.Count - 2].Groups[1].Value, 16)
    $dc = [Convert]::ToInt64($q[$q.Count - 1].Groups[1].Value, 16)
  }
}
$entries = @(
${ENTRY_IDS.map((id) => `  @{ id = '${id}'; path = ${psQuote(ENTRIES[id].path)}; name = ${psQuote(ENTRIES[id].name)} }`).join(',\n')}
)
$values = @()
foreach ($e in $entries) {
  $exists = $false; $kind = $null; $value = $null
  $item = Get-Item -LiteralPath $e.path -ErrorAction SilentlyContinue
  if ($item -and ($item.GetValueNames() -contains $e.name)) {
    $exists = $true
    $kind = [string]$item.GetValueKind($e.name)
    $raw = $item.GetValue($e.name, $null, 'DoNotExpandEnvironmentNames')
    if ($kind -eq 'DWord') { $value = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int32]$raw), 0) }
    elseif ($kind -eq 'String' -or $kind -eq 'ExpandString') { $value = [string]$raw }
  }
  $values += [PSCustomObject]@{ id = $e.id; exists = $exists; kind = $kind; value = $value }
}
ConvertTo-Json -Compress -Depth 4 -InputObject ([PSCustomObject]@{
  isAdmin = [bool]$isAdmin; isLaptop = [bool]$isLaptop; activeScheme = $active
  target = $target; targetAc = $ac; targetDc = $dc; values = $values
})
`

/**
 * NitroFlow ≤ 1.2 set TcpAckFrequency=1 and TCPNoDelay=1 on every interface in
 * gaming mode, without a backup. Remove them only where both still have that
 * exact value (the pair NitroFlow wrote).
 */
const LEGACY_NAGLE_CLEANUP = `
$path = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'
Get-ChildItem -LiteralPath $path -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
  if ($p -and $p.TcpAckFrequency -eq 1 -and $p.TCPNoDelay -eq 1) {
    Remove-ItemProperty -LiteralPath $_.PSPath -Name TcpAckFrequency -ErrorAction Stop
    Remove-ItemProperty -LiteralPath $_.PSPath -Name TCPNoDelay -ErrorAction Stop
  }
}
`
