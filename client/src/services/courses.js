import api from '../lib/api'

const http = (token) => api.authedApi(token)

export const CourseService = {
  list: (token) => http(token).get('/api/courses'),
  getOne: (token, id) => http(token).get(`/api/courses/${id}`),
  create: (token, data) => http(token).post('/api/courses', data),
  update: (token, id, data) => http(token).put(`/api/courses/${id}`, data),
  remove: (token, id) => http(token).delete(`/api/courses/${id}`),
  join: (token, id, code) => http(token).post(`/api/courses/${id}/join`, { code }),
  getLessons: (token, courseId) => http(token).get(`/api/courses/${courseId}/lessons`),
  addLesson: (token, courseId, data) => http(token).post(`/api/courses/${courseId}/lessons`, data),
  updateLesson: (token, lessonId, data) => http(token).put(`/api/courses/lessons/${lessonId}`, data),
  deleteLesson: (token, lessonId) => http(token).delete(`/api/courses/lessons/${lessonId}`),
}
