import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Execute a PowerShell script safely by base64-encoding it with
 * `-EncodedCommand`, completely avoiding shell-injection risks from
 * inline string escaping.
 */
export async function runPowerShell(
  script: string,
  timeoutMs = 15000
): Promise<string> {
  // Force UTF-8 output so accented characters are not garbled
  const fullScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}`
  // PowerShell -EncodedCommand requires UTF-16LE base64
  const encoded = Buffer.from(fullScript, 'utf16le').toString('base64')
  const { stdout } = await execAsync(
    `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
    { timeout: timeoutMs, encoding: 'utf8' }
  )
  return stdout.trim()
}
