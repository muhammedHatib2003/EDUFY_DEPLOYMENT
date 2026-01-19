function normalizeText(value) {
  return typeof value === 'string' ? value.normalize('NFC') : ''
}

function formatStamp(ts) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

function safeFileName(base) {
  return base.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function downloadSummaryTxt({ summary, transcript, topic, callId, createdAt }) {
  const created = createdAt || Date.now()
  const topicText = normalizeText(topic)
  const sumText = normalizeText(summary)
  const trText = normalizeText(transcript)
  const callLabel = normalizeText(callId)

  const text =
    `Live Class Summary\n` +
    (topicText ? `Topic: ${topicText}\n` : '') +
    (callLabel ? `Call ID: ${callLabel}\n` : '') +
    `Created: ${formatStamp(created)}\n` +
    `\n` +
    `Summary:\n` +
    `${sumText || 'No summary provided.'}\n` +
    (trText ? `\nTranscript:\n${trText}\n` : '')

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const fileBase = safeFileName(`${topicText || 'summary'}-${new Date(created).toISOString().slice(0, 10)}`)
  a.href = url
  a.download = `${fileBase || 'summary'}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => {
    try { URL.revokeObjectURL(url) } catch {}
  }, 1000)
}

