import express from 'express'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { OpenRouter } from '@openrouter/sdk'

const router = express.Router()
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null
const geminiModelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
const openRouter = process.env.OPENROUTER_API_KEY
  ? new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : null

function parseModelList(value) {
  if (!value || typeof value !== 'string') return []
  return value
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

const defaultOpenRouterModels = [
  'qwen/qwen3-4b:free',
  'tngtech/deepseek-r1t2-chimera:free',
  'google/gemma-3-4b-it:free',
  'xiaomi/mimo-v2-flash:free',
]

const openRouterModels = (() => {
  const fromModels = parseModelList(process.env.OPENROUTER_MODELS)
  const fromModel = parseModelList(process.env.OPENROUTER_MODEL)
  const merged = [...fromModels, ...fromModel, ...defaultOpenRouterModels]
  return [...new Set(merged)]
})()

function resolveProvider() {
  const forced = (process.env.AI_PROVIDER || '').trim().toLowerCase()
  if (forced) return forced
  if (gemini) return 'gemini'
  if (openRouter) return 'openrouter'
  return 'none'
}

function detectLang(text = '') {
  if (/[\u0600-\u06FF]/.test(text)) return 'Arabic'
  return 'English'
}

function isSummaryRequest(text = '') {
  return /summarize this lesson|summarize the lecture|summarize this class|make a lesson summary|summarize/iu.test(
    text
  )
}

function parseBase64DataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const match = /^data:([^;]+);base64,([\s\S]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  return { mimeType: match[1], base64: match[2] }
}

function approxBytesFromBase64(base64 = '') {
  // Rough conversion: base64 length * 3/4 (ignoring padding/newlines)
  const cleaned = String(base64).replace(/\s+/g, '')
  return Math.ceil((cleaned.length * 3) / 4)
}

function tryParseJsonObject(text = '') {
  const raw = String(text || '').trim()
  const unwrapped = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const start = unwrapped.indexOf('{')
  const end = unwrapped.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const candidate = unwrapped.slice(start, end + 1)
  try {
    const parsed = JSON.parse(candidate)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function isOpenRouterRetryableError(err) {
  const status = err?.status || err?.response?.status
  const message = String(err?.message || err?.response?.data?.error || '').toLowerCase()
  if ([402, 408, 409, 429, 500, 502, 503, 504].includes(Number(status))) return true
  if (message.includes('rate limit')) return true
  if (message.includes('quota')) return true
  if (message.includes('too many request')) return true
  if (message.includes('overloaded')) return true
  return false
}

async function openRouterChatWithFallback({ messages, temperature = 0.3, maxTokens = 900 }) {
  if (!openRouter) throw new Error('OPENROUTER_API_KEY not configured')

  let lastError = null
  for (const model of openRouterModels) {
    try {
      return await openRouter.chat.send({
        model,
        messages,
        stream: false,
        temperature,
        maxTokens,
      })
    } catch (err) {
      lastError = err
      if (!isOpenRouterRetryableError(err)) break
      console.warn('[openrouter] model failed, trying fallback:', model, err?.message || err)
    }
  }

  throw lastError || new Error('OpenRouter request failed')
}

router.post('/chat', async (req, res) => {
  try {
    const provider = resolveProvider()
    if (provider !== 'openrouter' && provider !== 'gemini' && provider !== 'none') {
      return res.status(500).json({ error: `Unsupported AI provider: ${provider}` })
    }
    if (provider === 'openrouter' && !openRouter) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' })
    }
    if (provider === 'gemini' && !gemini) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })
    }
    if (provider === 'none') {
      return res.status(500).json({ error: 'No AI provider configured' })
    }

    const { input, lessonBuffer = '', history = [] } = req.body || {}
    const userInput = typeof input === 'string' ? input.trim() : ''
    if (!userInput) return res.status(400).json({ error: 'input required' })

    const lang = detectLang(userInput)
    const wantSummary = isSummaryRequest(userInput)
    const allowSummary = Boolean(lessonBuffer) && wantSummary

    const baseRules =
      `You are a general-purpose AI assistant.

DEFAULT MODE (STRICT):
- Treat every message as NORMAL CHAT by default.
- Short inputs, numbers, greetings, or simple questions are NOT lessons.
- NEVER generate sections, lecture-style headings, or structured summaries
  unless the user EXPLICITLY asks for a lesson summary.

ABSOLUTE RULES:
- If the user input looks like math, chat, or a short question
  (examples: "hi", "5+5", "50*50", "how are you"),
  respond with a direct and simple answer.
- DO NOT use headings such as:
  "Lecture Overview", "Section", "Core Concepts", or similar
  unless lesson summary mode is explicitly activated.

LESSON SUMMARY MODE (ONLY WHEN TRIGGERED):
Activate this mode ONLY IF:
- The user explicitly asks to summarize a lesson
  (e.g. "summarize this lesson", "bu dersi özetle")
AND
- A lesson transcript is provided.

WHEN IN LESSON SUMMARY MODE:
- Summarize for a student.
- Use a few clear sections (Brief Overview, Key Concepts, Exam Logic).
- Do NOT invent information.
- Keep it concise and readable.

Language:
- Always reply in the user's language.
`

    let systemInstruction = baseRules
    let userPrompt = userInput

    if (allowSummary) {
      const transcript = (lessonBuffer || '').slice(-15000)
      systemInstruction =
        baseRules
        + 'LESSON SUMMARY MODE (only when explicitly requested and transcript provided):\n'
        + '- Summarize for a student. Use short, clear sections such as Brief Overview, Key Concepts, Important Logic/Exam Points.\n'
        + '- Do not invent facts; rely only on provided text.\n'
        + '- Keep it readable and concise, not over-academic.\n'
        + '- If text is missing, say so briefly.'
      userPrompt = `Transcript:\n${transcript}\n\nUser request:\n${userInput}`
    }

    const contentHistory = Array.isArray(history)
      ? history
          .slice(-20)
          .filter((m) => m && typeof m.content === 'string')
          .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            parts: [{ text: m.content }],
          }))
      : []

    let reply = ''
    if (provider === 'openrouter') {
      const response = await openRouterChatWithFallback({
        messages: [
          { role: 'system', content: systemInstruction },
          ...contentHistory.map((m) => ({ role: m.role, content: m.parts?.[0]?.text || '' })),
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 900,
      })

      const messageContent = response?.choices?.[0]?.message?.content
      if (Array.isArray(messageContent)) {
        reply = messageContent.map((item) => (item?.type === 'text' ? item.text : '')).join('')
      } else if (typeof messageContent === 'string') {
        reply = messageContent
      }
    } else {
      const model = gemini.getGenerativeModel({
        model: geminiModelName,
        systemInstruction,
      })

      const response = await model.generateContent({
        contents: [
          ...contentHistory,
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
      })

      reply = response?.response?.text?.() || ''
    }
    return res.json({ reply })
  } catch (e) {
    console.error('ai.routes chat error', e)
    res.status(500).json({ error: 'AI failed' })
  }
})

