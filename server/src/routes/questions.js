import express from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'
import Question from '../models/Question.js'
import QuestionAnswer from '../models/QuestionAnswer.js'
import User from '../models/User.js'

const router = express.Router()
const MAX_MEDIA_BYTES = 8 * 1024 * 1024

const MediaInput = z.object({
  kind: z.enum(['image', 'video']),
  data: z.string().min(10),
  mimeType: z.string().optional(),
})

const QuestionCreateSchema = z.object({
  title: z.string().trim().min(3).max(150),
  details: z.string().trim().min(3).max(800),
  tags: z.array(z.string().trim().min(1)).max(4).optional(),
  attachments: z.array(MediaInput).max(4).optional(),
})

const AnswerCreateSchema = z.object({
  body: z.string().trim().min(1).max(280),
})

const VoteSchema = z.object({
  delta: z.number().int().min(-1).max(1),
})

const ListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.string().optional(),
})

function serializeUser(user) {
  if (!user) return null
  const id = user._id ? String(user._id) : String(user)
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return {
    id,
    firstName: user.firstName,
    lastName: user.lastName,
    handle: user.handle,
    role: user.role,
    name: user.name || user.handle || name || 'User',
  }
}

function serializeReply(reply) {
  return {
    id: reply._id,
    author: serializeUser(reply.author),
    body: reply.body,
    createdAt: reply.createdAt,
  }
}

function serializeAnswer(answer, viewerId = null) {
  const voterIds = (answer.voters || []).map((id) => String(id))
  const voted = viewerId ? voterIds.includes(String(viewerId)) : false
  return {
    id: answer._id,
    author: serializeUser(answer.author),
    body: answer.body,
    createdAt: answer.createdAt,
    votes: answer.votesCount || 0,
    voted,
    replies: (answer.replies || []).map((r) => serializeReply(r)),
  }
}

function serializeQuestion(question, answers = [], viewerId = null) {
  return {
    id: question._id,
    title: question.title,
    details: question.details,
    tags: question.tags || [],
    attachments: (question.attachments || []).map((item) => ({
      kind: item.kind,
      mimeType: item.mimeType,
      data: item.data,
    })),
    votes: question.votesCount || 0,
    author: serializeUser(question.author),
    createdAt: question.createdAt,
    answers: answers.map((a) => serializeAnswer(a, viewerId)),
  }
}

async function buildQuestionPayload(question, viewerId = null) {
  const answers = await QuestionAnswer.find({ question: question._id })
    .sort({ createdAt: -1 })
    .populate('author', 'firstName lastName handle role')
    .populate('replies.author', 'firstName lastName handle role')
  return serializeQuestion(question, answers, viewerId)
}

router.get('/', async (req, res) => {
  try {
    const viewer = req.auth?.userId ? await User.findOne({ clerkId: req.auth.userId }).select('_id') : null
    const parsed = ListSchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid query' })
    const { limit = 20, before } = parsed.data

    const filter = {}
    if (before && mongoose.Types.ObjectId.isValid(before)) {
      filter._id = { $lt: new mongoose.Types.ObjectId(before) }
    }

    const questions = await Question.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'firstName lastName handle role')

    const ids = questions.map((q) => q._id)
    const answers = await QuestionAnswer.find({ question: { $in: ids } })
      .sort({ createdAt: -1 })
      .populate('author', 'firstName lastName handle role')
      .populate('replies.author', 'firstName lastName handle role')

    const answersByQuestion = new Map()
    for (const ans of answers) {
      const key = String(ans.question)
      if (!answersByQuestion.has(key)) answersByQuestion.set(key, [])
      answersByQuestion.get(key).push(ans)
    }

    const payload = questions.map((q) => {
      const list = answersByQuestion.get(String(q._id)) || []
      return serializeQuestion(q, list, viewer?._id || null)
    })

    res.json({ questions: payload })
  } catch (err) {
    console.error('questions list error', err)
    res.status(500).json({ error: 'Failed to load questions' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const viewer = req.auth?.userId ? await User.findOne({ clerkId: req.auth.userId }).select('_id') : null
    const question = await Question.findById(req.params.id).populate('author', 'firstName lastName handle role')
    if (!question) return res.status(404).json({ error: 'Question not found' })
    const payload = await buildQuestionPayload(question, viewer?._id || null)
    res.json({ question: payload })
  } catch (err) {
    console.error('questions show error', err)
    res.status(500).json({ error: 'Failed to load question' })
  }
})

router.post('/', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = QuestionCreateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const attachments = (parsed.data.attachments || []).map((item) => {
      const approxBytes = Math.ceil((item.data.length * 3) / 4)
      if (approxBytes > MAX_MEDIA_BYTES) {
        throw new Error('Media exceeds max size')
      }
      return {
        kind: item.kind,
        data: item.data,
        mimeType: item.mimeType,
      }
    })

    const question = await Question.create({
      author: me._id,
      title: parsed.data.title.trim(),
      details: parsed.data.details.trim(),
      tags: (parsed.data.tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 4),
      attachments,
      votesCount: 0,
      voters: [],
      answersCount: 0,
    })

    await question.populate('author', 'firstName lastName handle role')
    const payload = await buildQuestionPayload(question, me._id)
    res.status(201).json({ question: payload })
  } catch (err) {
    if (err.message === 'Media exceeds max size') {
      return res.status(400).json({ error: 'Each attachment must be smaller than 8MB' })
    }
    console.error('questions create error', err)
    res.status(500).json({ error: 'Failed to create question' })
  }
})

