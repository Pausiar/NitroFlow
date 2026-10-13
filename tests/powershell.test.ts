const execFileMock = jest.fn()
const execMock = jest.fn()
jest.mock('child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
  exec: (...args: unknown[]) => execMock(...args)
}))

import * as fs from 'fs'
import { buildPowerShellArgs, needsScriptFile, runPowerShellResult, sanitizePowerShellStderr } from '../src/main/utils/powershell'
import { buildCleanupScript } from '../src/main/services/cleanup'

/** cmd.exe (used by child_process.exec) rejects command lines longer than this. */
const CMD_EXE_LIMIT = 8191

describe('runPowerShellResult', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    execMock.mockReset()
    execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: (e: unknown, r: unknown) => void) => {
      cb(null, { stdout: ' {"ok":1} \n', stderr: '' })
    })
  })

  it('starts powershell.exe directly (no cmd.exe, so no 8191-character limit)', async () => {
    // The real cleanup script is longer than cmd.exe allows once base64-encoded:
    // this is what made cleaning fail on real Windows.
    const script = buildCleanupScript({
      roots: ['C:\\Users\\ana\\AppData\\Local\\Temp'],
      doDelete: true,
      minAgeHours: 24,
      patterns: [],
      recurse: true,
      downloadGuard: false
    })
    const result = await runPowerShellResult(script, 1000)
    expect(result).toEqual({ stdout: '{"ok":1}', stderr: '', ok: true })
    expect(execMock).not.toHaveBeenCalled()
    const [file, args, opts] = execFileMock.mock.calls[0]
    expect(file).toBe('powershell.exe')
    expect(args).toContain('-EncodedCommand')
    expect((opts as { timeout: number }).timeout).toBe(1000)
    expect(args.join(' ').length).toBeGreaterThan(CMD_EXE_LIMIT)
  })

  it('decodes back to the wrapped script', () => {
    const args = buildPowerShellArgs('Write-Output "ñ"')
    const encoded = args[args.indexOf('-EncodedCommand') + 1]
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe('Write-Output "ñ"')
  })

  it('uses a temporary script file for scripts too long for any command line, and removes it', async () => {
    const huge = `# ${'x'.repeat(40_000)}\nWrite-Output 1`
    expect(needsScriptFile(huge)).toBe(true)
    let seenFile = ''
    execFileMock.mockImplementation((_file: string, args: string[], _opts: unknown, cb: (e: unknown, r: unknown) => void) => {
      seenFile = args[args.indexOf('-File') + 1]
      expect(fs.readFileSync(seenFile, 'utf8')).toContain('Write-Output 1')
      cb(null, { stdout: '1', stderr: '' })
    })
    const result = await runPowerShellResult(huge)
    expect(result.stdout).toBe('1')
    expect(seenFile).not.toBe('')
    expect(fs.existsSync(seenFile)).toBe(false)
  })

  it('never rejects: a failed spawn is reported on stderr', async () => {
    execFileMock.mockImplementation((_f: string, _a: string[], _o: unknown, cb: (e: unknown) => void) => {
      cb(Object.assign(new Error('spawn powershell.exe ENOENT'), { stdout: '', stderr: '' }))
    })
    const result = await runPowerShellResult('Write-Output 1')
    expect(result.ok).toBe(false)
    expect(result.stderr).toMatch(/ENOENT/)
  })
})

describe('sanitizePowerShellStderr', () => {
  const PROGRESS =
    '#< CLIXML\r\n<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" RefId="0"><TN RefId="0"><T>System.Management.Automation.PSCustomObject</T><T>System.Object</T></TN><MS><I64 N="SourceId">1</I64><PR N="Record"><AV>Preparing modules for first use.</AV><AI>0</AI><Nil /><PI>-1</PI><PC>-1</PC><T>Completed</T><SR>-1</SR><SD> </SD></PR></MS></Obj></Objs>'

  it('drops progress-only CLIXML (not an error)', () => {
    expect(sanitizePowerShellStderr(PROGRESS)).toBe('')
  })

  it('keeps real error records as readable text', () => {
    const err =
      '#< CLIXML\r\n<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" RefId="0"><MS /></Obj><S S="Error">Access is denied &amp; more_x000D__x000A_</S><S S="Error">second line_x000D__x000A_</S></Objs>'
    expect(sanitizePowerShellStderr(err)).toBe('Access is denied & more\r\nsecond line')
  })

  it('keeps plain stderr text untouched (and next to CLIXML)', () => {
    expect(sanitizePowerShellStderr('  boom  ')).toBe('boom')
    expect(sanitizePowerShellStderr(`${PROGRESS}\nThe command failed`)).toBe('The command failed')
    expect(sanitizePowerShellStderr('')).toBe('')
  })

  it('makes a run with only progress noise ok', async () => {
    execFileMock.mockImplementation((_f: string, _a: string[], _o: unknown, cb: (e: unknown, r: unknown) => void) => {
      cb(null, { stdout: 'True', stderr: PROGRESS })
    })
    const result = await runPowerShellResult('Write-Output $true')
    expect(result).toEqual({ stdout: 'True', stderr: '', ok: true })
  })

  it('silences the progress stream in every script', () => {
    let seen = ''
    execFileMock.mockImplementation((_f: string, args: string[], _o: unknown, cb: (e: unknown, r: unknown) => void) => {
      seen = Buffer.from(args[args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le')
      cb(null, { stdout: '', stderr: '' })
    })
    return runPowerShellResult('Write-Output 1').then(() => {
      expect(seen.split('\n')[0]).toBe("$ProgressPreference = 'SilentlyContinue'")
    })
  })
})
