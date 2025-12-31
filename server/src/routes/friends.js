import express from 'express'
import { z } from 'zod'
import { clerkClient } from '@clerk/express'
import User from '../models/User.js'
import FriendRequest from '../models/FriendRequest.js'
import Notification from '../models/Notification.js'
import { normalizeHandle } from '../utils/handle.js'

const router = express.Router()

async function fetchClerkAvatars(clerkIds) {
  const unique = [...new Set(clerkIds.filter(Boolean))]
  if (!unique.length) return {}
  try {
    const result = await clerkClient.users.getUserList({
      userId: unique,
      limit: Math.min(unique.length, 100),
    })
    const map = {}
    result?.data?.forEach((u) => {
      if (u?.imageUrl) map[u.id] = u.imageUrl
    })
    return map
  } catch (err) {
    console.error('Failed to fetch Clerk avatars', err)
    return {}
  }
}

async function attachAvatars(list) {
  const data = (list || []).filter(Boolean).map((item) => ({ ...item }))
  const missingIds = data
    .filter((u) => u && !u.avatarUrl && u.clerkId)
    .map((u) => u.clerkId)
  const clerkAvatars = await fetchClerkAvatars(missingIds)

  // Persist back any new avatars so future responses are fast
  if (Object.keys(clerkAvatars).length) {
    try {
      const ops = data
        .filter((u) => u && !u.avatarUrl && u.clerkId && clerkAvatars[u.clerkId])
        .map((u) => ({
          updateOne: {
            filter: { _id: u._id },
            update: { $set: { avatarUrl: clerkAvatars[u.clerkId] } },
          },
        }))
      if (ops.length) {
        await User.bulkWrite(ops, { ordered: false })
      }
    } catch (err) {
      console.error('Failed to persist fetched avatars', err)
    }
  }

  return data.map((u) => ({
    ...u,
    avatarUrl: u.avatarUrl || clerkAvatars[u.clerkId] || null,
  }))
}

// List friends
router.get('/list', async (req, res) => {
  try {
    const me = await User.findOne({ clerkId: req.auth.userId })
      .populate('friends', 'handle firstName lastName role avatarUrl clerkId')
      .lean()
    if (!me) return res.status(404).json({ error: 'User not found' })
    const friends = await attachAvatars(me.friends || [])
    res.json({ friends })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to list friends' })
  }
})

// Send friend request by handle
const SendSchema = z.object({ handle: z.string().min(2).max(40) })
router.post('/request', async (req, res) => {
  try {
    const me = await User.findOne({ clerkId: req.auth.userId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const parsed = SendSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' })

    const requested = normalizeHandle(parsed.data.handle)
    const handle = `@${requested}`
    const other = await User.findOne({ handle })
    if (!other) return res.status(404).json({ error: 'Handle not found' })
    if (String(other._id) === String(me._id)) return res.status(400).json({ error: 'Cannot friend yourself' })

    // Already friends?
    const alreadyFriends = (me.friends || []).some(id => String(id) === String(other._id))
    if (alreadyFriends) return res.status(400).json({ error: 'Already friends' })

    const existing = await FriendRequest.findOne({
      $or: [
        { from: me._id, to: other._id },
        { from: other._id, to: me._id },
      ],
      status: 'pending',
    })
    if (existing) return res.status(400).json({ error: 'Request already pending' })

    const fr = await FriendRequest.create({ from: me._id, to: other._id })
    // notify receiver
    try {
      await Notification.create({
        userId: other.clerkId,
        type: 'friend_request',
        title: 'New friend request',
        body: `${[me.firstName, me.lastName].filter(Boolean).join(' ') || me.handle || 'A user'} sent you a friend request`,
        data: { fromHandle: me.handle, fromId: String(me._id) },
      })
    } catch {}
    res.json({ request: fr })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to send request' })
  }
})

// Pending requests (incoming and outgoing)
router.get('/pending', async (req, res) => {
  try {
    const me = await User.findOne({ clerkId: req.auth.userId })
    if (!me) return res.status(404).json({ error: 'User not found' })
    const incoming = await FriendRequest.find({ to: me._id, status: 'pending' })
      .populate('from', 'handle firstName lastName role avatarUrl clerkId')
      .lean()
    const outgoing = await FriendRequest.find({ from: me._id, status: 'pending' })
      .populate('to', 'handle firstName lastName role avatarUrl clerkId')
      .lean()

    const incomingWithAvatars = await (async () => {
      const incomingUsers = (incoming || []).map((r) => r.from || null)
      const hydrated = await attachAvatars(incomingUsers)
      const lookup = new Map(hydrated.map((u) => [String(u._id), u]))
      return (incoming || []).map((r) => ({
        ...r,
        from: r.from ? lookup.get(String(r.from._id)) || r.from : null,
      }))
    })()

    const outgoingWithAvatars = await (async () => {
      const outgoingUsers = (outgoing || []).map((r) => r.to || null)
      const hydrated = await attachAvatars(outgoingUsers)
      const lookup = new Map(hydrated.map((u) => [String(u._id), u]))
      return (outgoing || []).map((r) => ({
        ...r,
        to: r.to ? lookup.get(String(r.to._id)) || r.to : null,
      }))
    })()

    res.json({ incoming: incomingWithAvatars, outgoing: outgoingWithAvatars })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to get pending' })
  }
})

// Respond to a friend request
const RespondSchema = z.object({ requestId: z.string(), action: z.enum(['accept', 'decline']) })
router.post('/respond', async (req, res) => {
  try {
    const me = await User.findOne({ clerkId: req.auth.userId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const parsed = RespondSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' })
    const { requestId, action } = parsed.data

    const fr = await FriendRequest.findById(requestId)
    if (!fr || fr.status !== 'pending') return res.status(404).json({ error: 'Request not found' })
    if (String(fr.to) !== String(me._id) && String(fr.from) !== String(me._id)) {
      return res.status(403).json({ error: 'Not authorized for this request' })
    }

    if (action === 'decline') {
      fr.status = 'declined'
      await fr.save()
      return res.json({ request: fr })
    }

    // accept
    fr.status = 'accepted'
    await fr.save()

    const otherId = String(fr.from) === String(me._id) ? fr.to : fr.from
    const other = await User.findById(otherId)
    if (!other) return res.status(404).json({ error: 'Other user missing' })

    // Add each other if not already present
    const addIfMissing = (arr, id) => {
      const s = String(id)
      if (!arr.map(String).includes(s)) arr.push(id)
    }
    me.friends = me.friends || []
    other.friends = other.friends || []
    addIfMissing(me.friends, other._id)
    addIfMissing(other.friends, me._id)
    await me.save()
    await other.save()

    // notify requester on accept
    try {
      await Notification.create({
        userId: other.clerkId,
        type: 'friend_accept',
        title: 'Friend request accepted',
        body: `${[me.firstName, me.lastName].filter(Boolean).join(' ') || me.handle || 'User'} accepted your friend request`,
        data: { userHandle: me.handle, userId: String(me._id) },
      })
    } catch {}
    res.json({ request: fr })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to respond' })
  }
})

export default router
