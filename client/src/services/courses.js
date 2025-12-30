import api from '../lib/api'

const http = (token) => api.authedApi(token)

export const CourseService = {
  list: (token) => http(token).get('/courses'),
  getOne: (token, id) => http(token).get(`/courses/${id}`),
  create: (token, data) => http(token).post('/courses', data),
  update: (token, id, data) => http(token).put(`/courses/${id}`, data),
  remove: (token, id) => http(token).delete(`/courses/${id}`),
  join: (token, id, code) => http(token).post(`/courses/${id}/join`, { code }),
  getLessons: (token, courseId) => http(token).get(`/courses/${courseId}/lessons`),
  addLesson: (token, courseId, data) => http(token).post(`/courses/${courseId}/lessons`, data),
  updateLesson: (token, lessonId, data) => http(token).put(`/courses/lessons/${lessonId}`, data),
  deleteLesson: (token, lessonId) => http(token).delete(`/courses/lessons/${lessonId}`),
}
