import express from 'express'
import { StreamChat } from 'stream-chat'
import * as StreamNodeSdk from '@stream-io/node-sdk'
import { clerkClient } from '@clerk/express'
import User from '../models/User.js'

const router = express.Router()

// Cache Stream instances
let cachedChat = null
let cachedVideo = null

function getStreamEnv(which = 'chat') {
  if (which === 'video') {
    const key =
      process.env.STREAM_VIDEO_API_KEY 
    const secret =
      process.env.STREAM_VIDEO_API_SECRET 
    return { key, secret }
  }
  // chat (prefer chat-specific vars, then generic)
  const key =
    process.env.STREAM_CHAT_API_KEY ||
    process.env.STREAM_CHAT_KEY ||
    process.env.STREAM_API_KEY ||
    process.env.STREAM_KEY
  const secret =
    process.env.STREAM_CHAT_API_SECRET ||
    process.env.STREAM_CHAT_SECRET ||
    process.env.STREAM_API_SECRET ||
    process.env.STREAM_SECRET
  return { key, secret }
}

function getChat() {
  const { key, secret } = getStreamEnv('chat')
  if (!key || !secret) return { chat: null, apiKey: key }
  if (!cachedChat) cachedChat = StreamChat.getInstance(key, secret)
  return { chat: cachedChat, apiKey: key }
}

function getVideo() {
  const { key, secret } = getStreamEnv('video')
  if (!key || !secret) return null
  if (!cachedVideo) {
    const ClientCtor = StreamNodeSdk.StreamClient || StreamNodeSdk.default
    if (!ClientCtor) return null
    // StreamClient signature is (apiKey: string, apiSecret: string)
    cachedVideo = new ClientCtor(key, secret)
  }
  return cachedVideo
}

function sanitizeUserId(id) {
  if (!id) return 'user'
  return String(id).replace(/^@/, '').replace(/[^A-Za-z0-9_-]/g, '_')
}

async function fetchClerkAvatar(clerkId) {
  if (!clerkId) return null
  try {
    const u = await clerkClient.users.getUser(clerkId)
    return u?.imageUrl || null
  } catch (err) {
    console.error('Failed to fetch Clerk avatar for', clerkId, err)
    return null
  }
}

// Create chat token
router.post('/token/chat', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const { chat, apiKey } = getChat()
    if (!chat) return res.status(500).json({ error: 'Stream not configured' })

    const streamUserId = me.streamUserId || me.handle || me.clerkId

    // Ensure we have an avatar (fallback to Clerk)
    let image = me.avatarUrl
    if (!image) {
      image = await fetchClerkAvatar(me.clerkId)
      if (image) {
        try {
          me.avatarUrl = image
          await me.save()
        } catch (err) {
          console.error('Failed to persist avatarUrl', err)
        }
      }
    }

    await chat.upsertUser({
      id: String(streamUserId),
      name: [me.firstName, me.lastName].filter(Boolean).join(' ') || me.handle || 'User',
      image: image || undefined,
      role: 'user', // Always valid
    })

    if (!me.streamUserId) {
      me.streamUserId = String(streamUserId)
      await me.save()
    }

    const token = chat.createToken(String(streamUserId))
    res.json({ token, apiKey, userId: String(streamUserId) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create chat token' })
  }
})

// Create video token
router.post('/token/video', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const videoServer = getVideo()
    if (!videoServer) return res.status(500).json({ error: 'Stream not configured' })

    const rawId = me.streamUserId || me.handle || me.clerkId
    const streamUserId = sanitizeUserId(rawId)

    const createToken = videoServer.createUserToken || videoServer.createToken
    if (!createToken) return res.status(500).json({ error: 'Video token method not available' })

    const token = await createToken.call(videoServer, String(streamUserId))
    const { key: videoApiKey } = getStreamEnv('video')
    res.json({
      token,
      apiKey: videoApiKey,
      userId: String(streamUserId),
    })
  } catch (err) {
    console.error('Video token error:', err)
    res.status(500).json({ error: 'Failed to create video token', details: err?.message })
  }
})

// Ensure Stream Chat users exist for a list of identifiers (handles like "@user" or Clerk IDs)
router.post('/users/upsert', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })

    const { identifiers, handles, users } = req.body || {}
    const input = Array.isArray(identifiers)
      ? identifiers
      : Array.isArray(handles)
        ? handles
        : Array.isArray(users)
          ? users
          : []
    const ids = (input || [])
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean)
    if (ids.length === 0) return res.status(400).json({ error: 'identifiers required' })

    const { chat } = getChat()
    if (!chat) return res.status(500).json({ error: 'Stream not configured' })

    // Find users by handle (with or without @) or by clerkId
    const handlesWithAt = ids
      .filter((s) => s.startsWith('@'))
    const handlesWithoutAt = ids
      .filter((s) => !s.startsWith('@'))
      .map((s) => `@${s}`)

    const found = await User.find({
      $or: [
        { handle: { $in: [...handlesWithAt, ...handlesWithoutAt] } },
        { clerkId: { $in: ids } },
      ],
    })

    if (!found.length) return res.json({ users: [] })

    const toUpsert = []
    const responseUsers = []
    for (const u of found) {
      const streamUserId = String(u.streamUserId || u.handle || u.clerkId)
      let image = u.avatarUrl
      if (!image && u.clerkId) {
        image = await fetchClerkAvatar(u.clerkId)
        if (image) {
          try {
            await User.updateOne({ _id: u._id }, { $set: { avatarUrl: image } })
          } catch (err) {
            console.error('Failed to persist avatarUrl (bulk)', err)
          }
        }
      }
      toUpsert.push({
        id: streamUserId,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.handle || 'User',
        image: image || undefined,
        role: 'user',
      })
      responseUsers.push({ handle: u.handle, clerkId: u.clerkId, userId: streamUserId })
    }

    if (toUpsert.length) {
      await chat.upsertUsers(toUpsert)
      // persist streamUserId if newly set
      const bulkOps = found
        .filter((u) => !u.streamUserId)
        .map((u) => ({
          updateOne: {
            filter: { _id: u._id },
            update: { $set: { streamUserId: String(u.streamUserId || u.handle || u.clerkId) } },
          },
        }))
      if (bulkOps.length) {
        try { await User.bulkWrite(bulkOps) } catch {}
      }
    }

    res.json({ users: responseUsers })
  } catch (err) {
    console.error('users/upsert error', err)
    res.status(500).json({ error: 'Failed to upsert users' })
  }
})

// Diagnostics
router.get('/diag', (req, res) => {
  const chat = getStreamEnv('chat')
  const video = getStreamEnv('video')
  res.json({
    chatHasKey: Boolean(chat.key),
    chatHasSecret: Boolean(chat.secret),
    chatKeyPreview: chat.key ? `${chat.key.slice(0, 6)}...` : null,
    videoHasKey: Boolean(video.key),
    videoHasSecret: Boolean(video.secret),
    videoKeyPreview: video.key ? `${video.key.slice(0, 6)}...` : null,
  })
})

export default router











