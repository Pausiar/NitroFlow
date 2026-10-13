import log from 'electron-log'
import { runPowerShellResult } from '../utils/powershell'
import type { PowerShellRunner } from '../utils/powershell'
import type { RestorePointResult } from '../../shared/types'

/** Creating a restore point takes a VSS snapshot: it can easily need a minute or more. */
const RESTORE_POINT_TIMEOUT_MS = 120_000
/** Windows rejects longer descriptions. */
const MAX_DESCRIPTION_LENGTH = 200

export const RESTORE_POINT_MESSAGES = {
  created: 'Punto de restauración creado. Si algo no va bien, puedes volver atrás desde "Restaurar sistema" de Windows.',
  skipped: 'Ya existe un punto de restauración reciente (de las últimas 24 horas), así que tu PC sigue protegido.',
  disabled:
    'La "Protección del sistema" de Windows está desactivada, así que no se pudo crear un punto de restauración. ' +
    'Puedes activarla en Panel de control > Sistema > Protección del sistema.',
  admin: 'No se pudo crear el punto de restauración: NitroFlow necesita permisos de administrador.',
  demo: 'Punto de restauración creado (modo demostración).'
} as const

interface CheckpointOutput {
  srEnabled?: boolean
  before?: number
  after?: number
  warning?: string
  error?: string
}

/**
 * Creates Windows System Restore points before NitroFlow changes the system.
 *
 * It never turns System Restore on by itself: if the user (or the PC maker)
 * disabled it, that is reported as a failure so callers can fall back to
 * fixes that do not need it.
 */
export class RestorePointService {
  /** `ps` is injectable so the service can be tested without PowerShell. */
  constructor(private readonly ps: PowerShellRunner = runPowerShellResult) {}

  async create(description = 'NitroFlow'): Promise<RestorePointResult> {
    if (process.platform !== 'win32') {
      return { success: true, message: RESTORE_POINT_MESSAGES.demo }
    }

    const safeDescription = sanitizeDescription(description)

    // Windows only allows one restore point every 24 h (by default) and then
    // just writes a warning, so the newest sequence number is compared
    // before and after to know whether a point was really created.
    const script = `
      $out = @{ srEnabled = $true; before = -1; after = -1; warning = ''; error = '' }
      try {
        $cfg = Get-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' -ErrorAction Stop
        if ($cfg.RPSessionInterval -eq 0) { $out.srEnabled = $false }
        if ($cfg.DisableSR -eq 1) { $out.srEnabled = $false }
      } catch { }
      if ($out.srEnabled) {
        $last = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber -Descending | Select-Object -First 1
        if ($last) { $out.before = [int]$last.SequenceNumber }
        try {
          Checkpoint-Computer -Description '${safeDescription}' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop -WarningAction SilentlyContinue -WarningVariable cpWarn
          $out.warning = (@($cpWarn) | ForEach-Object { [string]$_ }) -join ' '
        } catch {
          $out.error = [string]$_.Exception.Message
        }
        $last = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber -Descending | Select-Object -First 1
        if ($last) { $out.after = [int]$last.SequenceNumber }
      }
      $out | ConvertTo-Json -Compress
    `

    try {
      const { stdout, stderr } = await this.ps(script, RESTORE_POINT_TIMEOUT_MS)
      const parsed = parseOutput(stdout)
      if (!parsed) {
        log.warn('RestorePointService: unexpected output', stdout, stderr)
        return { success: false, message: describeFailure(stderr) }
      }
      return interpret(parsed)
    } catch (err) {
      log.error('RestorePointService.create error:', err)
      return { success: false, message: describeFailure(String(err)) }
    }
  }
}

/** Keeps the description short and safe to embed in a single-quoted PowerShell string. */
function sanitizeDescription(description: string): string {
  const clean = String(description ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION_LENGTH)
  return (clean || 'NitroFlow').replace(/'/g, "''")
}

function parseOutput(stdout: string): CheckpointOutput | null {
  const text = stdout.trim()
  if (!text) return null
  // Ignore anything printed before the JSON object.
  const start = text.lastIndexOf('{')
  if (start < 0) return null
  try {
    const raw = JSON.parse(text.slice(start)) as unknown
    return typeof raw === 'object' && raw !== null ? (raw as CheckpointOutput) : null
  } catch {
    return null
  }
}

const RECENT_POINT_RE = /1440|24 ?h|already been created|ya se ha creado|ya se cre/i
const DISABLED_RE = /disabled|deshabilitad|desactivad|0x80042306|0x81000106/i
const ACCESS_RE = /access.*denied|acceso.*denegado|UnauthorizedAccess|PermissionDenied|administrador|administrator/i

function interpret(out: CheckpointOutput): RestorePointResult {
  if (out.srEnabled === false) {
    return { success: false, message: RESTORE_POINT_MESSAGES.disabled }
  }

  const error = String(out.error ?? '')
  const warning = String(out.warning ?? '')
  const before = typeof out.before === 'number' ? out.before : -1
  const after = typeof out.after === 'number' ? out.after : -1

  if (error) {
    if (RECENT_POINT_RE.test(error)) return { success: true, skipped: true, message: RESTORE_POINT_MESSAGES.skipped }
    if (ACCESS_RE.test(error)) return { success: false, message: RESTORE_POINT_MESSAGES.admin }
    if (DISABLED_RE.test(error)) return { success: false, message: RESTORE_POINT_MESSAGES.disabled }
    return { success: false, message: describeFailure(error) }
  }

  if (after > before) {
    return { success: true, message: RESTORE_POINT_MESSAGES.created }
  }
  // No new point but an existing one is still there (or Windows says so
  // explicitly): it refused because one was created recently. Any other
  // warning with no point at all must NOT be reported as "still protected".
  if ((before >= 0 && after === before) || RECENT_POINT_RE.test(warning)) {
    return { success: true, skipped: true, message: RESTORE_POINT_MESSAGES.skipped }
  }
  if (warning) {
    log.warn('RestorePointService: no restore point created:', warning)
    if (DISABLED_RE.test(warning)) return { success: false, message: RESTORE_POINT_MESSAGES.disabled }
    return { success: false, message: describeFailure(warning) }
  }
  return {
    success: false,
    message: 'No se pudo confirmar que el punto de restauración se haya creado.'
  }
}

function describeFailure(detail: string): string {
  if (ACCESS_RE.test(detail)) return RESTORE_POINT_MESSAGES.admin
  if (/timed out|timeout|ETIMEDOUT|killed/i.test(detail)) {
    return 'Windows tardó demasiado en crear el punto de restauración. Inténtalo de nuevo más tarde.'
  }
  const firstLine = detail.split(/\r?\n/).find((l) => l.trim().length > 0)
  return firstLine
    ? `No se pudo crear el punto de restauración: ${firstLine.trim().slice(0, 160)}`
    : 'No se pudo crear el punto de restauración.'
}
