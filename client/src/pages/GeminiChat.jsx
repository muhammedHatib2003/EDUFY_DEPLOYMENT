import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { authedApi } from '../lib/api.js'

export default function GeminiChat() {
  const { getToken } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollerRef = useRef(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    try {
      scrollerRef.current?.scrollTo({
        top: scrollerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    } catch {}
  }, [messages.length])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    setLoading(true)
    setError('')
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])

    try {
      const http = await authedApi(getToken)
      // Normal chat; summaries only happen when a classroom passes transcript separately
      const { data } = await http.post('/ai/chat', { input: text })
      setMessages((m) => [...m, { role: 'assistant', content: data?.reply || '' }])
    } catch (err) {
      setError(err?.response?.data?.error || 'AI failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-6rem)] flex flex-col gap-3 px-3">
      {/* Header */}
      <div className="card bg-base-100 border shadow-sm">
        <div className="card-body p-4">
          <h3 className="card-title text-base font-bold">AI Assistant</h3>
          <p className="text-sm text-base-content/70">
            Normal sohbet. Ders özetleri yalnızca sınıfta, transcript sağlandığında ve sen isteyince yapılır.
          </p>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 card bg-base-100 border shadow-sm flex flex-col overflow-hidden">
        <div ref={scrollerRef} className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-sm opacity-60">Mesaj yazmaya başla</div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`chat ${m.role === 'user' ? 'chat-end' : 'chat-start'}`}>
              <div className="chat-bubble whitespace-pre-wrap max-w-[85%]">{m.content}</div>
            </div>
          ))}

          {loading && (
            <div className="chat chat-start">
              <div className="chat-bubble">Thinking...</div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t bg-base-200/50">
          {error && (
            <div className="alert alert-error mb-2 text-sm py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              className="textarea textarea-bordered flex-1 min-h-[48px]"
              placeholder="Mesaj yaz..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send()
              }}
            />
            <button
              className={`btn btn-primary ${loading ? 'loading' : ''}`}
              disabled={!input.trim() || loading}
              onClick={send}
            >
              Send
            </button>
          </div>

          <div className="text-xs opacity-60 mt-1">Ctrl / Cmd + Enter ile gönder</div>
        </div>
      </div>
    </div>
  )
}
