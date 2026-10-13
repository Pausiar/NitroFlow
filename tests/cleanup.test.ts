import {
  CleanupService,
  CLEANUP_CATEGORIES,
  CATEGORY_RULES,
  expandPath,
  expandCategoryPaths,
  isRootAcceptable,
  buildCleanupScript
} from '../src/main/services/cleanup'
import { isPathSafe } from '../src/main/utils/security'

describe('CleanupService', () => {
  let service: CleanupService
  let originalPlatform: PropertyDescriptor | undefined

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    service = new CleanupService()
  })

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
  })

  describe('CLEANUP_CATEGORIES', () => {
    it('defines at least 6 categories', () => {
      expect(CLEANUP_CATEGORIES.length).toBeGreaterThanOrEqual(6)
    })

    it('all categories have required fields', () => {
      for (const cat of CLEANUP_CATEGORIES) {
        expect(cat.id).toBeTruthy()
        expect(cat.name).toBeTruthy()
        expect(cat.description).toBeTruthy()
        expect(Array.isArray(cat.paths)).toBe(true)
        expect(typeof cat.safe).toBe('boolean')
      }
    })

    it('contains temp_windows category', () => {
      const found = CLEANUP_CATEGORIES.find((c) => c.id === 'temp_windows')
      expect(found).toBeDefined()
      expect(found?.safe).toBe(true)
    })

    it('contains temp_user category', () => {
      const found = CLEANUP_CATEGORIES.find((c) => c.id === 'temp_user')
      expect(found).toBeDefined()
    })

    it('contains prefetch category', () => {
      const found = CLEANUP_CATEGORIES.find((c) => c.id === 'prefetch')
      expect(found).toBeDefined()
    })

    it('no category path points to protected system locations', () => {
      const protectedPaths = [
        'system32', 'syswow64', 'winsxs', 'documents', 'pictures', 'music', 'videos'
      ]
      for (const cat of CLEANUP_CATEGORIES) {
        for (const path of cat.paths) {
          const lower = path.toLowerCase()
          for (const p of protectedPaths) {
            expect(lower).not.toContain(p)
          }
        }
      }
    })
  })

  describe('scan (non-Windows)', () => {
    it('returns mock data on non-Windows platform', async () => {
      // Since tests run on Linux, it returns mock data
      const categories = await service.scan()
      expect(Array.isArray(categories)).toBe(true)
      expect(categories.length).toBeGreaterThan(0)
      for (const cat of categories) {
        expect(typeof cat.sizeMB).toBe('number')
        expect(typeof cat.fileCount).toBe('number')
        expect(cat.sizeMB).toBeGreaterThanOrEqual(0)
        expect(cat.fileCount).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('clean (non-Windows)', () => {
    it('returns results for each requested category', async () => {
      const ids = ['temp_windows', 'temp_user']
      const results = await service.clean(ids)
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(ids.length)
      for (const result of results) {
        expect(ids).toContain(result.categoryId)
        expect(typeof result.freedMB).toBe('number')
        expect(typeof result.deletedFiles).toBe('number')
        expect(Array.isArray(result.errors)).toBe(true)
        expect(typeof result.success).toBe('boolean')
      }
    })

    it('ignores unknown category ids gracefully', async () => {
      const results = await service.clean(['nonexistent_category'])
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })

    it('returns empty array for empty input', async () => {
      const results = await service.clean([])
      expect(results).toEqual([])
    })
  })

  describe('category metadata', () => {
    const NEVER_RECOMMENDED = ['recycle_bin', 'prefetch', 'recent', 'event_logs']

    it('has unique ids and a rule for each category', () => {
      const ids = CLEANUP_CATEGORIES.map((c) => c.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(CATEGORY_RULES[id]).toBeDefined()
    })

    it('never recommends recycle bin, prefetch, recent files or logs', () => {
      for (const id of NEVER_RECOMMENDED) {
        const cat = CLEANUP_CATEGORIES.find((c) => c.id === id)
        expect(cat).toBeDefined()
        expect(cat?.recommended).not.toBe(true)
      }
    })

    it('non-recommended categories carry a warning, recommended ones are safe', () => {
      for (const cat of CLEANUP_CATEGORIES) {
        if (cat.recommended) {
          expect(cat.safe).toBe(true)
        } else {
          expect(cat.warning).toBeTruthy()
        }
      }
    })

    it('uses the agreed recycle bin warning', () => {
      const rb = CLEANUP_CATEGORIES.find((c) => c.id === 'recycle_bin')
      expect(rb?.warning).toBe('Los archivos de la papelera se borrarán para siempre')
    })

    it('includes the expected recommended categories', () => {
      const rec = CLEANUP_CATEGORIES.filter((c) => c.recommended).map((c) => c.id)
      for (const id of [
        'temp_user',
        'temp_windows',
        'windows_update',
        'delivery_optimization',
        'thumbnail_cache',
        'error_reports',
        'crash_dumps',
        'shader_cache',
        'browser_chrome',
        'browser_edge',
        'browser_brave',
        'browser_firefox'
      ]) {
        expect(rec).toContain(id)
      }
    })

    it('temp folders only delete files older than 24 hours', () => {
      expect(CATEGORY_RULES.temp_user.minAgeHours).toBeGreaterThanOrEqual(24)
      expect(CATEGORY_RULES.temp_windows.minAgeHours).toBeGreaterThanOrEqual(24)
      expect(CATEGORY_RULES.windows_update.minAgeHours).toBeGreaterThanOrEqual(1)
    })

    it('thumbnail cache only targets thumbcache/iconcache files', () => {
      expect(CATEGORY_RULES.thumbnail_cache.patterns).toEqual(['thumbcache_*.db', 'iconcache_*.db'])
    })
  })

  describe('path expansion', () => {
    const env = {
      WINDIR: 'C:\\Windows',
      TEMP: 'C:\\Users\\ana\\AppData\\Local\\Temp',
      APPDATA: 'C:\\Users\\ana\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local',
      ProgramData: 'C:\\ProgramData',
      USERPROFILE: 'C:\\Users\\ana'
    }

    it('expands every variable, case-insensitively and repeatedly', () => {
      expect(expandPath('%WINDIR%\\Temp', env)).toBe('C:\\Windows\\Temp')
      expect(expandPath('%PROGRAMDATA%\\Microsoft\\Windows\\WER\\ReportQueue', env)).toBe(
        'C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportQueue'
      )
      expect(expandPath('%LOCALAPPDATA%\\a\\%TEMP%', env)).toBe(
        'C:\\Users\\ana\\AppData\\Local\\a\\C:\\Users\\ana\\AppData\\Local\\Temp'
      )
    })

    it('returns empty string when a variable cannot be resolved', () => {
      expect(expandPath('%NOPE%\\x', {})).toBe('')
      expect(expandPath('%APPDATA%\\x', {})).toBe('')
    })

    it('expands wildcard profile folders only to existing directories', () => {
      const dirs: Record<string, string[]> = {
        'C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\User Data\\': [
          'Default',
          'Profile 1',
          'Profile 2',
          'Crashpad',
          'System Profile'
        ]
      }
      const out = expandCategoryPaths(
        '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Profile *\\Cache',
        env,
        (d) => dirs[d] ?? []
      )
      expect(out).toEqual([
        'C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 1\\Cache',
        'C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 2\\Cache'
      ])
    })

    it('rejects unsafe roots', () => {
      expect(isRootAcceptable('C:\\')).toBe(false)
      expect(isRootAcceptable('relative\\path')).toBe(false)
      expect(isRootAcceptable('C:\\Users\\..\\Windows')).toBe(false)
      expect(isRootAcceptable('C:\\Windows\\Temp', CATEGORY_RULES.temp_windows)).toBe(true)
      // A hijacked %TEMP% pointing at a non-temp folder must not be cleaned.
      expect(isRootAcceptable('C:\\Users\\ana\\Documents', CATEGORY_RULES.temp_user)).toBe(false)
      expect(isRootAcceptable('C:\\Users\\ana', CATEGORY_RULES.temp_user)).toBe(false)
      expect(isRootAcceptable('C:\\Temp', CATEGORY_RULES.temp_user)).toBe(true)
    })

    it('all resolved category roots pass isPathSafe', () => {
      const dirsFor = (d: string): string[] => (d.endsWith('User Data\\') || d.endsWith('Profiles\\') ? ['Default', 'Profile 1', 'abc.default'] : [])
      for (const cat of CLEANUP_CATEGORIES) {
        for (const raw of cat.paths) {
          for (const p of expandCategoryPaths(raw, env, dirsFor)) {
            expect(isPathSafe(p)).toBe(true)
            expect(isRootAcceptable(p, CATEGORY_RULES[cat.id])).toBe(true)
          }
        }
      }
    })
  })

  describe('browser cache paths', () => {
    const browsers = CLEANUP_CATEGORIES.filter((c) => c.id.startsWith('browser_'))

    it('defines Chrome, Edge, Brave and Firefox', () => {
      expect(browsers.map((b) => b.id).sort()).toEqual([
        'browser_brave',
        'browser_chrome',
        'browser_edge',
        'browser_firefox'
      ])
    })

    it('only targets cache directories, never user data', () => {
      const allowedLeaf = /\\(Cache|Code Cache|GPUCache|cache2)$/
      const forbidden = /cookies|history|login|password|local storage|sessions|bookmarks|web data|extensions|profiles\\?$/i
      for (const b of browsers) {
        expect(b.paths.length).toBeGreaterThan(0)
        for (const p of b.paths) {
          expect(p).toMatch(allowedLeaf)
          expect(p).not.toMatch(forbidden)
        }
      }
    })

    it('every browser has a running-process guard', () => {
      for (const b of browsers) {
        expect(CATEGORY_RULES[b.id].browser?.processes.length).toBeGreaterThan(0)
      }
    })
  })

  describe('buildCleanupScript', () => {
    const base = {
      roots: ["C:\\Users\\o'brien\\AppData\\Local\\Temp"],
      doDelete: true,
      minAgeHours: 24,
      patterns: [],
      recurse: true,
      downloadGuard: false
    }

    it('escapes single quotes in paths and uses the age cutoff', () => {
      const script = buildCleanupScript(base)
      expect(script).toContain("'C:\\Users\\o''brien\\AppData\\Local\\Temp'")
      expect(script).toContain('AddHours(-24)')
    })

    it('skips reparse points (junctions / symlinks)', () => {
      const script = buildCleanupScript(base)
      expect(script).toContain('ReparsePoint')
    })

    it('measure mode does not delete', () => {
      expect(buildCleanupScript({ ...base, doDelete: false })).toContain('$doDelete = $false')
      expect(buildCleanupScript(base)).toContain('$doDelete = $true')
    })

    it('passes file patterns through', () => {
      const script = buildCleanupScript({ ...base, patterns: ['thumbcache_*.db'], recurse: false })
      expect(script).toContain("@('thumbcache_*.db')")
      expect(script).toContain('$recurse = $false')
    })
  })

  describe('Windows flow (mocked PowerShell)', () => {
    const env = { ...process.env }
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      process.env.WINDIR = 'C:\\Windows'
      process.env.TEMP = 'C:\\Users\\ana\\AppData\\Local\\Temp'
      process.env.APPDATA = 'C:\\Users\\ana\\AppData\\Roaming'
      process.env.LOCALAPPDATA = 'C:\\Users\\ana\\AppData\\Local'
      process.env.USERPROFILE = 'C:\\Users\\ana'
    })
    afterEach(() => {
      process.env = { ...env }
    })

    it('skips a running browser and reports how to proceed', async () => {
      const scripts: string[] = []
      const run = jest.fn(async (script: string) => {
        scripts.push(script)
        if (script.includes('Get-Process')) return { stdout: 'chrome\nexplorer', stderr: '', ok: true }
        return { stdout: '', stderr: '', ok: true }
      })
      const svc = new CleanupService(run, () => ['Default'])
      const [res] = await svc.clean(['browser_chrome'])
      expect(res.skippedReason).toBe('Cierra Google Chrome para limpiar su caché')
      expect(res.success).toBe(false)
      expect(res.freedMB).toBe(0)
      expect(scripts.some((s) => s.includes('$doDelete = $true'))).toBe(false)
    })

    it('never cleans a browser cache when the process list cannot be read (fail closed)', async () => {
      const scripts: string[] = []
      const run = jest.fn(async (script: string) => {
        scripts.push(script)
        if (script.includes('Get-Process')) return { stdout: '', stderr: 'boom', ok: false }
        return { stdout: '', stderr: '', ok: true }
      })
      const svc = new CleanupService(run, () => ['Default'])
      const [res] = await svc.clean(['browser_firefox'])
      expect(res.success).toBe(false)
      expect(res.skippedReason).toMatch(/No se pudo comprobar si Mozilla Firefox está abierto/)
      expect(scripts.some((s) => s.includes('$doDelete = $true'))).toBe(false)
    })

    it('computes freedMB from bytes actually deleted and flags locked files', async () => {
      const run = jest.fn(async (script: string) => {
        if (script.includes('Get-Process')) return { stdout: '', stderr: '', ok: true }
        return {
          stdout: JSON.stringify({
            Size: 30 * 1024 * 1024,
            Count: 12,
            Freed: 20 * 1024 * 1024,
            Deleted: 10,
            Locked: 2,
            Denied: 0,
            Busy: 0
          }),
          stderr: '',
          ok: true
        }
      })
      const svc = new CleanupService(run)
      const [res] = await svc.clean(['temp_user'])
      expect(res.freedMB).toBe(20)
      expect(res.deletedFiles).toBe(10)
      expect(res.lockedFiles).toBe(2)
      expect(res.success).toBe(true)
      expect(res.errors).toEqual([])
    })

    it('does not clean a hijacked %TEMP%', async () => {
      process.env.TEMP = 'C:\\Users\\ana'
      const run = jest.fn(async (_script: string) => ({ stdout: '', stderr: '', ok: true }))
      const svc = new CleanupService(run)
      const [res] = await svc.clean(['temp_user'])
      expect(res.freedMB).toBe(0)
      expect(run.mock.calls.some(([s]) => String(s).includes('$doDelete = $true'))).toBe(false)
    })

    it('scan flags a running browser as blocked', async () => {
      const run = jest.fn(async (script: string) => {
        if (script.includes('Get-Process')) return { stdout: 'msedge', stderr: '', ok: true }
        return { stdout: JSON.stringify({ Size: 1048576, Count: 3 }), stderr: '', ok: true }
      })
      const svc = new CleanupService(run, () => ['Default'])
      const cats = await svc.scan()
      const edge = cats.find((c) => c.id === 'browser_edge')
      expect(edge?.blockedReason).toBe('Cierra Microsoft Edge para limpiar su caché')
      expect(cats.find((c) => c.id === 'browser_chrome')?.blockedReason).toBeUndefined()
    })
  })
})
