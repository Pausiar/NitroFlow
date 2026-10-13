import { classifyStartupEntry } from '../src/main/services/startup-knowledge'

describe('classifyStartupEntry', () => {
  const disable: Array<[string, string]> = [
    ['Spotify', 'C:\\Users\\a\\AppData\\Roaming\\Spotify\\Spotify.exe /background'],
    ['Discord', 'C:\\Users\\a\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe'],
    ['Steam', '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent'],
    ['EpicGamesLauncher', 'C:\\Program Files (x86)\\Epic Games\\Launcher\\EpicGamesLauncher.exe'],
    ['Battle.net', 'C:\\Program Files (x86)\\Battle.net\\Battle.net Launcher.exe'],
    ['com.squirrel.Teams.Teams', 'C:\\Users\\a\\AppData\\Local\\Microsoft\\Teams\\Update.exe --processStart "Teams.exe"'],
    ['MicrosoftEdgeAutoLaunch_ABC', '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --no-startup-window'],
    ['Adobe Creative Cloud', 'C:\\Program Files\\Adobe\\Adobe Creative Cloud\\ACC\\Creative Cloud.exe'],
    ['SunJavaUpdateSched', 'C:\\Program Files\\Java\\jre\\bin\\jusched.exe'],
    ['iTunesHelper', 'C:\\Program Files\\iTunes\\iTunesHelper.exe'],
    ['qBittorrent', 'C:\\Program Files\\qBittorrent\\qbittorrent.exe'],
    ['Zoom', 'C:\\Users\\a\\AppData\\Roaming\\Zoom\\bin\\Zoom.exe']
  ]
  it.each(disable)('recommends disabling %s', (name, cmd) => {
    const r = classifyStartupEntry(name, cmd)
    expect(r.recommendation).toBe('disable')
    expect(r.essential).toBe(false)
    expect(r.reason.length).toBeGreaterThan(10)
  })

  const essential: Array<[string, string]> = [
    ['SecurityHealth', 'C:\\Windows\\system32\\SecurityHealthSystray.exe'],
    ['Windows Defender', '"C:\\Program Files\\Windows Defender\\MSASCuiL.exe"'],
    ['RtkAudUService', 'C:\\Windows\\System32\\DriverStore\\RtkAudUService64.exe -background'],
    ['SynTPEnh', 'C:\\Program Files\\Synaptics\\SynTP\\SynTPEnh.exe'],
    ['IgfxTray', 'C:\\Windows\\System32\\igfxtray.exe'],
    ['NvContainer', 'C:\\Program Files\\NVIDIA Corporation\\Display.NvContainer\\NVDisplay.Container.exe'],
    ['Malwarebytes', 'C:\\Program Files\\Malwarebytes\\Anti-Malware\\mbam.exe'],
    ['AVG', 'C:\\Program Files\\AVG\\Antivirus\\AVGUI.exe']
  ]
  it.each(essential)('marks %s as essential/keep', (name, cmd) => {
    const r = classifyStartupEntry(name, cmd)
    expect(r.recommendation).toBe('keep')
    expect(r.essential).toBe(true)
  })

  it('keeps cloud sync and password managers, but not as essential', () => {
    for (const [n, c] of [
      ['OneDrive', 'C:\\Users\\a\\OneDrive.exe /background'],
      ['Dropbox', 'C:\\Program Files\\Dropbox\\Client\\Dropbox.exe'],
      ['Bitwarden', 'C:\\Program Files\\Bitwarden\\Bitwarden.exe']
    ]) {
      const r = classifyStartupEntry(n, c)
      expect(r.recommendation).toBe('keep')
      expect(r.essential).toBe(false)
    }
  })

  it('treats unknown programs as optional with a cautious reason', () => {
    const r = classifyStartupEntry('MyWeirdTool', 'C:\\tools\\weird.exe')
    expect(r).toMatchObject({
      recommendation: 'optional',
      essential: false,
      reason: 'Programa no reconocido: desactívalo solo si sabes qué es.'
    })
  })

  it('is case-insensitive and tolerates empty input', () => {
    expect(classifyStartupEntry('SPOTIFY', '').recommendation).toBe('disable')
    expect(classifyStartupEntry('', '').recommendation).toBe('optional')
  })

  it('never classifies an essential item as disable', () => {
    const r = classifyStartupEntry('SecurityHealth', 'C:\\x\\discord.exe')
    expect(r.essential).toBe(true)
  })

  it('keeps browser updaters (security patches)', () => {
    expect(classifyStartupEntry('GoogleUpdate', 'C:\\GoogleUpdate.exe /c').recommendation).toBe('keep')
    expect(classifyStartupEntry('MicrosoftEdgeUpdate', 'C:\\MicrosoftEdgeUpdate.exe').recommendation).toBe('keep')
  })
})
