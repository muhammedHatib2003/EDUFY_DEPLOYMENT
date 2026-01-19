import { jsPDF } from 'jspdf'

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

export function downloadSummaryPdf({ summary, transcript, topic, callId, createdAt }) {
  // jsPDF default fonts are not fully Unicode-safe (Turkish chars can break).
  // Render pages to canvas (Unicode-safe via browser fonts) and embed as images.
  const PAGE_W = 794 // ~A4 at 96dpi
  const PAGE_H = 1123
  const SCALE = 2
  const MARGIN = 48
  const LINE_H = 18
  const FONT_STACK = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'

  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W * SCALE
  canvas.height = PAGE_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'top'

  const doc = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H] })
  const created = createdAt || Date.now()
  const heading = 'Live Class Summary'
  const topicText = normalizeText(topic)
  const sumText = normalizeText(summary)
  const trText = normalizeText(transcript)
  const callLabel = normalizeText(callId)

  const wrapText = (text, maxWidth, font) => {
    ctx.font = font
    const lines = []
    const raw = String(text || '')
    const paragraphs = raw.split(/\r?\n/g)
    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p]
      if (!para.trim()) {
        lines.push('')
        continue
      }
      const words = para.split(/\s+/g).filter(Boolean)
      let line = ''
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width <= maxWidth) {
          line = test
        } else {
          if (line) lines.push(line)
          // If a single word is too long, hard-break it.
          if (ctx.measureText(word).width > maxWidth) {
            let chunk = ''
            for (const ch of word) {
              const t = chunk + ch
              if (ctx.measureText(t).width <= maxWidth) {
                chunk = t
              } else {
                if (chunk) lines.push(chunk)
                chunk = ch
              }
            }
            line = chunk
          } else {
            line = word
          }
        }
      }
      if (line) lines.push(line)
      if (p !== paragraphs.length - 1) lines.push('')
    }
    return lines
  }

  const pages = []
  const flushPage = () => {
    const dataUrl = canvas.toDataURL('image/png')
    pages.push(dataUrl)
    // clear
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    ctx.clearRect(0, 0, PAGE_W, PAGE_H)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PAGE_W, PAGE_H)
    ctx.fillStyle = '#111827'
    ctx.textBaseline = 'top'
  }

  // init background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  ctx.fillStyle = '#111827'

  const maxWidth = PAGE_W - MARGIN * 2
  let y = MARGIN

  const drawLine = (text, font) => {
    ctx.font = font
    ctx.fillText(text, MARGIN, y)
    y += LINE_H
  }

  const drawBlock = (text, font) => {
    const lines = wrapText(text, maxWidth, font)
    for (const line of lines) {
      if (y > PAGE_H - MARGIN - LINE_H) {
        flushPage()
        y = MARGIN
      }
      ctx.font = font
      ctx.fillText(line, MARGIN, y)
      y += LINE_H
    }
  }

  drawLine(heading, `700 22px ${FONT_STACK}`)
  y += 6

  const metaFont = `400 13px ${FONT_STACK}`
  if (topicText) drawBlock(`Topic: ${topicText}`, metaFont)
  if (callLabel) drawBlock(`Call ID: ${callLabel}`, metaFont)
  drawBlock(`Created: ${formatStamp(created)}`, metaFont)

  y += 10
  drawLine('Summary', `700 16px ${FONT_STACK}`)
  y += 2
  drawBlock(sumText || 'No summary provided.', `400 14px ${FONT_STACK}`)

  if (trText) {
    y += 12
    drawLine('Transcript', `700 16px ${FONT_STACK}`)
    y += 2
    drawBlock(trText, `400 12.5px ${FONT_STACK}`)
  }

  flushPage()

  pages.forEach((dataUrl, idx) => {
    if (idx > 0) doc.addPage([PAGE_W, PAGE_H], 'p')
    doc.addImage(dataUrl, 'PNG', 0, 0, PAGE_W, PAGE_H)
  })

  const fileBase = safeFileName(`${topicText || 'summary'}-${new Date(created).toISOString().slice(0, 10)}`)
  doc.save(`${fileBase || 'summary'}.pdf`)
}