// Audio -> transcript + summary (Gemini only)
router.post('/voice-summary', async (req, res) => {
  try {
    const provider = resolveProvider()
    if (provider === 'none') return res.status(500).json({ error: 'No AI provider configured' })
    if (provider !== 'gemini') {
      return res.status(400).json({
        error: 'Voice summary currently requires Gemini. Set GEMINI_API_KEY (and optionally AI_PROVIDER=gemini).',
      })
    }
    if (!gemini) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })

    const { dataUrl, topic = '' } = req.body || {}
    const parsed = parseBase64DataUrl(dataUrl)
    if (!parsed) return res.status(400).json({ error: 'dataUrl must be a base64 data URL (data:audio/...;base64,...)' })
    if (!String(parsed.mimeType || '').toLowerCase().startsWith('audio/')) {
      return res.status(400).json({ error: `Unsupported mimeType: ${parsed.mimeType}` })
    }

    const bytes = approxBytesFromBase64(parsed.base64)
    if (bytes > 12 * 1024 * 1024) {
      return res.status(400).json({ error: 'Audio is too large (max ~12MB). Record a shorter clip.' })
    }

    const audioModelName = process.env.GEMINI_AUDIO_MODEL || geminiModelName

    const systemInstruction =
      `You transcribe and summarize audio for students.\n` +
      `Return ONLY valid JSON with exactly these keys:\n` +
      `{"transcript":"...","summary":"..."}\n` +
      `Rules:\n` +
      `- transcript: the verbatim transcript in the original language.\n` +
      `- summary: concise student-friendly summary in the same language.\n` +
      `- Do not add extra keys or markdown.\n`

    const prompt =
      `Task:\n` +
      `1) Transcribe the audio.\n` +
      `2) Summarize it.\n` +
      (topic ? `Topic hint: ${String(topic).slice(0, 200)}\n` : '')

    const model = gemini.getGenerativeModel({
      model: audioModelName,
      systemInstruction,
    })

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
    })

    const text = response?.response?.text?.() || ''
    const obj = tryParseJsonObject(text) || {}
    const transcript = typeof obj.transcript === 'string' ? obj.transcript : ''
    const summary = typeof obj.summary === 'string' ? obj.summary : (text || '')

    return res.json({ transcript, summary })
  } catch (e) {
    console.error('ai.routes voice-summary error', e)
    return res.status(500).json({ error: 'Voice summary failed' })
  }
})

export default router
