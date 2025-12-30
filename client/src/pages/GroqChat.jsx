import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import api from '../lib/api'

export default function GroqChat() {
  const { getToken } = useAuth()
  const [messages, setMessages] = useState([]) // { role: 'user'|'assistant', content, files? }
  const [input, setInput] = useState('')
  const [files, setFiles] = useState([]) // { name, type, dataUrl }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollerRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    try { scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' }) } catch {}
  }, [messages.length])

  const onPickFiles = () => fileInputRef.current?.click()

  const onFilesSelected = async (e) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    const toDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const items = []
    for (const f of selected) {
      try {
        const dataUrl = await toDataUrl(f)
        items.push({ name: f.name, type: f.type || 'application/octet-stream', dataUrl })
      } catch {}
    }
    setFiles((prev) => [...prev, ...items])
    try { e.target.value = '' } catch {}
  }

  const send = async () => {
    const text = (input || '').trim()
    if ((!text && files.length === 0) || loading) return
    setLoading(true)
    setError('')

    const userMsg = { role: 'user', content: text, files }
    const history = messages.map(({ role, content }) => ({ role, content }))
    setMessages((m) => [...m, userMsg])
    setInput('')
    setFiles([])

    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const { data } = await http.post('/ai/chat', { input: text, history, files: userMsg.files })
      const reply = typeof data?.reply === 'string' ? data.reply : ''
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to get reply'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col gap-3">
      <div className="card bg-base-100 border">
        <div className="card-body p-4">
          <h3 className="card-title text-base text-bold">Groq Assistant</h3>
        </div>
      </div>

      <div className="flex-1 card bg-base-100 border overflow-hidden">
        <div ref={scrollerRef} className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-sm opacity-70">Type a message to start.</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat ${m.role === 'user' ? 'chat-end' : 'chat-start'}`}>
              <div className="chat-bubble whitespace-pre-wrap max-w-[85%]">{m.content}</div>
              {Array.isArray(m.files) && m.files.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {m.files.map((f, idx) => (
                    /^data:image\//.test(f?.dataUrl || '') ? (
                      <img key={idx} src={f.dataUrl} alt={f.name || 'image'} className="w-24 h-24 object-cover rounded" />
                    ) : (
                      <div key={idx} className="badge badge-outline gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span className="text-xs">{f?.name || 'file'}</span>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="chat chat-start"><div className="chat-bubble">Thinking…</div></div>
          )}
        </div>

        <div className="p-3 border-t bg-base-200/50">
          {!!error && (
            <div className="alert alert-error mb-3 py-2 text-sm">{error}</div>
          )}
          <div className="flex flex-col gap-2">
            {files.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {files.map((f, idx) => (
                  /^data:image\//.test(f?.dataUrl || '') ? (
                    <div key={idx} className="relative">
                      <img src={f.dataUrl} alt={f.name || 'image'} className="w-20 h-20 object-cover rounded border" />
                      <button type="button" className="btn btn-xs btn-circle absolute -top-2 -right-2" onClick={() => setFiles(arr => arr.filter((_, i2) => i2 !== idx))}>✕</button>
                    </div>
                  ) : (
                    <div key={idx} className="badge badge-outline gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="text-xs">{f?.name || 'file'}</span>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setFiles(arr => arr.filter((_, i2) => i2 !== idx))}>Remove</button>
                    </div>
                  )
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileInputRef} type="file" className="hidden" multiple onChange={onFilesSelected} />
              <button type="button" className="btn" onClick={onPickFiles}>Attach</button>
              <textarea
                className="textarea textarea-bordered flex-1 min-h-[48px]"
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send() }}
              />
              <button type="button" className={`btn btn-primary ${loading ? 'loading' : ''}`} disabled={(!input.trim() && files.length === 0) || loading} onClick={send}>
                {loading ? 'Sending' : 'Send'}
              </button>
            </div>
          </div>
          <div className="text-xs opacity-60 mt-1">Ctrl/Cmd+Enter to send</div>
        </div>
      </div>
    </div>
  )
}

