import axios from 'axios'
import log from 'electron-log'
import type { ChatMessage, SystemContext, ProcessInfo, ProcessAIVerdict } from '../../shared/types'

const NVIDIA_NIM_BASE_URL = (
  process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'
).replace(/\/+$/, '')
const DEFAULT_MODEL = 'meta/llama-3.1-8b-instruct'
// If the configured model is rejected (404 / unknown model), transparently
// fall back to these known-good NVIDIA NIM models, in order.
const FALLBACK_MODELS = [
  'meta/llama-3.1-8b-instruct',
  'meta/llama3-8b-instruct',
  'mistralai/mistral-7b-instruct-v0.3'
]

interface NimMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface NimOptions {
  temperature?: number
  maxTokens?: number
  timeout?: number
}

export class AIService {
  /**
   * Call the NVIDIA NIM (OpenAI-compatible) chat completions endpoint with
   * automatic model fallback. Throws a clean Error on failure so callers can
   * degrade to offline mode.
   */
  private async createChatCompletion(
    messages: NimMessage[],
    apiKey: string,
    model: string,
    options: NimOptions = {}
  ): Promise<string> {
    const { temperature = 0.4, maxTokens = 1024, timeout = 30000 } = options
    const candidates = Array.from(new Set([model || DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean)))

    let lastError: unknown = null
    for (const candidate of candidates) {
      try {
        const response = await axios.post(
          `${NVIDIA_NIM_BASE_URL}/chat/completions`,
          { model: candidate, messages, temperature, max_tokens: maxTokens, stream: false },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            timeout
          }
        )
        return response.data?.choices?.[0]?.message?.content ?? ''
      } catch (err) {
        lastError = err
        // Only fall back when the model itself is the problem (404 / 400 /
        // 422 "model not found"). Auth (401/403) and network errors are fatal.
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        if (status === 401 || status === 403) break
        if (status !== 404 && status !== 400 && status !== 422) break
        log.warn(`AIService: model "${candidate}" rejected (HTTP ${status}), trying fallback`)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  async chat(
    messages: ChatMessage[],
    systemContext: SystemContext,
    apiKey: string,
    model = DEFAULT_MODEL
  ): Promise<{ content: string; error?: string }> {
    if (!apiKey) {
      return {
        content: this.getOfflineResponse(messages, systemContext),
        error: undefined
      }
    }

    try {
      const systemPrompt = this.buildSystemPrompt(systemContext)
      const content = await this.createChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          ...messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role as NimMessage['role'], content: m.content }))
        ],
        apiKey,
        model,
        { temperature: 0.4, maxTokens: 1024 }
      )
      return { content }
    } catch (err) {
      log.error('AI chat error:', err)
      const errorMsg = this.describeError(err)
      return {
        content: `⚠️ No se pudo conectar con el servicio de IA: ${errorMsg}`,
        error: errorMsg
      }
    }
  }

  async analyze(
    systemContext: SystemContext,
    apiKey: string,
    model = DEFAULT_MODEL
  ): Promise<{ recommendations: string[]; summary: string; error?: string }> {
    if (!apiKey) {
      return this.getOfflineAnalysis(systemContext)
    }

    try {
      const prompt = this.buildAnalysisPrompt(systemContext)
      const raw = await this.createChatCompletion(
        [
          {
            role: 'system',
            content:
              'Eres un experto en optimización de sistemas Windows. Responde SIEMPRE en español. Sé conciso y práctico.'
          },
          { role: 'user', content: prompt }
        ],
        apiKey,
        model,
        { temperature: 0.3, maxTokens: 1024 }
      )
      return this.parseAnalysisResponse(raw)
    } catch (err) {
      log.error('AI analyze error:', err)
      return this.getOfflineAnalysis(systemContext)
    }
  }

  async analyzeProcesses(
    processes: ProcessInfo[],
    apiKey: string,
    model = DEFAULT_MODEL
  ): Promise<{ verdicts: ProcessAIVerdict[]; error?: string }> {
    // Limit to the top 30 by resource usage to keep the prompt concise
    const top = processes
      .filter((p) => p.canTerminate)
      .sort((a, b) => b.cpuPercent + b.ramMB / 100 - (a.cpuPercent + a.ramMB / 100))
      .slice(0, 30)

    if (!apiKey) {
      return { verdicts: this.getOfflineProcessVerdicts(top) }
    }

    const processList = top
      .map(
        (p) =>
          `- PID ${p.pid}: "${p.name}" (${p.description || 'sin descripción'}) | CPU: ${p.cpuPercent}% | RAM: ${p.ramMB} MB`
      )
      .join('\n')

    const prompt = `Eres un experto en sistemas Windows. Analiza estos procesos en ejecución y clasifica cada uno como "useful" (útil para el sistema o el usuario) o "disposable" (prescindible, se puede terminar sin riesgos). Responde SIEMPRE en JSON.

Procesos:
${processList}

Responde EXACTAMENTE con este formato JSON (sin texto extra):
[
  { "pid": <number>, "name": "<string>", "verdict": "useful"|"disposable", "reason": "<breve razón en español>" },
  ...
]`

    try {
      const raw = await this.createChatCompletion(
        [
          {
            role: 'system',
            content: 'Eres un experto en optimización de sistemas Windows. Responde SIEMPRE en JSON válido.'
          },
          { role: 'user', content: prompt }
        ],
        apiKey,
        model,
        { temperature: 0.2, maxTokens: 2048, timeout: 45000 }
      )
      const verdicts = this.parseProcessVerdicts(raw, top)
      return { verdicts }
    } catch (err) {
      log.error('AI analyzeProcesses error:', err)
      return {
        verdicts: this.getOfflineProcessVerdicts(top),
        error: this.describeError(err)
      }
    }
  }

  private describeError(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        return 'API key de IA no válida o sin permisos'
      }
      if (status === 429) {
        return 'Límite de peticiones alcanzado, inténtalo más tarde'
      }
      if (err.code === 'ECONNABORTED') {
        return 'Tiempo de espera agotado'
      }
      return err.message
    }
    return String(err)
  }

  private parseProcessVerdicts(raw: string, processes: ProcessInfo[]): ProcessAIVerdict[] {
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ProcessAIVerdict[]
        if (Array.isArray(parsed)) {
          return parsed.map((v) => ({
            pid: Number(v.pid),
            name: String(v.name ?? ''),
            verdict: v.verdict === 'disposable' ? 'disposable' : 'useful',
            reason: String(v.reason ?? '')
          }))
        }
      }
    } catch {
      // Fall through to offline
    }
    return this.getOfflineProcessVerdicts(processes)
  }

  private getOfflineProcessVerdicts(processes: ProcessInfo[]): ProcessAIVerdict[] {
    // Known disposable process name patterns (common background fluff)
    const disposablePatterns = [
      /update/i,
      /telemetry/i,
      /crash.*report/i,
      /report.*crash/i,
      /helper/i,
      /notif/i,
      /tray/i,
      /agent/i,
      /toolbar/i,
      /browser.*helper/i,
      /discord.*update/i,
      /skype.*update/i,
      /onedrive/i,
      /dropbox/i,
      /googledrivesync/i,
      /teamviewer/i,
      /anydesk/i,
    ]

    return processes.map((p) => {
      const isDisposable = disposablePatterns.some((re) => re.test(p.name) || re.test(p.description))
      return {
        pid: p.pid,
        name: p.name,
        verdict: isDisposable ? 'disposable' : 'unknown',
        reason: isDisposable
          ? 'Proceso de fondo identificado como prescindible (modo offline)'
          : 'Configura la API key de NVIDIA NIM para un análisis preciso'
      }
    })
  }

  private buildSystemPrompt(ctx: SystemContext): string {
    const { metrics, recentActions, topProcesses } = ctx
    const lines: string[] = [
      'Eres el asistente de diagnóstico de NitroFlow, un optimizador inteligente de Windows.',
      'Responde SIEMPRE en español. Sé útil, preciso y conciso.',
      'IMPORTANTE: Solo puedes recomendar acciones, nunca ejecutarlas directamente.',
      '',
      '=== ESTADO ACTUAL DEL SISTEMA ==='
    ]

    if (metrics) {
      lines.push(`CPU: ${metrics.cpu.usagePercent}% (${metrics.cpu.model})`)
      lines.push(`RAM: ${metrics.ram.usedMB} MB / ${metrics.ram.totalMB} MB (${metrics.ram.usagePercent}%)`)
      if (metrics.disk.length > 0) {
        metrics.disk.forEach((d) => {
          lines.push(`Disco ${d.drive}: ${d.usedGB} GB / ${d.totalGB} GB (${d.usagePercent}%)`)
        })
      }
    }

    if (topProcesses.length > 0) {
      lines.push('', '=== PROCESOS CON MÁS RECURSOS ===')
      topProcesses.slice(0, 5).forEach((p) => {
        lines.push(`- ${p.name}: CPU ${p.cpuPercent}%, RAM ${p.ramMB} MB`)
      })
    }

    if (recentActions.length > 0) {
      lines.push('', '=== ACCIONES RECIENTES ===')
      recentActions.slice(0, 5).forEach((a) => {
        lines.push(`- [${new Date(a.timestamp).toLocaleTimeString()}] ${a.description}`)
      })
    }

    if (ctx.issues.length > 0) {
      lines.push('', '=== PROBLEMAS DETECTADOS ===')
      ctx.issues.forEach((issue) => lines.push(`- ${issue}`))
    }

    return lines.join('\n')
  }

  private buildAnalysisPrompt(ctx: SystemContext): string {
    const systemInfo = this.buildSystemPrompt(ctx)
    return `${systemInfo}

Analiza el estado del sistema y proporciona:
1. Un resumen en 1-2 oraciones del estado general del sistema
2. Las 3-5 recomendaciones más importantes para mejorar el rendimiento
3. Cada recomendación debe ser específica y accionable

Formato de respuesta (JSON):
{
  "summary": "...",
  "recommendations": ["rec1", "rec2", "rec3"]
}`
  }

  private parseAnalysisResponse(raw: string): {
    recommendations: string[]
    summary: string
    error?: string
  } {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          summary: parsed.summary ?? '',
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
        }
      }
    } catch {
      // Fallback: parse as plain text
    }
    return {
      summary: raw.split('\n')[0] ?? 'Análisis completado',
      recommendations: raw
        .split('\n')
        .filter((l) => l.match(/^\d+\.|^-/))
        .map((l) => l.replace(/^\d+\.\s*|-\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 5)
    }
  }

  private getOfflineResponse(messages: ChatMessage[], ctx: SystemContext): string {
    const lastMessage = messages.filter((m) => m.role === 'user').at(-1)?.content ?? ''
    const lower = lastMessage.toLowerCase()

    if (lower.includes('lento') || lower.includes('rendimiento')) {
      const cpuPct = ctx.metrics?.cpu.usagePercent ?? 0
      const ramPct = ctx.metrics?.ram.usagePercent ?? 0
      return `🔍 **Análisis offline del rendimiento:**\n\n- CPU: ${cpuPct}% ${cpuPct > 70 ? '⚠️ Alto uso' : '✅ Normal'}\n- RAM: ${ramPct}% ${ramPct > 80 ? '⚠️ Alta presión' : '✅ Normal'}\n\n💡 Para un análisis preciso, configura una API key de NVIDIA NIM en Ajustes.`
    }
    return `💡 Para obtener respuestas inteligentes sobre tu sistema, configura tu API key de NVIDIA NIM en los ajustes.\n\nMientras tanto, puedes usar las herramientas de limpieza, gestión de procesos y registro para optimizar tu sistema.`
  }

  private getOfflineAnalysis(ctx: SystemContext): {
    recommendations: string[]
    summary: string
  } {
    const recs: string[] = []
    const m = ctx.metrics
    if (m) {
      if (m.cpu.usagePercent > 70) recs.push('Revisa los procesos con alto uso de CPU en el gestor de procesos')
      if (m.ram.usagePercent > 80) recs.push('Considera cerrar aplicaciones pesadas para liberar RAM')
      if (m.disk.some((d) => d.usagePercent > 85)) recs.push('Ejecuta la limpieza del sistema para liberar espacio en disco')
    }
    recs.push('Ejecuta la limpieza de archivos temporales para mejorar el rendimiento')
    recs.push('Revisa los programas de inicio y desactiva los que no sean necesarios')

    return {
      summary: 'Análisis offline: configura la API key de NVIDIA NIM para recomendaciones personalizadas.',
      recommendations: recs
    }
  }
}
