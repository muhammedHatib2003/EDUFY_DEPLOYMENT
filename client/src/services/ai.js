import { authedApi } from '../lib/api.js'

const http = (token) => authedApi(token)

export const AiService = {
  voiceSummary: (token, data) => http(token).post('/ai/voice-summary', data),
}
