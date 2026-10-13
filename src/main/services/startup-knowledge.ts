import type { StartupEntry, StartupRecommendation } from '../../shared/types'

/**
 * Curated knowledge about programs that start with Windows. Matched against
 * the entry name + command line (case-insensitive). The goal is advice a
 * non-expert can follow without fear of breaking Windows:
 *  - essential: security software and hardware drivers/utilities (never disabled),
 *  - disable: apps that keep working when opened by hand,
 *  - keep: useful background services (sync, password managers),
 *  - optional: anything unknown (the user decides).
 */
export interface StartupClassification {
  recommendation: StartupRecommendation
  reason: string
  essential: boolean
  /** Rough resource cost of having the app open at startup, when known. */
  impactHint?: StartupEntry['impact']
}

interface Rule {
  pattern: RegExp
  recommendation: StartupRecommendation
  reason: string
  essential?: boolean
  impactHint?: StartupEntry['impact']
}

const WHEN_NEEDED =
  'Se abre sola al encender el PC y consume memoria; puedes abrirla cuando la necesites.'
const UPDATER =
  'Es un actualizador que se ejecuta al encender el PC. El programa sigue funcionando y se actualiza al abrirlo.'
const SECURITY = 'Protege tu PC contra virus y amenazas. Desactivarlo te dejaría sin protección.'
const DRIVER =
  'Es parte de los controladores de tu equipo (audio, panel táctil, gráficos…). Desactivarlo puede dejar funciones sin funcionar.'
const SYNC =
  'Mantiene tus archivos sincronizados y con copia en la nube. Si lo desactivas, dejarán de sincronizarse hasta que lo abras tú.'
const PASSWORDS =
  'Gestor de contraseñas: conviene dejarlo para que el autocompletado funcione al iniciar sesión.'

