import User from '../models/User.js'

const MAX_HANDLE_LENGTH = 30 // includes '@'
const MAX_BASE_LENGTH = 24 // base without '@', leaving room for suffix

export function normalizeHandle(input) {
  if (!input || typeof input !== 'string') return ''
  let h = input.trim().toLowerCase()
  if (h.startsWith('@')) h = h.slice(1)
  // Keep alphanumerics and underscores only
  h = h.replace(/[^a-z0-9_]/g, '')
  // Collapse consecutive underscores and trim from ends
  h = h.replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (h.length > MAX_BASE_LENGTH) h = h.slice(0, MAX_BASE_LENGTH)
  return h
}

export async function generateUniqueHandle(preferredBase) {
  let base = normalizeHandle(preferredBase) || 'user'

  // initial candidate
  let candidate = `@${base}`
  if (candidate.length > MAX_HANDLE_LENGTH) {
    candidate = `@${base.slice(0, MAX_HANDLE_LENGTH - 1)}`
  }
  if (!(await User.exists({ handle: candidate }))) {
    return candidate
  }

  // add numeric suffix; start with random 3-digit then increment
  let suffix = Math.floor(100 + Math.random() * 900)
  let attempt = 0
  while (attempt < 10000) {
    const suffixed = `@${base}${suffix}`
    const allowedBaseLen = Math.max(1, MAX_HANDLE_LENGTH - (String(suffix).length + 1))
    const truncated = suffixed.length > MAX_HANDLE_LENGTH ? `@${base.slice(0, allowedBaseLen)}${suffix}` : suffixed
    // eslint-disable-next-line no-await-in-loop
    if (!(await User.exists({ handle: truncated }))) {
      return truncated
    }
    suffix += 1
    attempt += 1
  }

  // extreme fallback with timestamp tail
  const ts = Date.now().toString().slice(-6)
  const allowedBaseLen = Math.max(1, MAX_HANDLE_LENGTH - (ts.length + 1))
  return `@${base.slice(0, allowedBaseLen)}${ts}`
}

