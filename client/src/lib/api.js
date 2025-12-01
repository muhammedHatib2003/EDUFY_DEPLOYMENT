import axios from 'axios'

export const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001'

export function authedApi(token) {
  return axios.create({
    baseURL: apiBase,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

export default {
  authedApi,
  apiBase,
}
