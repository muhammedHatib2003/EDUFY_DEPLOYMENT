import { authedApi } from '../lib/api.js'

export const CourseService = {
  list: async (getToken) => {
    const http = await authedApi(getToken)
    return http.get('/courses')
  },
  getOne: async (getToken, id) => {
    const http = await authedApi(getToken)
    return http.get(`/courses/${id}`)
  },
  create: async (getToken, data) => {
    const http = await authedApi(getToken)
    return http.post('/courses', data)
  },
  update: async (getToken, id, data) => {
    const http = await authedApi(getToken)
    return http.put(`/courses/${id}`, data)
  },
  remove: async (getToken, id) => {
    const http = await authedApi(getToken)
    return http.delete(`/courses/${id}`)
  },
  join: async (getToken, id, code) => {
    const http = await authedApi(getToken)
    return http.post(`/courses/${id}/join`, { code })
  },
  getLessons: async (getToken, courseId) => {
    const http = await authedApi(getToken)
    return http.get(`/courses/${courseId}/lessons`)
  },
  addLesson: async (getToken, courseId, data) => {
    const http = await authedApi(getToken)
    return http.post(`/courses/${courseId}/lessons`, data)
  },
  updateLesson: async (getToken, lessonId, data) => {
    const http = await authedApi(getToken)
    return http.put(`/courses/lessons/${lessonId}`, data)
  },
  deleteLesson: async (getToken, lessonId) => {
    const http = await authedApi(getToken)
    return http.delete(`/courses/lessons/${lessonId}`)
  },
}
