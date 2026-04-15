import { CleanupService, CLEANUP_CATEGORIES } from '../src/main/services/cleanup'

describe('CleanupService', () => {
  let service: CleanupService

  beforeEach(() => {
    service = new CleanupService()
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
})
