import express from 'express'
import Classroom from '../models/Classroom.js'
import Assignment from '../models/Assignment.js'
import Submission from '../models/Submission.js'
import ClassPost from '../models/ClassPost.js'
import ClassPostComment from '../models/ClassPostComment.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import Quiz from '../models/Quiz.js'
import QuizAttempt from '../models/QuizAttempt.js'
import { StreamChat } from 'stream-chat'

const router = express.Router()

// minimal chat helper similar to routes/stream.js
function getStreamChat() {
  const key = process.env.STREAM_CHAT_API_KEY || process.env.STREAM_CHAT_KEY || process.env.STREAM_API_KEY || process.env.STREAM_KEY
  const secret = process.env.STREAM_CHAT_API_SECRET || process.env.STREAM_CHAT_SECRET || process.env.STREAM_API_SECRET || process.env.STREAM_SECRET
  if (!key || !secret) return { chat: null, apiKey: key }
  const chat = StreamChat.getInstance(key, secret)
  return { chat, apiKey: key }
}

async function ensureStreamUser(chat, clerkId) {
  const me = await User.findOne({ clerkId })
  if (!me) return null
  const streamUserId = String(me.streamUserId || me.handle || me.clerkId)
  // upsert
  await chat.upsertUser({ id: streamUserId, name: [me.firstName, me.lastName].filter(Boolean).join(' ') || me.handle || 'User' })
  if (!me.streamUserId) { me.streamUserId = streamUserId; await me.save() }
  return streamUserId
}

async function ensureClassChannel(classId, memberClerkIds) {
  const { chat } = getStreamChat()
  if (!chat) return
  const channelId = `classroom-${classId}`
  const channel = chat.channel('messaging', channelId, { name: `Class ${classId}` })
  try { await channel.create() } catch {}
  // add members
  const streamIds = []
  for (const clerkId of memberClerkIds) {
    try {
      const id = await ensureStreamUser(chat, clerkId)
      if (id) streamIds.push(id)
    } catch {}
  }
  if (streamIds.length) {
    try { await channel.addMembers(streamIds) } catch {}
  }
}

function requireAuth(req, res) {
  const clerkId = req.auth?.userId
  if (!clerkId) { res.status(401).json({ error: 'Unauthorized' }); return null }
  return clerkId
}

// POST /api/classrooms -> create classroom (teacher)
router.post('/', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })
    if (me.role !== 'teacher') return res.status(403).json({ error: 'Only teachers can create classrooms' })
    const { name, description } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase()
    const classroom = await Classroom.create({ name, description, joinCode, teacherId: clerkId, memberIds: [clerkId] })
    await ensureClassChannel(classroom._id, classroom.memberIds)
    res.json({ classroom })
  } catch (err) {
    console.error('create classroom error', err)
    res.status(500).json({ error: 'Failed to create classroom' })
  }
})

// POST /api/classrooms/join -> join by code
router.post('/join', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const { code } = req.body || {}
    if (!code) return res.status(400).json({ error: 'code required' })
    const classroom = await Classroom.findOne({ joinCode: String(code).toUpperCase() })
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
    if (!classroom.memberIds.includes(clerkId)) {
      classroom.memberIds.push(clerkId)
      await classroom.save()
      await ensureClassChannel(classroom._id, classroom.memberIds)
    }
    res.json({ classroom })
  } catch (err) {
    res.status(500).json({ error: 'Failed to join classroom' })
  }
})

// GET /api/classrooms -> my classrooms
router.get('/', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const classes = await Classroom.find({ $or: [ { teacherId: clerkId }, { memberIds: clerkId } ] }).sort({ createdAt: -1 })
    res.json({ classrooms: classes })
  } catch (err) { res.status(500).json({ error: 'Failed to list classrooms' }) }
})

// GET /api/classrooms/:id -> details
router.get('/:id', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const classroom = await Classroom.findById(req.params.id)
    if (!classroom) return res.status(404).json({ error: 'Not found' })
    const teacher = await User.findOne({ clerkId: classroom.teacherId })
    const members = await User.find({ clerkId: { $in: classroom.memberIds } })
    res.json({
      classroom,
      teacher: teacher ? { handle: teacher.handle, name: [teacher.firstName, teacher.lastName].filter(Boolean).join(' '), clerkId: teacher.clerkId } : null,
      members: members.map(m => ({ handle: m.handle, name: [m.firstName, m.lastName].filter(Boolean).join(' '), clerkId: m.clerkId })),
      channelId: `classroom-${classroom._id}`,
    })
  } catch (err) { res.status(500).json({ error: 'Failed to get classroom' }) }
})

