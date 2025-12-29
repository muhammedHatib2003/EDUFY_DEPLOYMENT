import { useEffect, useMemo, useState } from 'react'
import { downloadSummaryPdf } from '../utils/downloadSummaryPdf'

const STORAGE_KEY = 'graedufy_voice_summaries'

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
  const [items, setItems] = useState(loadSummaries)

  // refresh on mount in case another tab added entries
  useEffect(() => {
    setItems(loadSummaries())
  }, [])

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
          <p className="text-sm text-base-content/60">Captured live class recaps from your calls.</p>
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
          No summaries yet. Join a call, record audio, and send a summary to see it here.
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
                  <button
                    className="btn btn-xs btn-outline"
                    onClick={() => downloadSummaryPdf({
                      summary: item.summary,
                      transcript: item.transcript,
                      topic: item.topic,
                      callId: item.callName || item.callId,
                      createdAt: item.createdAt,
                    })}
                  >
                    Download PDF
                  </button>
                </div>
              </div>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap break-words bg-base-200/60 p-3 rounded-lg text-base-content/80">
                  {item.summary || 'No summary text'}
                </pre>
              </div>
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
