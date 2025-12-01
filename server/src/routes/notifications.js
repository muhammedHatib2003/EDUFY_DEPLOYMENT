import express from 'express'
import Notification from '../models/Notification.js'

const router = express.Router()

// List my notifications
router.get('/', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20))
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true'
    const query = { userId: clerkId }
    if (unreadOnly) query.readAt = { $exists: false }
    const list = await Notification.find(query).sort({ createdAt: -1 }).limit(limit)
    res.json({ notifications: list })
  } catch (err) {
    console.error('list notifications error', err)
    res.status(500).json({ error: 'Failed to list notifications' })
  }
})

// Mark specific ids read or all
router.post('/mark-read', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null
    const filter = { userId: clerkId }
    if (ids && ids.length) filter._id = { $in: ids }
    await Notification.updateMany(filter, { $set: { readAt: new Date() } })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read' })
  }
})

export default router

