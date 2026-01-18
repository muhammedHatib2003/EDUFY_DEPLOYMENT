import axios from 'axios'

export const apiBase =
  (import.meta.env.VITE_API_URL || 'http://localhost:5001') + '/api'

// NOTE: This function is intentionally synchronous.
// It returns an axios instance immediately (so callers won't accidentally do `authedApi(...).post(...)` on a Promise).
// The auth token is attached per request via an async interceptor.
export function authedApi(getToken) {
  const http = axios.create({ baseURL: apiBase })

  http.interceptors.request.use(async (config) => {
    try {
      const token = typeof getToken === 'function' ? await getToken() : null
      if (token) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // If token retrieval fails, let the request proceed unauthenticated.
    }
    return config
  })

  return http
}
