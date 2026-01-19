import express from 'express'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { OpenRouter } from '@openrouter/sdk'
import puppeteer from 'puppeteer'

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
  const t = String(text || '')
  if (/[\u0600-\u06FF]/.test(t)) return 'Arabic'

  // Heuristic for Turkish (helps the model respond in Turkish more reliably).
  // Covers both proper Turkish characters and ASCII-only transliterations.
  if (/[ğüşöçıİĞÜŞÖÇ]/.test(t)) return 'Turkish'
  if (/\b(özetle|ozetle|özet|ozet|lütfen|lutfen|merhaba|ders|sınıf|sinif|öğrenci|ogrenci|hocam)\b/iu.test(t)) {
    return 'Turkish'
  }

  return 'English'
}

function isSummaryRequest(text = '') {
  return /\b(summarize this lesson|summarize the lecture|summarize this class|make a lesson summary|summarize|summary|özetle|ozetle|özet|ozet)\b/iu.test(
    String(text || '')
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
  const safeJson = (value) => {
    if (!value) return null
    if (typeof value === 'object') return value
    if (typeof value !== 'string') return null
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  const bodyJson = safeJson(err?.body)
  const responseDataJson = safeJson(err?.response?.data)

  const status =
    err?.status ||
    err?.statusCode ||
    err?.response?.status ||
    err?.response?.statusCode ||
    bodyJson?.error?.code ||
    responseDataJson?.error?.code

  const message = String(
    err?.message ||
      responseDataJson?.error?.message ||
      bodyJson?.error?.message ||
      err?.response?.data?.error ||
      ''
  ).toLowerCase()

  if ([402, 408, 409, 429, 500, 502, 503, 504].includes(Number(status))) return true
  if (message.includes('rate limit')) return true
  if (message.includes('quota')) return true
  if (message.includes('too many request')) return true
  if (message.includes('overloaded')) return true
  if (message.includes('temporarily rate-limited')) return true
  return false
}

async function openRouterChatWithFallback({ messages, temperature = 0.3, maxTokens = 900, models }) {
  if (!openRouter) throw new Error('OPENROUTER_API_KEY not configured')

  let lastError = null
  const modelsToTry = Array.isArray(models) && models.length ? models : openRouterModels
  for (const model of modelsToTry) {
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
      console.warn('[openrouter] model failed, trying fallback:', model, err?.status || err?.statusCode || err?.message || err)
    }
  }

  throw lastError || new Error('OpenRouter request failed')
}

function sortModelsByPriority(models, priorityList) {
  const list = Array.isArray(models) ? models : []
  const priority = new Map((priorityList || []).map((m, i) => [m, i]))
  return [...list].sort((a, b) => (priority.get(a) ?? 999) - (priority.get(b) ?? 999))
}

function safeFileName(base) {
  return String(base || '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatStamp(ts) {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
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
- Reply in ${lang}.
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
    const { transcript: rawTranscript = '', dataUrl, topic = '' } = req.body || {}

    // Path A (free-ish): client provides transcript (e.g. browser SpeechRecognition) and we only summarize via /chat provider.
    const transcript = typeof rawTranscript === 'string' ? rawTranscript.trim() : ''
    if (transcript) {
      if (provider === 'none') return res.status(500).json({ error: 'No AI provider configured' })
      const lang = detectLang(transcript)

      const systemInstruction =
        `You summarize classroom transcripts for students.\n` +
        `Rules:\n` +
        `- Reply in ${lang}.\n` +
        `- Return ONLY the summary text (no headings).\n` +
        `- Fix obvious speech-to-text errors and remove filler words.\n` +
        `- Be clear and faithful to the transcript.\n` +
        `- Aim for a medium-length summary (about 8-12 sentences).\n` +
        `- Include key concepts, steps, and outcomes.\n` +
        (lang === 'Turkish'
          ? `- Use proper Turkish characters (ğ, ü, ş, ı, İ, ö, ç). Do NOT replace them with digits/underscores.\n`
          : '')

      const userPrompt =
        `Summarize this transcript in a student-friendly way.\n` +
        `Make it detailed enough that a student can study from it.\n` +
        (topic ? `Topic hint: ${String(topic).slice(0, 200)}\n` : '') +
        `\nTranscript:\n${transcript}\n`

      let summary = ''
      if (provider === 'openrouter') {
        const priorityList =
          lang === 'Turkish'
            ? [
                'qwen/qwen3-4b:free',
                'tngtech/deepseek-r1t2-chimera:free',
                'google/gemma-3-4b-it:free',
                'xiaomi/mimo-v2-flash:free',
              ]
            : [
                'google/gemma-3-4b-it:free',
                'tngtech/deepseek-r1t2-chimera:free',
                'xiaomi/mimo-v2-flash:free',
                'qwen/qwen3-4b:free',
              ]

        const response = await openRouterChatWithFallback({
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt },
          ],
          models: sortModelsByPriority(openRouterModels, priorityList),
          temperature: 0.2,
          maxTokens: 1000,
        })
        const messageContent = response?.choices?.[0]?.message?.content
        if (Array.isArray(messageContent)) {
          summary = messageContent.map((item) => (item?.type === 'text' ? item.text : '')).join('')
        } else if (typeof messageContent === 'string') {
          summary = messageContent
        }
      } else if (provider === 'gemini') {
        const model = gemini.getGenerativeModel({
          model: geminiModelName,
          systemInstruction,
        })
        const response = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
        })
        summary = response?.response?.text?.() || ''
      } else {
        return res.status(500).json({ error: `Unsupported AI provider: ${provider}` })
      }

      return res.json({ transcript, summary })
    }

    // Path B: server-side audio transcription (requires Gemini multimodal).
    if (!gemini) {
      return res.status(400).json({
        error:
          'No transcript provided. Enable browser speech-to-text (recommended) or set GEMINI_API_KEY on the server for audio transcription.',
      })
    }

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
    const finalTranscript = typeof obj.transcript === 'string' ? obj.transcript : ''
    const summary = typeof obj.summary === 'string' ? obj.summary : (text || '')

    return res.json({ transcript: finalTranscript, summary })
  } catch (e) {
    console.error('ai.routes voice-summary error', e)
    return res.status(500).json({ error: 'Voice summary failed' })
  }
})

