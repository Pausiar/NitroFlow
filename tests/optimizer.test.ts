import { OptimizerService } from '../src/main/services/optimizer'
import { SettingsService } from '../src/main/services/settings'

// Mock runPowerShell so tests don't invoke PowerShell
jest.mock('../src/main/utils/powershell', () => ({
  runPowerShell: jest.fn().mockResolvedValue('')
}))

const mockSave = jest.fn()
const mockGet = jest.fn(() => ({ performanceMode: 'balanced' }))
const mockSettingsInstance = { get: mockGet, save: mockSave }

// Mock SettingsService – always returns the same singleton stub
jest.mock('../src/main/services/settings', () => ({
  SettingsService: {
    getInstance: jest.fn(() => mockSettingsInstance)
  }
}))

import { runPowerShell } from '../src/main/utils/powershell'
const mockRunPowerShell = runPowerShell as jest.Mock

describe('OptimizerService', () => {
  let service: OptimizerService

  beforeEach(() => {
    // Reset singleton between tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(OptimizerService as any).instance = undefined
    service = OptimizerService.getInstance()
    jest.clearAllMocks()
    mockRunPowerShell.mockResolvedValue('')
    mockGet.mockReturnValue({ performanceMode: 'balanced' })
  })

  it('is a singleton', () => {
    const a = OptimizerService.getInstance()
    const b = OptimizerService.getInstance()
    expect(a).toBe(b)
  })

  it('getStatus returns current mode from settings', () => {
    const status = service.getStatus()
    expect(status).toHaveProperty('currentMode')
    expect(['balanced', 'performance', 'gaming']).toContain(status.currentMode)
  })

  describe('applyMode (non-Windows)', () => {
    // process.platform is 'linux' in jest, so PowerShell is never called
    it('returns success for balanced without calling PowerShell', async () => {
      const result = await service.applyMode('balanced')
      expect(result.success).toBe(true)
      expect(mockRunPowerShell).not.toHaveBeenCalled()
    })

    it('returns success for performance without calling PowerShell', async () => {
      const result = await service.applyMode('performance')
      expect(result.success).toBe(true)
      expect(mockRunPowerShell).not.toHaveBeenCalled()
    })

    it('returns success for gaming without calling PowerShell', async () => {
      const result = await service.applyMode('gaming')
      expect(result.success).toBe(true)
      expect(mockRunPowerShell).not.toHaveBeenCalled()
    })

    it('persists the mode via SettingsService', async () => {
      await service.applyMode('gaming')
      expect(mockSave).toHaveBeenCalledWith({ performanceMode: 'gaming' })
    })
  })

  describe('applyMode error handling', () => {
    it('returns success: false when SettingsService.save throws', async () => {
      mockSave.mockImplementationOnce(() => { throw new Error('disk full') })
      const result = await service.applyMode('performance')
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/disk full/)
    })
  })
})

