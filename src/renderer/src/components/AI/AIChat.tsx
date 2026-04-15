import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/app.store'
import { Send, Bot, User, Sparkles, RefreshCw } from 'lucide-react'
import type { ChatMessage, SystemContext } from '../../../../shared/types'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function AIChat() {
  const { chatMessages, addChatMessage, clearChat, metrics, processes, settings, addNotification, setLoading, loading } = useAppStore()
  const [input, setInput] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isChatLoading = loading['ai-chat']

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const buildContext = (): SystemContext => ({
    metrics,
    recentActions: [],
    topProcesses: processes.slice(0, 5),
    issues: []
  })

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isChatLoading) return

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }
    addChatMessage(userMsg)
    setInput('')
    setLoading('ai-chat', true)

    try {
      const context = buildContext()
      const allMessages = [...chatMessages, userMsg]
      const res = await window.electronAPI?.aiChat(allMessages, context) as { content: string; error?: string }

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: res?.content ?? 'Sin respuesta',
        timestamp: Date.now()
      }
      addChatMessage(assistantMsg)
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al comunicarse con la IA' })
    } finally {
      setLoading('ai-chat', false)
    }
  }

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    try {
      const context = buildContext()
      const res = await window.electronAPI?.aiAnalyze(context) as {
        summary: string
        recommendations: string[]
        error?: string
      }
      if (res) {
        const lines = [
          `📊 **Análisis del sistema:**`,
          '',
          res.summary,
          '',
          '**Recomendaciones:**',
          ...res.recommendations.map((r, i) => `${i + 1}. ${r}`)
        ]
        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: lines.join('\n'),
          timestamp: Date.now()
        }
        addChatMessage(assistantMsg)
      }
    } catch (err) {
      addNotification({ type: 'error', message: 'Error al analizar el sistema' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const suggestions = [
    '¿Por qué va lento mi PC?',
    '¿Qué proceso consume más recursos?',
    '¿Cómo puedo mejorar el arranque?',
    '¿Es seguro limpiar el registro?'
  ]

  return (
    <div className="flex flex-col h-full gap-4" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-fluent-text">Asistente IA</h1>
          <p className="text-fluent-textMuted text-sm mt-1">
            Diagnóstico inteligente del sistema con NVIDIA NIM
            {!settings.nvidiaApiKey && (
              <span className="text-yellow-400 ml-2">(modo offline · configura tu API key en Ajustes)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="btn-primary flex items-center gap-2"
          >
            <Sparkles size={14} className={isAnalyzing ? 'animate-pulse' : ''} />
            {isAnalyzing ? 'Analizando…' : 'Analizar sistema'}
          </button>
          {chatMessages.length > 0 && (
            <button onClick={clearChat} className="btn-secondary flex items-center gap-2">
              <RefreshCw size={14} />
              Limpiar chat
            </button>
          )}
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <Bot size={48} className="text-fluent-accent opacity-60" />
            <div>
              <p className="text-fluent-text font-medium">¿En qué puedo ayudarte?</p>
              <p className="text-fluent-textMuted text-sm mt-1">
                Pregúntame sobre el estado de tu sistema o pide recomendaciones
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {isChatLoading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-fluent-accent flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div className="card max-w-xs">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 bg-fluent-accent rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Pregunta sobre tu sistema… (Enter para enviar)"
          disabled={isChatLoading}
          rows={2}
          className="flex-1 bg-fluent-surface border border-fluent-border rounded-fluentLg py-2.5 px-3 text-sm text-fluent-text placeholder:text-fluent-textMuted focus:outline-none focus:border-fluent-accent resize-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isChatLoading}
          className="btn-primary h-full px-4 flex-shrink-0 flex items-center gap-2"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-fluent-card' : 'bg-fluent-accent'
      }`}>
        {isUser ? <User size={14} /> : <Bot size={14} className="text-white" />}
      </div>
      <div className={`card max-w-2xl ${isUser ? 'bg-fluent-accent/20' : ''}`}>
        <pre className="text-sm text-fluent-text whitespace-pre-wrap font-sans leading-relaxed">
          {message.content}
        </pre>
        <p className="text-xs text-fluent-textMuted mt-2">
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}