// Server-side PDF generation (Unicode-safe) using Puppeteer + Arial (or system sans-serif fallback).
router.post('/summary-pdf', async (req, res) => {
  let browser = null
  try {
    const { summary = '', transcript = '', topic = '', callId = '', createdAt } = req.body || {}
    const created = createdAt || Date.now()

    const heading = 'Live Class Summary'
    const topicText = String(topic || '').trim()
    const callLabel = String(callId || '').trim()
    const sumText = String(summary || '').trim()
    const trText = String(transcript || '').trim()

    const html = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { size: A4; margin: 16mm; }
      html, body { padding: 0; margin: 0; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111827;
        font-size: 12.5px;
        line-height: 1.45;
      }
      h1 { font-size: 20px; margin: 0 0 10px 0; }
      h2 { font-size: 14px; margin: 16px 0 6px 0; }
      .meta { color: #374151; font-size: 12px; }
      .meta div { margin: 2px 0; }
      .box {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 10px 12px;
        background: #fafafa;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <h1>${heading}</h1>
    <div class="meta">
      ${topicText ? `<div><strong>Topic:</strong> ${topicText.replace(/</g, '&lt;')}</div>` : ''}
      ${callLabel ? `<div><strong>Call ID:</strong> ${callLabel.replace(/</g, '&lt;')}</div>` : ''}
      <div><strong>Created:</strong> ${formatStamp(created).replace(/</g, '&lt;')}</div>
    </div>
    <h2>Summary</h2>
    <div class="box">${(sumText || 'No summary provided.').replace(/</g, '&lt;')}</div>
    ${trText ? `<h2>Transcript</h2><div class="box">${trText.replace(/</g, '&lt;')}</div>` : ''}
  </body>
</html>`

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })

    const fileBase = safeFileName(`${topicText || 'summary'}-${new Date(created).toISOString().slice(0, 10)}`) || 'summary'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`)
    return res.status(200).send(pdf)
  } catch (e) {
    console.error('ai.routes summary-pdf error', e)
    return res.status(500).json({ error: 'PDF generation failed' })
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
    }
  }
})

export default router