// Posts (with media, likes, counts)
router.get('/:id/posts', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const posts = await ClassPost.find({ classId: req.params.id }).sort({ createdAt: -1 })
    const users = await User.find({ clerkId: { $in: posts.map(p => p.authorId) } })
    const authorMap = new Map(users.map(u => [u.clerkId, { handle: u.handle, name: [u.firstName, u.lastName].filter(Boolean).join(' ') }]))
    const postIds = posts.map(p => p._id)
    let counts = []
    if (postIds.length) {
      counts = await ClassPostComment.aggregate([
        { $match: { postId: { $in: postIds } } },
        { $group: { _id: '$postId', count: { $sum: 1 } } },
      ])
    }
    const commentsCountMap = new Map(counts.map(c => [String(c._id), c.count]))
    res.json({
      posts: posts.map(p => ({
        _id: p._id,
        text: p.text || '',
        attachments: Array.isArray(p.attachments) ? p.attachments : [],
        author: authorMap.get(p.authorId) || { handle: p.authorId },
        createdAt: p.createdAt,
        likesCount: Array.isArray(p.likes) ? p.likes.length : 0,
        likedByMe: Array.isArray(p.likes) ? p.likes.includes(clerkId) : false,
        commentsCount: commentsCountMap.get(String(p._id)) || 0,
      }))
    })
  } catch (err) { res.status(500).json({ error: 'Failed to list posts' }) }
})

router.post('/:id/posts', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const { text, attachments } = req.body || {}
    const atts = Array.isArray(attachments) ? attachments
      .filter(a => a && typeof a.url === 'string' && typeof a.type === 'string' && ['image', 'video'].includes(a.type))
      .slice(0, 4) : []
    const cleanedText = typeof text === 'string' ? text.trim() : ''
    if (!cleanedText && atts.length === 0) return res.status(400).json({ error: 'text or attachments required' })
    const post = await ClassPost.create({ classId: req.params.id, authorId: clerkId, text: cleanedText, attachments: atts })
    // notify class members except author
    try {
      const classroom = await Classroom.findById(req.params.id)
      if (classroom) {
        const me = await User.findOne({ clerkId })
        const memberSet = new Set([classroom.teacherId, ...(classroom.memberIds || [])].map(String))
        memberSet.delete(String(clerkId))
        const recipients = Array.from(memberSet)
        const title = `New post in ${classroom.name || 'classroom'}`
        const bodyName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.handle || 'A classmate'
        const toCreate = recipients.map(uid => ({ userId: uid, type: 'class_post', title, body: `${bodyName} posted an update`, data: { classroomId: String(classroom._id), postId: String(post._id) } }))
        if (toCreate.length) await Notification.insertMany(toCreate)
      }
    } catch {}
    res.json({ ok: true, id: post._id })
  } catch (err) { res.status(500).json({ error: 'Failed to create post' }) }
})

// Like/unlike a post (toggle)
router.post('/:id/posts/:postId/like', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const post = await ClassPost.findById(req.params.postId)
    if (!post || String(post.classId) !== String(req.params.id)) return res.status(404).json({ error: 'Post not found' })
    const liked = Array.isArray(post.likes) && post.likes.includes(clerkId)
    if (liked) {
      await ClassPost.findByIdAndUpdate(post._id, { $pull: { likes: clerkId } })
    } else {
      await ClassPost.findByIdAndUpdate(post._id, { $addToSet: { likes: clerkId } })
      // notify author on like
      try {
        if (post.authorId && String(post.authorId) !== String(clerkId)) {
          const me = await User.findOne({ clerkId })
          const classroom = await Classroom.findById(req.params.id)
          const title = `New like on your post`
          const bodyName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.handle || 'Someone'
          await Notification.create({ userId: String(post.authorId), type: 'post_like', title, body: `${bodyName} liked your post${classroom?.name ? ' in ' + classroom.name : ''}` , data: { classroomId: String(req.params.id), postId: String(post._id) } })
        }
      } catch {}
    }
    const updated = await ClassPost.findById(post._id)
    res.json({
      likedByMe: Array.isArray(updated.likes) ? updated.likes.includes(clerkId) : false,
      likesCount: Array.isArray(updated.likes) ? updated.likes.length : 0,
    })
  } catch (err) { res.status(500).json({ error: 'Failed to like post' }) }
})

