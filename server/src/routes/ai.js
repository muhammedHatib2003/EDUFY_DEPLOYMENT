import express from 'express'
import Groq, { toFile } from 'groq-sdk'
import axios from 'axios'

const router = express.Router()

const groqApiKey = process.env.GROQ_API_KEY
const groqClient = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null
const groqTextModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'

function requireGroq(res) {
  if (!groqClient) {
    res.status(500).json({ error: 'GROQ_API_KEY not configured' })
    return false
  }
  return true
}

// Sanitize a single string input
function sanitizeText(value, { max = 8000 } = {}) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

// Normalize history for Groq (OpenAI-style chat.completions)
function toGroqHistory(items) {
  if (!Array.isArray(items)) return []
  const out = []
  for (const m of items.slice(-30)) {
    if (!m || typeof m !== 'object') continue
    const roleRaw = typeof m.role === 'string' ? m.role.toLowerCase() : ''
    const text = sanitizeText(m.content)
    if (!text) continue
    let role = 'user'
    if (roleRaw === 'assistant') role = 'assistant'
    else if (roleRaw === 'system') role = 'system'
    out.push({ role, content: text })
  }
  return out
}

// Helpers for data URLs and extraction
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  if (!dataUrl.startsWith('data:')) return null
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) return null
  const header = dataUrl.slice(5, commaIdx) // strip "data:"
  if (!/;base64/i.test(header)) return null
  const mimeMatch = header.match(/^([^;]+)/)
  const mime = mimeMatch ? mimeMatch[1] : ''
  const base64 = dataUrl.slice(commaIdx + 1)
  if (!base64) return null
  return { mime, base64 }
}

function base64ToBuffer(b64) {
  return Buffer.from(b64, 'base64')
}

async function extractPdfText(buffer) {
  try {
    const mod = await import('pdf-parse')
    const pdfParse = mod.default || mod
    const res = await pdfParse(buffer)
    return typeof res?.text === 'string' ? res.text : ''
  } catch {
    return ''
  }
}

async function extractDocxText(buffer) {
  try {
    const mod = await import('mammoth')
    const mammoth = mod.default || mod
    const res = await mammoth.extractRawText({ buffer })
    return typeof res?.value === 'string' ? res.value : ''
  } catch {
    return ''
  }
}

function truncateText(text, max = 12000) {
  if (typeof text !== 'string') return ''
  return text.length > max ? text.slice(0, max) : text
}

// POST /api/ai/chat
// Body: { input: string, history?: [{ role, content }], images?: string[] (data URLs) }
// Returns: { reply: string }
router.post('/chat', async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' })

    const body = req.body || {}
    const input = sanitizeText(body.input)
    const images = Array.isArray(body.images) ? body.images.filter((u) => typeof u === 'string' && /^data:image\//.test(u)) : []
    const files = Array.isArray(body.files) ? body.files.filter(f => f && typeof f.dataUrl === 'string') : []
    if (!input && images.length === 0 && files.length === 0) return res.status(400).json({ error: 'input or files/images required' })
    const history = toGroqHistory(body.history)

  const groq = new Groq({ apiKey })

    // Build image parts and extract text from non-image attachments
    const imageParts = []
    for (const u of images) imageParts.push({ type: 'image_url', image_url: { url: u } })
    let attachmentsText = ''
    for (const f of files.slice(0, 8)) {
      const { dataUrl, name } = f
      const parsed = parseDataUrl(dataUrl)
      if (!parsed) continue
      const { mime, base64 } = parsed
      if (/^image\//.test(mime)) {
        imageParts.push({ type: 'image_url', image_url: { url: dataUrl } })
        continue
      }
      const buf = base64ToBuffer(base64)
      let text = ''
      if (mime === 'application/pdf') {
        text = await extractPdfText(buf)
      } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        text = await extractDocxText(buf)
      } else if (/^text\//.test(mime) || mime === 'application/json' || mime === 'application/xml' || mime === 'application/x-yaml' || mime === 'application/yaml' || mime === 'application/javascript') {
        try {
          text = buf.toString('utf-8')
          if (mime === 'application/json') {
            try { text = JSON.stringify(JSON.parse(text), null, 2) } catch {}
          }
        } catch {}
      }
      text = truncateText(text, 12000)
      if (text) {
        attachmentsText += `\n\nAttachment: ${name || 'file'} (${mime})\n${text}`
      } else {
        attachmentsText += `\n\nAttachment: ${name || 'file'} (${mime})\n[unreadable or unsupported format]`
      }
    }

    const hasImages = imageParts.length > 0
    const textModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    const parseCsv = (s) => (typeof s === 'string' ? s.split(',').map(v => v.trim()).filter(Boolean) : [])
    let visionCandidates = parseCsv(process.env.GROQ_VISION_CANDIDATES)
    if (visionCandidates.length === 0 && process.env.GROQ_VISION_MODEL) visionCandidates = [process.env.GROQ_VISION_MODEL]
    if (visionCandidates.length === 0) visionCandidates = [
      'llama-3.2-90b-vision-preview',
      'llava-v1.6-34b',
      'llava-v1.6-7b',
    ]

    const contentParts = []
    const combinedText = (input || '') + (attachmentsText || '')
    if (combinedText) contentParts.push({ type: 'text', text: truncateText(combinedText, 20000) })
    if (hasImages) {
      const maxImages = 6
      for (const p of imageParts.slice(0, maxImages)) contentParts.push(p)
    }

    const userMessage = contentParts.length > 1
      ? { role: 'user', content: contentParts }
      : { role: 'user', content: combinedText || (hasImages ? '[images attached]' : '') }

    const systemMessage = {
      role: 'system',
      content:
        'You are an in‑app assistant for a web application. '
        + 'Respond directly to the user’s request. If attachments are provided, use the extracted text and/or images included in the current message. '
        + 'Do not give operating‑system or PDF viewer troubleshooting steps. '
        + 'If attachment content is unreadable or unsupported, say so briefly and ask for a reupload or pasted text, then proceed with any available text context.'
    }

    const messages = [ systemMessage, ...history, userMessage ]

    let completion
    if (hasImages) {
      let success = false
      const errs = []
      for (const candidate of visionCandidates) {
        try {
          completion = await groq.chat.completions.create({ model: candidate, messages, temperature: 0.3 })
          success = true
          break
        } catch (e) {
          const msg = (e && e.message) ? String(e.message) : ''
          const code = e?.code || e?.response?.data?.error?.code || ''
          const retryable = /decommissioned|not\s*found|does\s*not\s*exist|not\s*supported/i.test(msg) || /model_/.test(String(code))
          errs.push({ candidate, msg })
          if (!retryable) {
            throw e
          }
          // else try next candidate
        }
      }
      if (!success) {
        // Graceful degrade: ignore images, but keep any extracted attachment text
        const note = `Note: ${images.length} image(s) attached but no vision model is available on this server. Proceeding without image analysis.`
        const degradeText = [input || '', attachmentsText || '', note].filter(Boolean).join('\n\n')
        const fallbackUser = { role: 'user', content: degradeText || 'No text provided.' }
        const fallbackMessages = [ systemMessage, ...history, fallbackUser ]
        completion = await groq.chat.completions.create({ model: textModel, messages: fallbackMessages, temperature: 0.3 })
      }
    } else {
      completion = await groq.chat.completions.create({ model: textModel, messages, temperature: 0.3 })
    }

    const reply = sanitizeText(completion?.choices?.[0]?.message?.content || '', { max: 16000 })
    return res.json({ reply })
  } catch (err) {
    console.error('Groq chat error:', err)
    const status = typeof err?.status === 'number' ? err.status : 500
    const message = typeof err?.message === 'string' && err.message ? err.message : 'Failed to generate AI response'
    return res.status(status).json({ error: message })
  }
})

