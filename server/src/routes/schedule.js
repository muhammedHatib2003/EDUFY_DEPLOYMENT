import express from 'express'
import Classroom from '../models/Classroom.js'
import Notification from '../models/Notification.js'
import ScheduleItem from '../models/ScheduleItem.js'
import User from '../models/User.js'

const router = express.Router()

function requireAuth(req, res) {
  const clerkId = req.auth?.userId
  if (!clerkId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return clerkId
}

function clean(str, max = 240) {
  if (typeof str !== 'string') return ''
  const trimmed = str.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

// List relevant schedule items for the current user
router.get('/', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return

    const classes = await Classroom.find(
      { $or: [ { teacherId: clerkId }, { memberIds: clerkId } ] },
      'name teacherId'
    )
    if (!classes.length) return res.json({ items: [] })

    const classIds = classes.map(c => c._id)
    const classMap = new Map(classes.map(c => [String(c._id), c]))
    const items = await ScheduleItem
      .find({ classId: { $in: classIds } })
      .sort({ date: 1, createdAt: -1 })
      .limit(500)

    const now = new Date()
    res.json({
      items: items.map((item) => ({
        _id: item._id,
        title: item.title,
        description: item.description,
        type: item.type || 'announcement',
        date: item.date,
        classId: item.classId,
        className: classMap.get(String(item.classId))?.name,
        createdBy: item.createdBy,
        isPast: item.date < now,
        editable: classMap.get(String(item.classId))?.teacherId === clerkId,
      }))
    })
  } catch (err) {
    console.error('list schedule error', err)
    res.status(500).json({ error: 'Failed to load schedule' })
  }
})

// Create a new exam/assignment/announcement for a classroom (teachers only)
router.post('/', async (req, res) => {
  try {
    const clerkId = requireAuth(req, res); if (!clerkId) return
    const { classId, title, type, date, description } = req.body || {}

    const classroom = await Classroom.findById(classId)
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' })
    if (classroom.teacherId !== clerkId) {
      return res.status(403).json({ error: 'Only the teacher can create schedule items' })
    }

    const parsedDate = new Date(date)
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Valid date is required' })
    }
    const cleanedTitle = clean(title, 160)
    if (!cleanedTitle) return res.status(400).json({ error: 'Title is required' })
    const cleanedDesc = clean(description, 2000)
    const finalType = ['exam', 'assignment', 'announcement'].includes(type) ? type : 'announcement'

    const item = await ScheduleItem.create({
      classId: classroom._id,
      title: cleanedTitle,
      description: cleanedDesc,
      date: parsedDate,
      type: finalType,
      createdBy: clerkId,
    })

    // notify students in the class
    try {
      const me = await User.findOne({ clerkId })
      const sender = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || me?.handle || 'Your teacher'
      const recipients = Array.from(new Set(classroom.memberIds || [])).filter(id => id !== clerkId)
      const label = finalType === 'exam' ? 'exam' : (finalType === 'assignment' ? 'assignment' : 'announcement')
      const noteTitle = `New ${label} for ${classroom.name}`
      const body = `${sender} scheduled "${cleanedTitle}"`
      const toCreate = recipients.map(uid => ({
        userId: uid,
        type: 'schedule',
        title: noteTitle,
        body,
        data: { classroomId: String(classroom._id), scheduleId: String(item._id) },
      }))
      if (toCreate.length) await Notification.insertMany(toCreate)
    } catch (e) {
      console.error('schedule notify error', e)
    }

    res.json({ item })
  } catch (err) {
    console.error('create schedule error', err)
    res.status(500).json({ error: 'Failed to create schedule item' })
  }
})

export default router
