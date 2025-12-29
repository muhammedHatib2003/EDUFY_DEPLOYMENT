import api from '../lib/api'

const http = (token) => api.authedApi(token)

export const AiService = {
  voiceSummary: (token, data) => http(token).post('/api/ai/voice-summary', data),
}
