import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { authedApi } from '../lib/api.js'
import { downloadSummaryPdf } from '../utils/downloadSummaryPdf'
import { downloadSummaryTxt } from '../utils/downloadSummaryTxt'

const STORAGE_KEY = 'graedufy_voice_summaries'
const MIN_TRANSCRIPT_LEN = 20

function loadSummaries() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((i) => i && typeof i === 'object')
      .map((i) => ({ ...i, createdAt: i.createdAt || Date.now() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  } catch {
    return []
  }
}

function saveSummaries(items) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {}
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

export default function Summaries() {
  const { getToken } = useAuth()
  const [items, setItems] = useState(loadSummaries)
  const [busyId, setBusyId] = useState('')
  const [itemError, setItemError] = useState({})
  const [pdfBusyId, setPdfBusyId] = useState('')

  // refresh on mount in case another tab added entries
  useEffect(() => {
    setItems(loadSummaries())
  }, [])

  const updateItem = (id, patch) => {
    setItems((prev) => {
      const next = prev.map((it) => (String(it.id || it.createdAt) === String(id) ? { ...it, ...patch } : it))
      saveSummaries(next)
      return next
    })
  }

  const removeItem = (id) => {
    setItems((prev) => {
      const next = prev.filter((it) => String(it.id || it.createdAt) !== String(id))
      saveSummaries(next)
      return next
    })
  }

  const summarizeTranscript = async (item) => {
    const id = item?.id || item?.createdAt
    const transcript = String(item?.transcript || '').trim()
    if (!id) return
    if (busyId) return
    if (transcript.length < MIN_TRANSCRIPT_LEN) {
      setItemError((e) => ({ ...e, [id]: 'Transcript is too short to summarize.' }))
      return
    }

    setBusyId(String(id))
    setItemError((e) => ({ ...e, [id]: '' }))

    try {
      const http = await authedApi(getToken)
      const topic = String(item?.topic || '').trim()

      // Prefer transcript-only endpoint; fall back to /ai/chat if deployment still requires Gemini for /voice-summary.
      let summary = ''
      let finalTranscript = transcript
      try {
        const { data } = await http.post('/ai/voice-summary', { transcript, topic })
        finalTranscript = data?.transcript || transcript
        summary = data?.summary || ''
      } catch (e) {
        const serverMsg = String(e?.response?.data?.error || e?.message || '')
        const isGeminiRequired =
          /gemini/i.test(serverMsg) ||
          /gemini_api_key/i.test(serverMsg) ||
          /requires gemini/i.test(serverMsg)
        if (!isGeminiRequired) throw e

        const topicHint = topic ? `Topic hint: ${topic}\n` : ''
        const requestInput =
          `Summarize the following transcript in a student-friendly way.\n` +
          `Make it medium-length (about 8-12 sentences) so it's useful for studying.\n` +
          `No headings; return only the summary text.\n` +
          `Reply in the same language as the transcript.\n` +
          `${topicHint}` +
          `\nTranscript:\n${transcript}\n`
        const { data } = await http.post('/ai/chat', { input: requestInput })
        summary = data?.reply || ''
      }

      if (!String(summary || '').trim()) {
        setItemError((e) => ({ ...e, [id]: 'AI returned an empty summary. Please try again.' }))
        return
      }

      updateItem(id, { transcript: finalTranscript, summary })
    } catch (err) {
      console.error('summarize transcript error', err)
      const idKey = item?.id || item?.createdAt
      setItemError((e) => ({
        ...e,
        [idKey]: String(err?.response?.data?.error || err?.message || 'Failed to summarize transcript'),
      }))
    } finally {
      setBusyId('')
    }
  }

  const downloadPdf = async (item) => {
    const id = item?.id || item?.createdAt
    if (!id) return
    if (pdfBusyId) return
    setPdfBusyId(String(id))
    setItemError((e) => ({ ...e, [id]: '' }))
    try {
      const http = authedApi(getToken)
      const res = await http.post(
        '/ai/summary-pdf',
        {
          summary: item.summary || '',
          transcript: item.transcript || '',
          topic: item.topic || '',
          callId: item.callName || item.callId || '',
          createdAt: item.createdAt,
        },
        { responseType: 'blob' }
      )
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'summary.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => {
        try { URL.revokeObjectURL(url) } catch {}
      }, 1000)
    } catch (err) {
      // Fallback to client-side PDF (may not preserve Turkish chars as text).
      try {
        downloadSummaryPdf({
          summary: item.summary,
          transcript: item.transcript,
          topic: item.topic,
          callId: item.callName || item.callId,
          createdAt: item.createdAt,
        })
        setItemError((e) => ({ ...e, [id]: 'Server PDF failed; used fallback PDF. Use TXT for perfect Turkish characters.' }))
      } catch {
        setItemError((e) => ({
          ...e,
          [id]: String(err?.response?.data?.error || err?.message || 'Failed to download PDF'),
        }))
      }
    } finally {
      setPdfBusyId('')
    }
  }

  const handleClear = () => {
    setItems([])
    saveSummaries([])
  }

  const total = useMemo(() => items.length, [items])

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Summaries</h1>
          <p className="text-sm text-base-content/60">Saved transcripts and generated summaries from your calls.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="badge badge-neutral">{total} saved</div>
          {total > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClear}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {total === 0 ? (
        <div className="p-6 rounded-xl border border-dashed bg-base-200/60 text-base-content/70">
          No transcripts yet. Join a call, record, then save the transcript to see it here.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <article key={item.id || item.createdAt} className="rounded-xl border bg-base-100 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="space-y-1">
                  <div className="font-semibold text-base">
                    {item.topic?.trim() || 'Live class summary'}
                  </div>
                  <div className="text-xs text-base-content/60">
                    {formatDate(item.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(item.callName || item.callId) && (
                    <div className="badge badge-outline">{item.callName || item.callId}</div>
                  )}
                  {!item.summary && item.transcript && (
                    <button
                      className={`btn btn-xs btn-primary ${busyId === String(item.id || item.createdAt) ? 'loading' : ''}`}
                      disabled={busyId && busyId !== String(item.id || item.createdAt)}
                      onClick={() => summarizeTranscript(item)}
                      title="Generate AI summary for this transcript"
                    >
                      {busyId === String(item.id || item.createdAt) ? 'Working...' : 'Generate summary'}
                    </button>
                  )}
                  <button
                    className="btn btn-xs btn-outline"
                    disabled={pdfBusyId && pdfBusyId !== String(item.id || item.createdAt)}
                    onClick={() => downloadPdf(item)}
                  >
                    {pdfBusyId === String(item.id || item.createdAt) ? 'Downloading...' : 'Download PDF'}
                  </button>
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={() => downloadSummaryTxt({
                      summary: item.summary,
                      transcript: item.transcript,
                      topic: item.topic,
                      callId: item.callName || item.callId,
                      createdAt: item.createdAt,
                    })}
                  >
                    Download TXT
                  </button>
                  <button className="btn btn-xs btn-ghost" onClick={() => removeItem(item.id || item.createdAt)}>
                    Delete
                  </button>
                </div>
              </div>
              {itemError[item.id || item.createdAt] && (
                <div className="text-sm text-error mb-2">{itemError[item.id || item.createdAt]}</div>
              )}
              {item.summary ? (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap break-words bg-base-200/60 p-3 rounded-lg text-base-content/80">
                    {item.summary}
                  </pre>
                </div>
              ) : (
                <div className="text-sm text-base-content/60">
                  No summary yet. Use “Generate summary”.
                </div>
              )}
              {item.transcript && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-primary">Transcript preview</summary>
                  <div className="mt-2 text-sm text-base-content/80 whitespace-pre-wrap break-words max-h-48 overflow-auto border border-base-300 rounded-lg p-3 bg-base-200/40">
                    {item.transcript}
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
