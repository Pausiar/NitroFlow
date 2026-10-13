import { execFile } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Longest command line we pass to `CreateProcess` (hard limit: 32 767 chars).
 * Longer scripts are written to a temporary .ps1 file instead.
 */
const MAX_COMMAND_LINE = 30_000

/**
 * Arguments used to run `fullScript`. Exported for tests.
 *
 * `child_process.exec` goes through `cmd.exe`, whose command line is limited
 * to 8 191 characters: a base64 `-EncodedCommand` of a ~3 KB script already
 * exceeds it ("The command line is too long."), so the cleanup and optimizer
 * scripts silently produced no output on real Windows. `execFile` starts
 * powershell.exe directly (no cmd.exe), and very long scripts go through a file.
 */
export function buildPowerShellArgs(fullScript: string, scriptFile?: string): string[] {
  const base = ['-NoProfile', '-NonInteractive']
  if (scriptFile) return [...base, '-ExecutionPolicy', 'Bypass', '-File', scriptFile]
  // PowerShell -EncodedCommand requires UTF-16LE base64
  const encoded = Buffer.from(fullScript, 'utf16le').toString('base64')
  return [...base, '-EncodedCommand', encoded]
}

/** True when the encoded command would not fit on a Windows command line. */
export function needsScriptFile(fullScript: string): boolean {
  return buildPowerShellArgs(fullScript).join(' ').length + 'powershell.exe '.length > MAX_COMMAND_LINE
}

export interface PowerShellResult {
  stdout: string
  stderr: string
  /** True when the script ran without a terminating PowerShell error. */
  ok: boolean
}

/** Signature of {@link runPowerShellResult}; services accept it so tests can inject a fake. */
export type PowerShellRunner = (script: string, timeoutMs?: number) => Promise<PowerShellResult>

/**
 * Run a PowerShell script and always resolve (never reject) with the
 * captured stdout/stderr. The user script is wrapped so that:
 *  - output is forced to UTF-8 (accented characters are not garbled),
 *  - non-terminating errors do not abort the script (`SilentlyContinue`),
 *  - terminating errors are caught and reported on stderr instead of
 *    crashing the host process with a non-zero exit code,
 *  - the host always exits 0 so `child_process.exec` does not reject.
 *
 * The script is base64-encoded with `-EncodedCommand` and powershell.exe is
 * started without a shell, which avoids injection and quoting problems.
 */
export async function runPowerShellResult(
  script: string,
  timeoutMs = 15000
): Promise<PowerShellResult> {
  const fullScript = [
    // Progress records ("Preparing modules for first use.") are otherwise
    // serialized as CLIXML on the redirected stderr and look like errors.
    "$ProgressPreference = 'SilentlyContinue'",
    '$ErrorActionPreference = "SilentlyContinue"',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'try {',
    script,
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '}',
    'exit 0'
  ].join('\n')

  let scriptFile: string | undefined
  try {
    if (needsScriptFile(fullScript)) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nitroflow-ps-'))
      scriptFile = path.join(dir, 'script.ps1')
      // UTF-8 with BOM so Windows PowerShell 5.1 reads accented characters correctly.
      fs.writeFileSync(scriptFile, '\ufeff' + fullScript, 'utf8')
    }
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      buildPowerShellArgs(fullScript, scriptFile),
      { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1024 * 1024 * 16, windowsHide: true }
    )
    const cleanErr = sanitizePowerShellStderr(stderr)
    return { stdout: stdout.trim(), stderr: cleanErr, ok: cleanErr.length === 0 }
  } catch (err) {
    // Reaches here on timeout / spawn failure. Surface a clean message.
    const anyErr = err as { stdout?: string; stderr?: string; message?: string }
    return {
      stdout: (anyErr.stdout ?? '').trim(),
      stderr: (
        sanitizePowerShellStderr(anyErr.stderr ?? '') ||
        anyErr.message ||
        'PowerShell execution failed'
      ).trim(),
      ok: false
    }
  } finally {
    if (scriptFile) {
      try {
        fs.rmSync(path.dirname(scriptFile), { recursive: true, force: true })
      } catch {
        // A leftover temp script is harmless.
      }
    }
  }
}

/** Decodes the `_xHHHH_` escapes and XML entities used inside CLIXML strings. */
function decodeClixmlString(text: string): string {
  return text
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * When stderr is redirected, Windows PowerShell 5.1 writes non-output streams
 * as CLIXML (`#< CLIXML` + `<Objs>...</Objs>`), including harmless progress
 * records such as "Preparing modules for first use.". Those must not count as
 * errors. This keeps any plain text, turns real error records
 * (`<S S="Error">`) back into readable text and drops everything else.
 */
export function sanitizePowerShellStderr(stderr: string): string {
  if (!stderr || !stderr.includes('#< CLIXML')) return (stderr ?? '').trim()
  const parts: string[] = []
  const withoutBlocks = stderr.replace(/#< CLIXML\s*(<Objs[\s\S]*?<\/Objs>)?/g, (_m, objs?: string) => {
    if (objs) {
      for (const m of objs.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)) {
        parts.push(decodeClixmlString(m[1]))
      }
    }
    return ''
  })
  const errors = parts.join('').trim()
  return [withoutBlocks.trim(), errors].filter(Boolean).join('\n').trim()
}

/**
 * Convenience wrapper that returns only stdout (backwards compatible).
 * Use {@link runPowerShellResult} when you need to inspect stderr.
 */
export async function runPowerShell(script: string, timeoutMs = 15000): Promise<string> {
  const { stdout } = await runPowerShellResult(script, timeoutMs)
  return stdout
}

/**
 * Returns true if the current process is running with elevated
 * (Administrator) privileges on Windows.
 */
export async function isElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  const { stdout } = await runPowerShellResult(
    '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)',
    8000
  )
  return stdout.trim().toLowerCase() === 'true'
}
