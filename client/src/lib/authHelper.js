import { getToken, buildClerkRequest } from '@clerk/clerk-react'

export const authHelper = {
  async getToken() {
    try {
      return await getToken({ template: 'default' })
    } catch (e) {
      return null
    }
  },
}

