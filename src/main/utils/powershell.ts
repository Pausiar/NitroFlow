import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface PowerShellResult {
  stdout: string
  stderr: string
  /** True when the script ran without a terminating PowerShell error. */
  ok: boolean
}

/**
 * Run a PowerShell script and always resolve (never reject) with the
 * captured stdout/stderr. The user script is wrapped so that:
 *  - output is forced to UTF-8 (accented characters are not garbled),
 *  - non-terminating errors do not abort the script (`SilentlyContinue`),
 *  - terminating errors are caught and reported on stderr instead of
 *    crashing the host process with a non-zero exit code,
 *  - the host always exits 0 so `child_process.exec` does not reject.
 *
 * The script is base64-encoded with `-EncodedCommand`, which avoids
 * shell-injection and quoting problems from inline string escaping.
 */
export async function runPowerShellResult(
  script: string,
  timeoutMs = 15000
): Promise<PowerShellResult> {
  const fullScript = [
    '$ErrorActionPreference = "SilentlyContinue"',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'try {',
    script,
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '}',
    'exit 0'
  ].join('\n')

  // PowerShell -EncodedCommand requires UTF-16LE base64
  const encoded = Buffer.from(fullScript, 'utf16le').toString('base64')

  try {
    const { stdout, stderr } = await execAsync(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 }
    )
    return { stdout: stdout.trim(), stderr: stderr.trim(), ok: stderr.trim().length === 0 }
  } catch (err) {
    // Reaches here on timeout / spawn failure. Surface a clean message.
    const anyErr = err as { stdout?: string; stderr?: string; message?: string }
    return {
      stdout: (anyErr.stdout ?? '').trim(),
      stderr: (anyErr.stderr ?? anyErr.message ?? 'PowerShell execution failed').trim(),
      ok: false
    }
  }
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
