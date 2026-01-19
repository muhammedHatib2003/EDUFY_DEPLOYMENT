import axios from 'axios'

const DEFAULT_LOCAL_API_ORIGIN = 'http://localhost:5001'
const DEFAULT_PROD_API_ORIGIN = 'https://edufy-deployment.onrender.com'

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function isNativeLike() {
  try {
    return typeof window !== 'undefined' && !!window?.Capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
}

function resolveApiOrigin() {
  // 1) Build-time env (preferred)
  const envOrigin = normalizeOrigin(import.meta?.env?.VITE_API_URL)
  if (envOrigin) return envOrigin

  // 2) Runtime override (useful for APK builds without env replacement)
  if (typeof window !== 'undefined') {
    const fromGlobal = normalizeOrigin(window.__GRAEDUFY_API_URL__)
    if (fromGlobal) return fromGlobal
    try {
      const fromStorage = normalizeOrigin(window.localStorage.getItem('graedufy_api_url'))
      if (fromStorage) return fromStorage
    } catch {}
  }

  // 3) Safe defaults
  if (import.meta?.env?.PROD || isNativeLike()) return DEFAULT_PROD_API_ORIGIN
  return DEFAULT_LOCAL_API_ORIGIN
}

export const apiBase = `${resolveApiOrigin()}/api`

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
