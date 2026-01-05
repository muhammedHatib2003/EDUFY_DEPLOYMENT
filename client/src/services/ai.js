import { authedApi } from '../lib/api.js'

export const AiService = {
  voiceSummary: async (getToken, data) => {
    const http = await authedApi(getToken)
    return http.post('/ai/voice-summary', data)
  },
}