// List comments for a post
router.get('/:id/posts/:postId/comments', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const post = await ClassPost.findById(req.params.postId)
    if (!post || String(post.classId) !== String(req.params.id)) return res.status(404).json({ error: 'Post not found' })
    const list = await ClassPostComment.find({ postId: post._id }).sort({ createdAt: 1 })
    const users = await User.find({ clerkId: { $in: list.map(c => c.authorId) } })
    const authorMap = new Map(users.map(u => [u.clerkId, { handle: u.handle, name: [u.firstName, u.lastName].filter(Boolean).join(' ') }]))
    res.json({ comments: list.map(c => ({ _id: c._id, text: c.text, author: authorMap.get(c.authorId) || { handle: c.authorId }, createdAt: c.createdAt })) })
  } catch (err) { res.status(500).json({ error: 'Failed to list comments' }) }
})

// Add a comment to a post
router.post('/:id/posts/:postId/comments', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const post = await ClassPost.findById(req.params.postId)
    if (!post || String(post.classId) !== String(req.params.id)) return res.status(404).json({ error: 'Post not found' })
    const { text } = req.body || {}
    const cleanedText = typeof text === 'string' ? text.trim() : ''
    if (!cleanedText) return res.status(400).json({ error: 'text required' })
    const c = await ClassPostComment.create({ postId: post._id, authorId: clerkId, text: cleanedText })
    // notify author on comment
    try {
      if (post.authorId && String(post.authorId) !== String(clerkId)) {
        const me = await User.findOne({ clerkId })
        const classroom = await Classroom.findById(req.params.id)
        const title = `New comment on your post`
        const bodyName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.handle || 'Someone'
        await Notification.create({ userId: String(post.authorId), type: 'post_comment', title, body: `${bodyName} commented on your post${classroom?.name ? ' in ' + classroom.name : ''}`, data: { classroomId: String(req.params.id), postId: String(post._id), commentId: String(c._id) } })
      }
    } catch {}
    res.json({ ok: true, id: c._id })
  } catch (err) { res.status(500).json({ error: 'Failed to add comment' }) }
})

// Assignments
router.get('/:id/assignments', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const list = await Assignment.find({ classId: req.params.id }).sort({ createdAt: -1 })
    // include my submission if exists
    const subs = await Submission.find({ assignmentId: { $in: list.map(a => a._id) }, studentId: clerkId })
    const subMap = new Map(subs.map(s => [String(s.assignmentId), s]))
    let result = list.map(a => ({
      _id: a._id,
      title: a.title,
      description: a.description,
      dueDate: a.dueDate,
      files: a.files,
      createdAt: a.createdAt,
      mySubmission: subMap.get(String(a._id)) || null,
    }))
    // if requester is teacher, include all submissions under each assignment
    const classroom = await Classroom.findById(req.params.id)
    if (classroom && classroom.teacherId === clerkId) {
      const allSubs = await Submission.find({ assignmentId: { $in: list.map(a => a._id) } })
      const byAssign = new Map()
      for (const s of allSubs) {
        const arr = byAssign.get(String(s.assignmentId)) || []
        arr.push({ _id: s._id, studentId: s.studentId, fileURL: s.fileURL, grade: s.grade, feedback: s.feedback, createdAt: s.createdAt })
        byAssign.set(String(s.assignmentId), arr)
      }
      result = result.map(a => ({ ...a, submissions: byAssign.get(String(a._id)) || [] }))
    }
    res.json({ assignments: result })
  } catch (err) { res.status(500).json({ error: 'Failed to list assignments' }) }
})

