import { AIService } from '../src/main/services/ai-service'
import type { SystemContext, ChatMessage } from '../src/shared/types'

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn(),
  isAxiosError: jest.fn(() => false)
}))

import axios from 'axios'
const mockAxios = axios as jest.Mocked<typeof axios>

function makeContext(overrides: Partial<SystemContext> = {}): SystemContext {
  return {
    metrics: {
      cpu: { usagePercent: 45, coreCount: 8, logicalCount: 16, speed: 3.6, model: 'Test CPU', history: [] },
      ram: { totalMB: 16384, usedMB: 8192, freeMB: 8192, usagePercent: 50, history: [] },
      disk: [{ drive: 'C:', label: 'Windows', totalGB: 500, usedGB: 280, freeGB: 220, usagePercent: 56, readSpeedMBs: 0, writeSpeedMBs: 0 }],
      network: { uploadKBs: 0, downloadKBs: 0, adapter: 'Test' },
      temperatures: [],
      timestamp: Date.now()
    },
    recentActions: [],
    topProcesses: [],
    issues: [],
    ...overrides
  }
}

describe('AIService', () => {
  let service: AIService

  beforeEach(() => {
    service = new AIService()
    jest.clearAllMocks()
  })

  describe('chat (offline mode - no API key)', () => {
    it('returns offline response when no API key is provided', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: '¿Por qué va lento mi PC?', timestamp: Date.now() }
      ]
      const result = await service.chat(messages, makeContext(), '', 'meta/llama3-8b-instruct')
      expect(result.content).toBeTruthy()
      expect(typeof result.content).toBe('string')
      expect(result.error).toBeUndefined()
    })

    it('returns response mentioning API key configuration when no key', async () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'General question', timestamp: Date.now() }
      ]
      const result = await service.chat(messages, makeContext(), '', 'meta/llama3-8b-instruct')
      expect(result.content.toLowerCase()).toMatch(/api|ajustes|configurar|offline/i)
    })
  })

  describe('chat (with API key)', () => {
    it('calls NVIDIA NIM API with correct structure', async () => {
      mockAxios.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: 'Respuesta de IA' } }] }
      })

      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hola', timestamp: Date.now() }
      ]
      const result = await service.chat(messages, makeContext(), 'nvapi-test-key')
      expect(mockAxios.post).toHaveBeenCalledTimes(1)
      const [url, payload] = (mockAxios.post as jest.Mock).mock.calls[0]
      expect(url).toContain('nvidia.com')
      expect(payload.messages).toBeDefined()
      expect(Array.isArray(payload.messages)).toBe(true)
      expect(result.content).toBe('Respuesta de IA')
    })

    it('handles API error gracefully', async () => {
      mockAxios.post = jest.fn().mockRejectedValue(new Error('Network error'))
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hola', timestamp: Date.now() }
      ]
      const result = await service.chat(messages, makeContext(), 'nvapi-test-key')
      expect(result.content).toContain('⚠️')
      expect(result.error).toBeTruthy()
    })
  })

  describe('analyze (offline mode)', () => {
    it('returns recommendations without API key', async () => {
      const result = await service.analyze(makeContext(), '')
      expect(result.summary).toBeTruthy()
      expect(Array.isArray(result.recommendations)).toBe(true)
      expect(result.recommendations.length).toBeGreaterThan(0)
    })

    it('includes high CPU recommendation when CPU usage is high', async () => {
      const ctx = makeContext({
        metrics: {
          cpu: { usagePercent: 90, coreCount: 4, logicalCount: 8, speed: 2.5, model: 'Test', history: [] },
          ram: { totalMB: 8192, usedMB: 2048, freeMB: 6144, usagePercent: 25, history: [] },
          disk: [],
          network: { uploadKBs: 0, downloadKBs: 0, adapter: 'Test' },
          temperatures: [],
          timestamp: Date.now()
        }
      })
      const result = await service.analyze(ctx, '')
      const allText = result.recommendations.join(' ').toLowerCase()
      expect(allText).toMatch(/cpu|proceso/i)
    })

    it('includes high RAM recommendation when RAM usage is high', async () => {
      const ctx = makeContext({
        metrics: {
          cpu: { usagePercent: 20, coreCount: 4, logicalCount: 8, speed: 2.5, model: 'Test', history: [] },
          ram: { totalMB: 8192, usedMB: 7500, freeMB: 692, usagePercent: 92, history: [] },
          disk: [],
          network: { uploadKBs: 0, downloadKBs: 0, adapter: 'Test' },
          temperatures: [],
          timestamp: Date.now()
        }
      })
      const result = await service.analyze(ctx, '')
      const allText = result.recommendations.join(' ').toLowerCase()
      expect(allText).toMatch(/ram|memoria/i)
    })
  })

  describe('analyze (with API key)', () => {
    it('calls API and parses JSON response', async () => {
      const mockResponse = JSON.stringify({
        summary: 'Sistema funcionando bien',
        recommendations: ['Limpiar archivos temporales', 'Desactivar programas de inicio']
      })
      mockAxios.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: mockResponse } }] }
      })

      const result = await service.analyze(makeContext(), 'nvapi-test-key')
      expect(result.summary).toBe('Sistema funcionando bien')
      expect(result.recommendations).toHaveLength(2)
    })

    it('falls back to offline analysis on API error', async () => {
      mockAxios.post = jest.fn().mockRejectedValue(new Error('API down'))
      const result = await service.analyze(makeContext(), 'nvapi-test-key')
      expect(result.summary).toBeTruthy()
      expect(Array.isArray(result.recommendations)).toBe(true)
    })
  })
})
