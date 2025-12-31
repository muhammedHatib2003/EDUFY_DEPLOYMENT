import express from 'express'
import { z } from 'zod'
import User from '../models/User.js'
import { normalizeHandle } from '../utils/handle.js'

const router = express.Router()
const publicRouter = express.Router()

function buildPublicProfile(user) {
  if (!user) return null
  return {
    id: user._id,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    age: user.age,
    bio: user.bio,
    friendsCount: Array.isArray(user.friends) ? user.friends.length : 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    const clerkId = req.auth && req.auth.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    let user = await User.findOne({ clerkId }).populate('friends', 'handle firstName lastName role')
    if (!user) {
      // Create a bare record if missing
      user = await User.create({ clerkId })
    }
    res.json({ user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// Onboarding (first time): set profile, role (immutable), and handle
const OnboardSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  age: z.number().int().min(1).max(120),
  role: z.enum(['student', 'teacher']),
  handle: z.string().trim().min(2).max(30),
  bio: z.string().trim().max(240).optional(),
  avatarUrl: z.string().url().max(500).optional(),
})

router.post('/onboard', async (req, res) => {
  try {
    const clerkId = req.auth && req.auth.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = OnboardSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() })
    }
    const { firstName, lastName, age, role, handle, bio, avatarUrl } = parsed.data

    let user = await User.findOne({ clerkId })
    if (!user) user = new User({ clerkId })

    if (user.onboarded && user.role && user.role !== role) {
      return res.status(400).json({ error: 'Role cannot be changed after onboarding' })
    }

    // require a unique handle chosen by the user
    const normalized = normalizeHandle(handle)
    if (!normalized) {
      return res.status(400).json({ error: 'Invalid handle format' })
    }
    const finalHandle = `@${normalized}`
    const existing = await User.findOne({ handle: finalHandle })
    if (existing && String(existing.clerkId) !== String(clerkId)) {
      return res.status(409).json({ error: 'Handle already taken' })
    }

    user.firstName = firstName
    user.lastName = lastName
    if (typeof age === 'number') user.age = age
    if (!user.role) user.role = role // immutable once set
    user.handle = finalHandle
    user.onboarded = true
    if (typeof bio === 'string') user.bio = bio
    if (typeof avatarUrl === 'string') user.avatarUrl = avatarUrl
    await user.save()

    res.json({ user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to onboard user' })
  }
})

// Lookup by handle
router.get('/by-handle/:handle', async (req, res) => {
  try {
    const requested = normalizeHandle(req.params.handle)
    if (!requested) return res.status(400).json({ error: 'Invalid handle' })
    const handle = `@${requested}`
    const user = await User.findOne({ handle }, 'handle firstName lastName role')
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to lookup handle' })
  }
})

// Update profile (role immutable)
const UpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
  age: z.number().int().min(1).max(120).optional(),
  handle: z.string().trim().min(2).max(30).optional(),
  bio: z.string().trim().max(240).optional(),
  avatarUrl: z.string().url().max(500).optional(),
  role: z.any().optional(), // explicitly blocked
})

router.patch('/me', async (req, res) => {
  try {
    const clerkId = req.auth && req.auth.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = UpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() })
    }
    const { firstName, lastName, age, handle, bio, avatarUrl, role } = parsed.data
    if (typeof role !== 'undefined') {
      return res.status(400).json({ error: 'Role cannot be changed' })
    }
    const user = await User.findOne({ clerkId })
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (typeof firstName === 'string') user.firstName = firstName
    if (typeof lastName === 'string') user.lastName = lastName
    if (typeof age === 'number') user.age = age
    if (typeof bio === 'string') user.bio = bio
    if (typeof avatarUrl === 'string') user.avatarUrl = avatarUrl

    if (typeof handle === 'string') {
      const norm = normalizeHandle(handle)
      if (!norm) return res.status(400).json({ error: 'Invalid handle format' })
      const desired = `@${norm}`
      const existing = await User.findOne({ handle: desired })
      if (existing && String(existing.clerkId) !== String(clerkId)) {
        return res.status(409).json({ error: 'Handle already taken' })
      }
      user.handle = desired
    }

    await user.save()
    const updated = await User.findById(user._id).populate('friends', 'handle firstName lastName role')
    res.json({ user: updated })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

publicRouter.get('/profiles/:handle', async (req, res) => {
  try {
    const normalized = normalizeHandle(req.params.handle)
    if (!normalized) return res.status(400).json({ error: 'Invalid handle' })
    const handle = `@${normalized}`
    const user = await User.findOne(
      { handle },
      'handle firstName lastName role age bio friends createdAt updatedAt'
    )
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ profile: buildPublicProfile(user) })
  } catch (err) {
    console.error('public profile lookup error', err)
    res.status(500).json({ error: 'Failed to load profile' })
  }
})

export default router
export { publicRouter as publicUsersRouter }