router.post('/:id/assignments', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const classroom = await Classroom.findById(req.params.id)
    if (!classroom) return res.status(404).json({ error: 'Class not found' })
    if (classroom.teacherId !== clerkId) return res.status(403).json({ error: 'Only teacher can create assignments' })
    const { title, description, dueDate, files } = req.body || {}
    if (!title) return res.status(400).json({ error: 'title required' })
    const a = await Assignment.create({ classId: classroom._id, title, description, dueDate, files: Array.isArray(files) ? files : [] })
    // notify class members except teacher creator
    try {
      const me = await User.findOne({ clerkId })
      const memberSet = new Set([classroom.teacherId, ...(classroom.memberIds || [])].map(String))
      memberSet.delete(String(clerkId))
      const recipients = Array.from(memberSet)
      const titleN = `New assignment in ${classroom.name || 'classroom'}`
      const bodyName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.handle || 'Teacher'
      const toCreate = recipients.map(uid => ({ userId: uid, type: 'assignment', title: titleN, body: `${bodyName} created "${title}"`, data: { classroomId: String(classroom._id), assignmentId: String(a._id) } }))
      if (toCreate.length) await Notification.insertMany(toCreate)
    } catch {}
    res.json({ assignment: a })
  } catch (err) { res.status(500).json({ error: 'Failed to create assignment' }) }
})

router.post('/:id/assignments/:assignId/submit', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const classroom = await Classroom.findById(req.params.id)
    if (!classroom) return res.status(404).json({ error: 'Class not found' })
    if (!classroom.memberIds.includes(clerkId) && classroom.teacherId !== clerkId) return res.status(403).json({ error: 'Not a member of class' })
    const { fileURL } = req.body || {}
    if (!fileURL) return res.status(400).json({ error: 'fileURL required' })
    const s = await Submission.findOneAndUpdate(
      { assignmentId: req.params.assignId, studentId: clerkId },
      { $set: { fileURL }, $setOnInsert: { createdAt: new Date() } },
      { new: true, upsert: true }
    )
    res.json({ submission: s })
  } catch (err) { res.status(500).json({ error: 'Failed to submit' }) }
})

router.post('/:id/submissions/:submissionId/grade', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const classroom = await Classroom.findById(req.params.id)
    if (!classroom) return res.status(404).json({ error: 'Class not found' })
    if (classroom.teacherId !== clerkId) return res.status(403).json({ error: 'Only teacher can grade' })
    const { grade, feedback } = req.body || {}
    const s = await Submission.findByIdAndUpdate(req.params.submissionId, { $set: { grade, feedback } }, { new: true })
    if (!s) return res.status(404).json({ error: 'Submission not found' })
    res.json({ submission: s })
  } catch (err) { res.status(500).json({ error: 'Failed to grade' }) }
})

// Quizzes
function cleanString(s, max = 2000) {
  if (typeof s !== 'string') return ''
  const t = s.trim()
  return t.length > max ? t.slice(0, max) : t
}

router.get('/:id/quizzes', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const classId = req.params.id
    const quizzes = await Quiz.find({ classId }).sort({ createdAt: -1 })
    // include my attempts
    const attempts = await QuizAttempt.find({ quizId: { $in: quizzes.map(q => q._id) }, studentId: clerkId })
    const aMap = new Map(attempts.map(a => [String(a.quizId), a]))
    const list = quizzes.map(q => ({
      _id: q._id,
      title: q.title,
      description: q.description,
      dueDate: q.dueDate,
      questionCount: Array.isArray(q.questions) ? q.questions.length : 0,
      totalPoints: (q.questions || []).reduce((s, x) => s + (Number(x.points) || 0), 0),
      myAttempt: aMap.get(String(q._id)) ? { score: aMap.get(String(q._id)).score, totalPoints: aMap.get(String(q._id)).totalPoints, submittedAt: aMap.get(String(q._id)).submittedAt } : null,
      createdAt: q.createdAt,
    }))
    res.json({ quizzes: list })
  } catch (err) { res.status(500).json({ error: 'Failed to list quizzes' }) }
})

