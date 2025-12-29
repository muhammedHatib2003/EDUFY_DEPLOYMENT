import { jsPDF } from 'jspdf'

function normalizeText(value) {
  return typeof value === 'string' ? value : ''
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

export function downloadSummaryPdf({ summary, transcript, topic, callId, createdAt }) {
  const doc = new jsPDF()
  const created = createdAt || Date.now()
  const heading = 'Live Class Summary'
  const topicText = normalizeText(topic)
  const sumText = normalizeText(summary)
  const trText = normalizeText(transcript)
  const callLabel = normalizeText(callId)

  doc.setFontSize(16)
  doc.text(heading, 14, 18)

  doc.setFontSize(11)
  if (topicText) doc.text(`Topic: ${topicText}`, 14, 28)
  if (callLabel) doc.text(`Call ID: ${callLabel}`, 14, 34)
  doc.text(`Created: ${formatStamp(created)}`, 14, 40)

  doc.setFontSize(12)
  doc.text('Summary', 14, 52)
  doc.setFontSize(11)
  const summaryLines = doc.splitTextToSize(sumText || 'No summary provided.', 182)
  doc.text(summaryLines, 14, 60)

  if (trText) {
    let y = 60 + summaryLines.length * 6 + 10
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(12)
    doc.text('Transcript', 14, y)
    doc.setFontSize(10.5)
    const transcriptLines = doc.splitTextToSize(trText, 182)
    doc.text(transcriptLines, 14, y + 8)
  }

  const fileBase = safeFileName(`${topicText || 'summary'}-${new Date(created).toISOString().slice(0, 10)}`)
  doc.save(`${fileBase || 'summary'}.pdf`)
}
