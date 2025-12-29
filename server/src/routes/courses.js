import express from 'express'
import { z } from 'zod'
import Course from '../models/Course.js'
import User from '../models/User.js'
import Enrollment from '../models/Enrollment.js'
import Lesson from '../models/Lesson.js'

const router = express.Router()

const CoursePayload = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  thumbnail: z.string().trim().url().or(z.literal('')).optional(),
  joinType: z.enum(['free', 'code']),
  joinCode: z.string().trim().min(3).max(30).optional(),
})

const LessonPayload = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(1000),
  content: z.string().trim().max(8000).optional(),
  videoUrl: z.string().trim().url(),
  order: z.number().int().positive().optional(),
})

function requireClerkId(req, res) {
  const clerkId = req.auth?.userId
  if (!clerkId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return clerkId
}

async function requireUser(req, res) {
  const clerkId = requireClerkId(req, res)
  if (!clerkId) return null
  const user = await User.findOne({ clerkId })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return null
  }
  return user
}

function isTeacher(user) {
  return user?.role === 'teacher'
}

function formatCourse(course, extra = {}) {
  if (!course) return null
  return {
    _id: course._id,
    title: course.title,
    description: course.description,
    teacherId: course.teacherId,
    teacherName: course.teacherName,
    joinType: course.joinType,
    createdAt: course.createdAt,
    ...extra,
  }
}

// Helpers
function ensureLessonBody(data) {
  const hasVideo = typeof data.videoUrl === 'string' && data.videoUrl.trim().length > 0
  if (!hasVideo) return 'Lesson requires a video URL'
  try {
    const u = new URL(data.videoUrl.trim())
    if (!['http:', 'https:'].includes(u.protocol)) return 'Video URL must be http/https'
  } catch {
    return 'Video URL must be valid'
  }
  return null
}

// Create course (teacher only)
router.post('/', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    if (!isTeacher(user)) return res.status(403).json({ error: 'Only teachers can create courses' })

    const parsed = CoursePayload.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() })
    }
    const data = parsed.data
    const joinType = data.joinType
    const code = data.joinType === 'code' ? (data.joinCode || '').trim() : null
    if (joinType === 'code' && !code) return res.status(400).json({ error: 'joinCode required for code courses' })

    const teacherName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.handle || 'Teacher'
    const course = await Course.create({
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail || null,
      joinType,
      joinCode: code,
      teacherId: user._id,
      teacherClerkId: user.clerkId,
      teacherName,
    })

    res.status(201).json({ course: formatCourse(course, { joinType: course.joinType, thumbnail: course.thumbnail }) })
  } catch (err) {
    console.error('create course error', err)
    res.status(500).json({ error: 'Failed to create course', details: err.message })
  }
})

// Public list of courses
router.get('/', async (_req, res) => {
  try {
    const courses = await Course.find({}, 'title description teacherName joinType createdAt teacherId thumbnail').sort({ createdAt: -1 })
    res.json({ courses: courses.map(c => formatCourse(c, { thumbnail: c.thumbnail })) })
  } catch (err) {
    console.error('list courses error', err)
    res.status(500).json({ error: 'Failed to list courses' })
  }
})

// Public course detail (with enrollment flags when authenticated)
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
    if (!course) return res.status(404).json({ error: 'Course not found' })

    let isOwner = false
    let isEnrolled = false

    if (req.auth?.userId) {
      const me = await User.findOne({ clerkId: req.auth.userId })
      if (me) {
        isOwner = String(course.teacherId) === String(me._id)
        if (isOwner) {
          isEnrolled = true
        } else {
          const enrollment = await Enrollment.findOne({ courseId: course._id, userId: me._id })
          isEnrolled = !!enrollment
        }
      }
    }

    res.json({
      course: formatCourse(course, {
        isOwner,
        isEnrolled,
        joinType: course.joinType,
        thumbnail: course.thumbnail,
      })
    })
  } catch (err) {
    console.error('get course error', err)
    res.status(500).json({ error: 'Failed to fetch course' })
  }
})

// Join course (FREE or CODE)
router.post('/:id/join', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    if (user.role !== 'student') return res.status(403).json({ error: 'Only students can join courses' })
    const course = await Course.findById(req.params.id)
    if (!course) return res.status(404).json({ error: 'Course not found' })

    if (course.joinType === 'code') {
      const code = (req.body?.code || '').trim()
      if (!code || code !== course.joinCode) return res.status(400).json({ error: 'Invalid join code' })
    }

    try {
      const enrollment = await Enrollment.create({ userId: user._id, courseId: course._id })
      return res.status(201).json({ message: 'Joined', enrollmentId: enrollment._id, courseId: course._id })
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ error: 'Already enrolled' })
      throw err
    }
  } catch (err) {
    console.error('join course error', err)
    res.status(500).json({ error: 'Failed to join course' })
  }
})