/** Order matters: the first matching rule wins, so specific rules go first. */
const RULES: Rule[] = [
  // ── Optional vendor utilities (not drivers; user's choice) ─────────────
  {
    pattern: /geforce experience|nvbackend|nvidia share|nvidia overlay/,
    recommendation: 'optional',
    reason:
      'Sirve para actualizar controladores y grabar partidas. Los gráficos funcionan igual sin él; déjalo solo si lo usas.',
    impactHint: 'Medium'
  },
  {
    pattern: /logitech|lghub|lcore|razer|synapse3?|corsair|icue|steelseries|msi ?center|armoury ?crate|asus ?aura/,
    recommendation: 'optional',
    reason:
      'Controla luces, perfiles o botones extra de tu periférico. Si los usas, déjalo; si no, puedes desactivarlo (el ratón/teclado siguen funcionando).',
    impactHint: 'Medium'
  },

  // ── Essential: security ───────────────────────────────────────────────
  {
    pattern:
      /securityhealth|windows security|windows defender|windowsdefender|\bdefender\b|msmpeng|msascui|malwarebytes|\bmbam|\bavast|\bavgui|\bavg\b|kaspersky|\bavp\.exe|\beset\b|\begui\b|norton|bitdefender|\bbdagent|mcafee|sophos|webroot|trend ?micro|f-secure|avira|\bpanda\b|comodo/,
    recommendation: 'keep',
    reason: SECURITY,
    essential: true
  },

  // ── Essential: drivers & hardware utilities ───────────────────────────
  {
    pattern:
      /realtek|\brtk[a-z]*|rtkauduservice|\brav(?:bg|cpl)\d*|waves ?maxx|nahimic|dolby|conexant|idt audio|smartaudio/,
    recommendation: 'keep',
    reason: DRIVER,
    essential: true
  },
  {
    pattern: /synaptics|\bsyntp|\belan\b|etdctrl|elantech|touchpad|alps pointing/,
    recommendation: 'keep',
    reason: DRIVER,
    essential: true
  },
  {
    pattern:
      /\bigfx\w*|hkcmd|intel(?:\(r\))? (?:hd |uhd |iris |arc )?graphics|\bigcc\b|rapid storage|\birst\w*|intel.{0,20}bluetooth|intel.{0,20}wireless|proset/,
    recommendation: 'keep',
    reason: DRIVER,
    essential: true
  },
  {
    pattern: /nvcontainer|nvdisplay|nvidia display|\bnvtray|\bnvcpl|nvidia control panel/,
    recommendation: 'keep',
    reason: DRIVER,
    essential: true
  },
  {
    pattern: /radeon ?software|amdrs\w*|amd external events|atieclxx|\bcnext\b|\bamdow\b/,
    recommendation: 'keep',
    reason: DRIVER,
    essential: true
  },
  {
    pattern: /bluetooth|\bbttray|\bbtmshellex/,
    recommendation: 'keep',
    reason: DRIVER,
    essential: true
  },
  // Input methods & accessibility
  {
    pattern: /\bctfmon|\bchsime|\bimejp|\bimekr|\bime\b|pinyin|narrator|magnify|\bosk\.exe|utilman/,
    recommendation: 'keep',
    reason:
      'Necesario para escribir en otros idiomas o para las funciones de accesibilidad de Windows.',
    essential: true
  },

  // ── Keep (not essential) ──────────────────────────────────────────────
  {
    pattern: /onedrive/,
    recommendation: 'keep',
    reason: SYNC,
    impactHint: 'Medium'
  },
  {
    pattern: /dropbox|googledrivefs|google ?drive|icloud(?:drive|services)?|\bmega ?sync|\bmegasync/,
    recommendation: 'keep',
    reason: SYNC,
    impactHint: 'Medium'
  },
  {
    pattern: /1password|bitwarden|lastpass|keepass|dashlane|roboform|nordpass/,
    recommendation: 'keep',
    reason: PASSWORDS
  },

  // Browser updaters ship security patches: never suggest turning them off.
  {
    pattern: /microsoftedgeupdate|edgeupdate|googleupdate|google update|brave.{0,12}update/,
    recommendation: 'keep',
    reason:
      'Mantiene tu navegador al día con parches de seguridad. Consume muy poco; mejor dejarlo activo.',
    impactHint: 'Low'
  },

  // ── Safe to disable ───────────────────────────────────────────────────
  {
    pattern: /microsoftedgeautolaunch|msedge.*--no-startup-window/,
    recommendation: 'disable',
    reason:
      'Mantiene Microsoft Edge precargado en segundo plano. Edge se abre igual de bien cuando lo necesites.',
    impactHint: 'Medium'
  },
  {
    pattern: /googlechromeautolaunch|brave.{0,12}autolaunch/,
    recommendation: 'disable',
    reason:
      'Mantiene el navegador precargado en segundo plano. Se abre igual de bien cuando lo necesites.',
    impactHint: 'Medium'
  },
  {
    pattern: /opera ?gx|opera ?browser ?assistant|operaautolaunch|\bopera\b/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /spotify/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'High'
  },
  {
    pattern: /discord/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'High'
  },
  {
    pattern: /\bsteam(?:webhelper|service)?\b/,
    recommendation: 'disable',
    reason: 'Steam se abre sola al encender el PC; puedes abrirla cuando vayas a jugar.',
    impactHint: 'Medium'
  },
  {
    pattern: /epic ?games ?launcher|epicgameslauncher|epicwebhelper/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /eadesktop|\bea app\b|\bea desktop\b|ealauncher|\borigin(?:thinsetup|webhelperservice|client)?\.exe|\borigin\b/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /ubisoft|\bupc\.exe|uplay/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /battle\.net|blizzard|\bbattlenet/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /gog ?galaxy|galaxyclient|rockstar games launcher/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /msteams|ms-teams|\bteams\b|microsoft teams/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'High'
  },
  {
    pattern: /skype/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'High'
  },
  {
    pattern: /\bzoom\b|zoom\.exe|zoomopener/,
    recommendation: 'disable',
    reason: 'Zoom se abre al unirte a una reunión; no hace falta que arranque con Windows.',
    impactHint: 'Medium'
  },
  {
    pattern: /whatsapp/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /telegram/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /\bslack\b/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'High'
  },
  {
    pattern: /messenger/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'Medium'
  },
  {
    pattern: /overwolf/,
    recommendation: 'disable',
    reason: WHEN_NEEDED,
    impactHint: 'High'
  },
  {
    pattern: /adobe.{0,20}(?:creative cloud|updater|gcinvoker|aamupdater|arm)|creative cloud|ccxprocess|adobearm|armsvc|acrotray|adobegcinvoker|aamupdatenotifier/,
    recommendation: 'disable',
    reason: UPDATER,
    impactHint: 'Medium'
  },
  {
    pattern: /ccleaner/,
    recommendation: 'disable',
    reason: 'CCleaner se queda activo vigilando el PC. Puedes abrirlo tú cuando quieras limpiar.',
    impactHint: 'Medium'
  },
  {
    pattern: /cortana/,
    recommendation: 'disable',
    reason: 'Asistente de Windows que casi nadie usa; no afecta al funcionamiento del sistema.',
    impactHint: 'Medium'
  },
  {
    pattern: /ituneshelper|itunes|quicktime|applesoftwareupdate|\bapplemobiledevice/,
    recommendation: 'disable',
    reason:
      'Solo sirve para detectar tu iPhone/iPod al conectarlo. iTunes lo activa por sí solo cuando lo abres.',
    impactHint: 'Low'
  },
  {
    pattern: /jusched|sunjavaupdatesched|java update scheduler|javaupdate/,
    recommendation: 'disable',
    reason: UPDATER,
    impactHint: 'Low'
  },
  {
    pattern: /utorrent|bittorrent|qbittorrent/,
    recommendation: 'disable',
    reason:
      'Los clientes torrent se abren y usan red y disco sin que te des cuenta; ábrelo cuando lo necesites.',
    impactHint: 'Medium'
  }
]

const UNKNOWN: StartupClassification = {
  recommendation: 'optional',
  reason: 'Programa no reconocido: desactívalo solo si sabes qué es.',
  essential: false
}

/** Pure classifier (no I/O) so it is trivial to unit-test. */
export function classifyStartupEntry(name: string, command: string): StartupClassification {
  const haystack = `${name ?? ''} ${command ?? ''}`.toLowerCase()
  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) {
      const result: StartupClassification = {
        recommendation: rule.recommendation,
        reason: rule.reason,
        essential: rule.essential === true
      }
      if (rule.impactHint) result.impactHint = rule.impactHint
      return result
    }
  }
  return { ...UNKNOWN }
}