router.post('/voice-summary', async (req, res) => {
  try {
    if (!requireGroq(res)) return
    const { audioUrl, dataUrl, topic } = req.body || {}
    let audioBuffer = null
    let audioMime = 'audio/webm'

    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      const parsed = parseDataUrl(dataUrl)
      if (!parsed || !/^audio\//.test(parsed.mime)) {
        return res.status(400).json({ error: 'Invalid audio dataUrl' })
      }
      audioBuffer = Buffer.from(parsed.base64, 'base64')
      audioMime = parsed.mime || audioMime
    } else if (typeof audioUrl === 'string') {
      if (!/^https?:\/\//i.test(audioUrl)) {
        return res.status(400).json({ error: 'audioUrl must be http(s)' })
      }
      const audioResp = await axios.get(audioUrl, { responseType: 'arraybuffer' })
      audioBuffer = Buffer.from(audioResp.data)
      const ct = audioResp.headers?.['content-type']
      if (typeof ct === 'string') {
        audioMime = ct.split(';')[0] || audioMime
      }
    } else {
      return res.status(400).json({ error: 'audioUrl or dataUrl is required' })
    }

    const maxBytes = 15 * 1024 * 1024
    if (!audioBuffer || !audioBuffer.length) {
      return res.status(400).json({ error: 'Audio is empty' })
    }
    if (audioBuffer.length > maxBytes) {
      return res.status(400).json({ error: 'Audio too large for transcription. Please record a shorter clip.' })
    }

    const audioFile = await toFile(audioBuffer, 'class-audio.webm', { type: audioMime })
    const transcriptResp = await groqClient.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
    })
    const segmentsText = Array.isArray(transcriptResp?.segments)
      ? transcriptResp.segments.map((s) => s?.text || '').join(' ').trim()
      : ''
    const transcriptText = (transcriptResp?.text || '').trim() || segmentsText
    if (!transcriptText) {
      return res.status(500).json({ error: 'Transcription failed' })
    }

    const summaryResp = await groqClient.chat.completions.create({
      model: groqTextModel,
      messages: [
        {
          role: 'system',
          content: 'Summarize this live class audio into 4-7 bullet points. Be concise and focus on key takeaways.',
        },
        { role: 'user', content: topic ? `${topic}\n\nTranscript:\n${transcriptText.slice(0, 6000)}` : transcriptText.slice(0, 6000) },
      ],
      temperature: 0.2,
      max_tokens: 400,
    })
    const summary = summaryResp?.choices?.[0]?.message?.content?.trim()
    if (!summary) {
      return res.status(500).json({ error: 'Summary generation failed' })
    }

    res.json({
      transcript: transcriptText,
      summary,
    })
  } catch (err) {
    console.error('voice summary error', err)
    const status = typeof err?.status === 'number' ? err.status : 500
    const message = err?.response?.data?.error || err?.message || 'Failed to summarize audio'
    res.status(status).json({ error: message })
  }
})

export default router
