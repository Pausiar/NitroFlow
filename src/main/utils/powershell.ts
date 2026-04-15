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
  // PowerShell -EncodedCommand requires UTF-16LE base64
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const { stdout } = await execAsync(
    `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
    { timeout: timeoutMs }
  )
  return stdout.trim()
}