// Update course (teacher owner)
router.put('/:id', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    if (!isTeacher(user)) return res.status(403).json({ error: 'Only teachers can edit courses' })
    const course = await Course.findById(req.params.id)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    if (String(course.teacherId) !== String(user._id)) return res.status(403).json({ error: 'Not course owner' })

    const parsed = CoursePayload.partial().safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() })
    }
    const data = parsed.data
    const nextJoinType = data.joinType || course.joinType
    const nextJoinCode = nextJoinType === 'code'
      ? (data.joinCode || course.joinCode || '').trim()
      : null
    if (nextJoinType === 'code' && !nextJoinCode) return res.status(400).json({ error: 'joinCode required for code courses' })

    if (data.title) course.title = data.title
    if (data.description) course.description = data.description
    if (typeof data.thumbnail === 'string') course.thumbnail = data.thumbnail || null
    course.joinType = nextJoinType
    course.joinCode = nextJoinCode
    await course.save()
    res.json({ course: formatCourse(course, { joinType: course.joinType, thumbnail: course.thumbnail }) })
  } catch (err) {
    console.error('update course error', err)
    res.status(500).json({ error: 'Failed to update course' })
  }
})

// Delete course (teacher owner)
router.delete('/:id', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    if (!isTeacher(user)) return res.status(403).json({ error: 'Only teachers can delete courses' })
    const course = await Course.findById(req.params.id)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    if (String(course.teacherId) !== String(user._id)) return res.status(403).json({ error: 'Not course owner' })

    await Enrollment.deleteMany({ courseId: course._id })
    await Lesson.deleteMany({ courseId: course._id })
    await course.deleteOne()
    res.json({ message: 'Course deleted' })
  } catch (err) {
    console.error('delete course error', err)
    res.status(500).json({ error: 'Failed to delete course' })
  }
})

// List lessons (enrolled users or teacher)
router.get('/:courseId/lessons', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    const course = await Course.findById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    const isOwner = String(course.teacherId) === String(user._id)
    if (!isOwner) {
      const enrollment = await Enrollment.findOne({ courseId: course._id, userId: user._id })
      if (!enrollment) return res.status(403).json({ error: 'Not enrolled' })
    }

    const lessons = await Lesson.find({ courseId: course._id }).sort({ order: 1, createdAt: 1 })
    res.json({ lessons })
  } catch (err) {
    console.error('list lessons error', err)
    res.status(500).json({ error: 'Failed to fetch lessons' })
  }
})

// Publish lesson (teacher owner)
router.post('/:courseId/lessons', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    if (!isTeacher(user)) return res.status(403).json({ error: 'Only teachers can add lessons' })
    const course = await Course.findById(req.params.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    if (String(course.teacherId) !== String(user._id)) return res.status(403).json({ error: 'Not course owner' })

    const parsed = LessonPayload.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() })
    }
    const errMsg = ensureLessonBody(parsed.data)
    if (errMsg) return res.status(400).json({ error: errMsg })

    // If order not provided, append to end
    const nextOrder = parsed.data.order || ((await Lesson.countDocuments({ courseId: course._id })) + 1)
    const lesson = await Lesson.create({
      courseId: course._id,
      title: parsed.data.title,
      description: parsed.data.description,
      content: parsed.data.content?.trim() || '',
      videoUrl: parsed.data.videoUrl, // normalized in ensureLessonBody
      order: nextOrder,
      createdBy: user._id,
    })

    res.status(201).json({ lesson })
  } catch (err) {
    console.error('create lesson error', err)
    res.status(500).json({ error: 'Failed to publish lesson' })
  }
})

// Edit lesson (teacher owner)
router.put('/lessons/:id', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    if (!isTeacher(user)) return res.status(403).json({ error: 'Only teachers can edit lessons' })
    const lesson = await Lesson.findById(req.params.id)
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
    const course = await Course.findById(lesson.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    if (String(course.teacherId) !== String(user._id)) return res.status(403).json({ error: 'Not course owner' })

    const parsed = LessonPayload.partial().safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() })
    }
    const data = parsed.data
    if (data.title) lesson.title = data.title
    if (data.description) lesson.description = data.description
    if (typeof data.content === 'string') lesson.content = data.content.trim()
    if (typeof data.videoUrl === 'string') lesson.videoUrl = data.videoUrl.trim()
    if (typeof data.order === 'number') lesson.order = data.order

    const errMsg = ensureLessonBody(lesson)
    if (errMsg) return res.status(400).json({ error: errMsg })

    await lesson.save()
    res.json({ lesson })
  } catch (err) {
    console.error('update lesson error', err)
    res.status(500).json({ error: 'Failed to update lesson' })
  }
})

// Delete lesson (teacher owner)
router.delete('/lessons/:id', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    if (!isTeacher(user)) return res.status(403).json({ error: 'Only teachers can delete lessons' })
    const lesson = await Lesson.findById(req.params.id)
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' })
    const course = await Course.findById(lesson.courseId)
    if (!course) return res.status(404).json({ error: 'Course not found' })
    if (String(course.teacherId) !== String(user._id)) return res.status(403).json({ error: 'Not course owner' })

    await lesson.deleteOne()
    res.json({ message: 'Lesson deleted' })
  } catch (err) {
    console.error('delete lesson error', err)
    res.status(500).json({ error: 'Failed to delete lesson' })
  }
})

export default router