router.post('/:id/answers', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = AnswerCreateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid answer' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const question = await Question.findById(req.params.id).populate('author', 'firstName lastName handle role')
    if (!question) return res.status(404).json({ error: 'Question not found' })

    await QuestionAnswer.create({
      question: question._id,
      author: me._id,
      body: parsed.data.body.trim(),
      replies: [],
    })
    question.answersCount = (question.answersCount || 0) + 1
    await question.save()

    const payload = await buildQuestionPayload(question, me._id)
    res.status(201).json({ question: payload })
  } catch (err) {
    console.error('questions answer error', err)
    res.status(500).json({ error: 'Failed to add answer' })
  }
})

router.post('/:id/answers/:answerId/replies', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = AnswerCreateSchema.safeParse({ body: req.body.body })
    if (!parsed.success) return res.status(400).json({ error: 'Invalid reply' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const question = await Question.findById(req.params.id).populate('author', 'firstName lastName handle role')
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const answer = await QuestionAnswer.findById(req.params.answerId)
    if (!answer || String(answer.question) !== String(question._id)) {
      return res.status(404).json({ error: 'Answer not found' })
    }

    answer.replies.push({
      author: me._id,
      body: parsed.data.body.trim(),
      createdAt: new Date(),
    })
    await answer.save()

    const payload = await buildQuestionPayload(question, me._id)
    res.status(201).json({ question: payload })
  } catch (err) {
    console.error('questions reply error', err)
    res.status(500).json({ error: 'Failed to add reply' })
  }
})

router.post('/:id/vote', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = VoteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid vote' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const question = await Question.findById(req.params.id).populate('author', 'firstName lastName handle role')
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const alreadyVoted = (question.voters || []).some((id) => String(id) === String(me._id))
    if (alreadyVoted) return res.status(400).json({ error: 'You already voted on this question' })

    question.voters = [...(question.voters || []), me._id]
    question.votesCount = (question.votesCount || 0) + parsed.data.delta
    await question.save()

    const payload = await buildQuestionPayload(question, me._id)
    res.json({ question: payload })
  } catch (err) {
    console.error('questions vote error', err)
    res.status(500).json({ error: 'Failed to vote' })
  }
})

router.post('/:id/answers/:answerId/vote', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const question = await Question.findById(req.params.id).populate('author', 'firstName lastName handle role')
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const answer = await QuestionAnswer.findById(req.params.answerId)
    if (!answer || String(answer.question) !== String(question._id)) {
      return res.status(404).json({ error: 'Answer not found' })
    }

    const meString = String(me._id)
    const alreadyVoted = (answer.voters || []).some((id) => String(id) === meString)
    if (alreadyVoted) {
      answer.voters = (answer.voters || []).filter((id) => String(id) !== meString)
      answer.votesCount = Math.max(0, (answer.votesCount || 0) - 1)
    } else {
      answer.voters = [...(answer.voters || []), me._id]
      answer.votesCount = (answer.votesCount || 0) + 1
    }
    await answer.save()

    const payload = await buildQuestionPayload(question, me._id)
    res.json({ question: payload })
  } catch (err) {
    console.error('questions answer vote error', err)
    res.status(500).json({ error: 'Failed to vote on answer' })
  }
})

export default router
