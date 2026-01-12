import express from 'express'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { OpenRouter } from '@openrouter/sdk'

const router = express.Router()
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null
const geminiModelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
const openRouter = process.env.OPENROUTER_API_KEY
  ? new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : null
const openRouterModel = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'

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
      const response = await openRouter.chat.send({
        model: openRouterModel,
        messages: [
          { role: 'system', content: systemInstruction },
          ...contentHistory.map((m) => ({ role: m.role, content: m.parts?.[0]?.text || '' })),
          { role: 'user', content: userPrompt },
        ],
        stream: false,
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

export default router