router.post('/:id/quizzes', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const classroom = await Classroom.findById(req.params.id)
    if (!classroom) return res.status(404).json({ error: 'Class not found' })
    if (classroom.teacherId !== clerkId) return res.status(403).json({ error: 'Only teacher can create quizzes' })

    const { title, description, dueDate, questions } = req.body || {}
    const t = cleanString(title, 200)
    if (!t) return res.status(400).json({ error: 'title required' })

    const qList = Array.isArray(questions) ? questions.slice(0, 50).map((q) => {
      const type = (q?.type === 'boolean') ? 'boolean' : 'mcq'
      const text = cleanString(q?.text, 1000)
      const points = Math.max(0, Math.min(100, Number(q?.points) || 1))
      if (type === 'mcq') {
        const opts = Array.isArray(q?.options) ? q.options.map(o => cleanString(o, 300)).filter(Boolean).slice(0, 10) : []
        const correct = Number.isInteger(q?.correct) ? q.correct : 0
        return { type, text, options: opts, correct, points }
      } else {
        const correct = Boolean(q?.correct)
        return { type, text, options: [], correct, points }
      }
    }) : []
    if (!qList.length) return res.status(400).json({ error: 'at least one question required' })

    const quiz = await Quiz.create({ classId: classroom._id, title: t, description: cleanString(description, 2000), dueDate, questions: qList })
    // notify students
    try {
      const me = await User.findOne({ clerkId })
      const memberSet = new Set([...(classroom.memberIds || [])])
      const recipients = Array.from(memberSet)
      const titleN = `New quiz in ${classroom.name || 'classroom'}`
      const bodyName = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.handle || 'Teacher'
      const toCreate = recipients.map(uid => ({ userId: uid, type: 'quiz', title: titleN, body: `${bodyName} created "${t}"`, data: { classroomId: String(classroom._id), quizId: String(quiz._id) } }))
      if (toCreate.length) await Notification.insertMany(toCreate)
    } catch {}

    res.json({ quiz: { _id: quiz._id, title: quiz.title } })
  } catch (err) { res.status(500).json({ error: 'Failed to create quiz' }) }
})

router.get('/:id/quizzes/:quizId', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const quiz = await Quiz.findById(req.params.quizId)
    if (!quiz || String(quiz.classId) !== String(req.params.id)) return res.status(404).json({ error: 'Quiz not found' })
    const classroom = await Classroom.findById(req.params.id)
    if (!classroom) return res.status(404).json({ error: 'Class not found' })
    const isTeacher = classroom.teacherId === clerkId
    const myAttempt = await QuizAttempt.findOne({ quizId: quiz._id, studentId: clerkId })
    const hideAnswers = !isTeacher && !myAttempt
    const questions = (quiz.questions || []).map(q => ({
      type: q.type,
      text: q.text,
      options: Array.isArray(q.options) ? q.options : [],
      points: q.points,
      ...(hideAnswers ? {} : { correct: q.correct })
    }))
    res.json({
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        dueDate: quiz.dueDate,
        questions,
      },
      myAttempt: myAttempt ? { score: myAttempt.score, totalPoints: myAttempt.totalPoints, submittedAt: myAttempt.submittedAt } : null,
    })
  } catch (err) { res.status(500).json({ error: 'Failed to get quiz' }) }
})

router.post('/:id/quizzes/:quizId/submit', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const quiz = await Quiz.findById(req.params.quizId)
    if (!quiz || String(quiz.classId) !== String(req.params.id)) return res.status(404).json({ error: 'Quiz not found' })
    const classroom = await Classroom.findById(req.params.id)
    if (!classroom) return res.status(404).json({ error: 'Class not found' })
    if (classroom.teacherId !== clerkId && !classroom.memberIds.includes(clerkId)) return res.status(403).json({ error: 'Not a class member' })

    const arr = Array.isArray(req.body?.answers) ? req.body.answers : []
    // grade
    let score = 0
    let total = 0
    const qs = quiz.questions || []
    const answers = []
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]
      const pts = Number(q.points) || 0
      total += pts
      const a = arr[i]
      answers.push(a)
      if (q.type === 'mcq') {
        if (Number(a) === Number(q.correct)) score += pts
      } else if (q.type === 'boolean') {
        if (Boolean(a) === Boolean(q.correct)) score += pts
      }
    }

    const attempt = await QuizAttempt.findOneAndUpdate(
      { quizId: quiz._id, studentId: clerkId },
      { $set: { answers, score, totalPoints: total, classId: quiz.classId, submittedAt: new Date() } },
      { new: true, upsert: true }
    )
    res.json({ score, totalPoints: total })
  } catch (err) { res.status(500).json({ error: 'Failed to submit quiz' }) }
})

router.get('/:id/quizzes/:quizId/attempts', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const classroom = await Classroom.findById(req.params.id)
    if (!classroom) return res.status(404).json({ error: 'Class not found' })
    if (classroom.teacherId !== clerkId) return res.status(403).json({ error: 'Only teacher can view attempts' })
    const list = await QuizAttempt.find({ quizId: req.params.quizId })
    res.json({ attempts: list.map(a => ({ studentId: a.studentId, score: a.score, totalPoints: a.totalPoints, submittedAt: a.submittedAt })) })
  } catch (err) { res.status(500).json({ error: 'Failed to list attempts' }) }
})

export default router
