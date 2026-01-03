import axios from 'axios'

export const apiBase =
  (import.meta.env.VITE_API_URL || 'http://localhost:5001') + '/api'

export async function authedApi(getToken) {
  const token = await getToken()

  return axios.create({
    baseURL: apiBase,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}
