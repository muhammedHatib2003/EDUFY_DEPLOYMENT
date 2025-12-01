import express from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'
import EventEmitter from 'events'
import FeedPost from '../models/FeedPost.js'
import FeedComment from '../models/FeedComment.js'
import User from '../models/User.js'
import { normalizeHandle } from '../utils/handle.js'

const router = express.Router()
const publicRouter = express.Router()
const feedEvents = new EventEmitter()
feedEvents.setMaxListeners(0)
const MAX_MEDIA_BYTES = 8 * 1024 * 1024

const MediaInput = z.object({
  kind: z.enum(['image', 'video']),
  data: z.string().min(10),
  mimeType: z.string().optional(),
})

const CreateSchema = z
  .object({
    text: z.string().trim().max(560).optional(),
    media: z.array(MediaInput).max(4).optional(),
  })
  .refine(
    (data) => {
      const hasText = Boolean(data.text && data.text.trim().length)
      const hasMedia = Array.isArray(data.media) && data.media.length > 0
      return hasText || hasMedia
    },
    { message: 'Post must include text or media', path: ['text'] }
  )

const CommentSchema = z.object({
  text: z.string().trim().min(1).max(280),
  parentId: z.string().optional(),
})

const ListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  before: z.string().optional(),
})

function serializeUser(user) {
  return user
    ? {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        handle: user.handle,
        role: user.role,
      }
    : null
}

function serializeComment(comment, replies = null, viewerId = null) {
  const voterIds = (comment.voters || []).map((id) => String(id))
  const voted = viewerId ? voterIds.includes(String(viewerId)) : false
  return {
    id: comment._id,
    text: comment.text,
    createdAt: comment.createdAt,
    author: serializeUser(comment.author),
    parentId: comment.parent ? String(comment.parent) : null,
    votesCount: comment.votesCount || 0,
    voted,
    replies: Array.isArray(replies) ? replies : Array.isArray(comment.replies) ? comment.replies : [],
  }
}

function serializePost(post, viewerId, comments = []) {
  const likeIds = (post.likes || []).map((id) => String(id))
  const viewerLiked = viewerId ? likeIds.includes(String(viewerId)) : false
  return {
    id: post._id,
    text: post.text,
    media: (post.media || []).map((item) => ({
      kind: item.kind,
      mimeType: item.mimeType,
      data: item.data,
    })),
    author: serializeUser(post.author),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    likesCount: likeIds.length,
    liked: viewerLiked,
    canDelete: viewerId ? String(post.author?._id || post.author) === String(viewerId) : false,
    commentsCount: post.commentsCount || 0,
    comments,
  }
}

function buildNestedComments(roots, replies, viewerId = null) {
  const rootNodes = roots.map((root) => serializeComment(root, [], viewerId))
  const rootMap = new Map(rootNodes.map((node) => [String(node.id), node]))

  for (const reply of replies) {
    const parentId = String(reply.parent)
    const parent = rootMap.get(parentId)
    if (!parent) continue
    parent.replies.push(serializeComment(reply, [], viewerId))
  }

  for (const node of rootNodes) {
    node.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  }

  return rootNodes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

async function fetchPreviewComments(postId, limit = 3, includeRootIds = [], viewerId = null) {
  const includeIds = (includeRootIds || []).map((id) => String(id))
  const roots = await FeedComment.find({ post: postId, parent: null })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('author', 'firstName lastName handle role')

  const existingIds = new Set(roots.map((c) => String(c._id)))
  const missingInclude = includeIds.filter((id) => !existingIds.has(id) && mongoose.Types.ObjectId.isValid(id))
  if (missingInclude.length) {
    const extras = await FeedComment.find({ _id: { $in: missingInclude }, post: postId, parent: null }).populate(
      'author',
      'firstName lastName handle role'
    )
    roots.push(...extras)
  }

  const rootIds = roots.map((c) => c._id)
  const replies = rootIds.length
    ? await FeedComment.find({ post: postId, parent: { $in: rootIds } })
        .sort({ createdAt: 1 })
        .populate('author', 'firstName lastName handle role')
    : []

  return buildNestedComments(roots, replies, viewerId)
}

async function buildPostResponse(post, viewerId, commentLimit = 3, includeRootIds = []) {
  const comments = await fetchPreviewComments(post._id, commentLimit, includeRootIds, viewerId)
  return serializePost(post, viewerId, comments)
}

async function fetchCommentThreadsForPosts(postIds, limitPerPost = 3, viewerId = null) {
  if (!postIds.length) return new Map()

  const roots = await FeedComment.find({ post: { $in: postIds }, parent: null })
    .sort({ createdAt: -1 })
    .limit(postIds.length * limitPerPost)
    .populate('author', 'firstName lastName handle role')

  const rootsByPost = new Map()
  for (const root of roots) {
    const key = String(root.post)
    const list = rootsByPost.get(key) || []
    if (list.length < limitPerPost) {
      list.push(root)
      rootsByPost.set(key, list)
    }
  }

  const rootIds = Array.from(rootsByPost.values())
    .flat()
    .map((c) => c._id)

  const replies = rootIds.length
    ? await FeedComment.find({ parent: { $in: rootIds } })
        .sort({ createdAt: 1 })
        .populate('author', 'firstName lastName handle role')
    : []

  const repliesByParent = new Map()
  for (const reply of replies) {
    const key = String(reply.parent)
    if (!repliesByParent.has(key)) repliesByParent.set(key, [])
    repliesByParent.get(key).push(reply)
  }

  const result = new Map()
  for (const [postId, rootList] of rootsByPost.entries()) {
    const nested = buildNestedComments(
      rootList,
      rootList.flatMap((root) => repliesByParent.get(String(root._id)) || []),
      viewerId
    )
    result.set(postId, nested)
  }

  return result
}

function emitPostEvent(type, postId, actorId = null) {
  feedEvents.emit('event', {
    type,
    postId: String(postId),
    actorId: actorId ? String(actorId) : null,
    at: Date.now(),
  })
}

router.get('/stream', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).end()
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    res.flushHeaders?.()

    const listener = (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
    feedEvents.on('event', listener)
    const keepAlive = setInterval(() => {
      res.write(': ping\n\n')
    }, 25000)

    req.on('close', () => {
      clearInterval(keepAlive)
      feedEvents.off('event', listener)
    })
  } catch (err) {
    console.error('feed stream error', err)
    res.end()
  }
})

router.get('/', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    const parsed = ListSchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid query' })
    const { limit = 20, before } = parsed.data

    const viewer = clerkId ? await User.findOne({ clerkId }).select('_id') : null

    const query = {}
    if (before && mongoose.Types.ObjectId.isValid(before)) {
      query._id = { $lt: new mongoose.Types.ObjectId(before) }
    }

    const posts = await FeedPost.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'firstName lastName handle role')

    const postIds = posts.map((p) => p._id)
    const commentMap = await fetchCommentThreadsForPosts(postIds, 3, viewer?._id || null)

    const payload = posts.map((post) => {
      const list = commentMap.get(String(post._id)) || []
      return serializePost(post, viewer?._id || null, list)
    })
    res.json({ posts: payload })
  } catch (err) {
    console.error('feed list error', err)
    res.status(500).json({ error: 'Failed to load feed' })
  }
})

router.post('/', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = CreateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors?.[0]?.message || 'Invalid payload' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const media = (parsed.data.media || []).map((item) => {
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

    const post = await FeedPost.create({
      author: me._id,
      text: parsed.data.text?.trim(),
      media,
      likes: [],
      commentsCount: 0,
    })

    await post.populate('author', 'firstName lastName handle role')
    const response = await buildPostResponse(post, me._id)
    emitPostEvent('post.created', post._id, clerkId)
    res.status(201).json({ post: response })
  } catch (err) {
    if (err.message === 'Media exceeds max size') {
      return res.status(400).json({ error: 'Each attachment must be smaller than 8MB' })
    }
    console.error('feed create error', err)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

router.post('/:id/like', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const postId = req.params.id
    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const post = await FeedPost.findById(postId).populate('author', 'firstName lastName handle role')
    if (!post) return res.status(404).json({ error: 'Post not found' })

    const meString = String(me._id)
    const liked = (post.likes || []).some((id) => String(id) === meString)
    if (liked) {
      post.likes = post.likes.filter((id) => String(id) !== meString)
    } else {
      post.likes = [...(post.likes || []), me._id]
    }
    await post.save()

    const response = await buildPostResponse(post, me._id)
    emitPostEvent('post.updated', post._id, clerkId)
    res.json({ post: response })
  } catch (err) {
    console.error('feed like error', err)
    res.status(500).json({ error: 'Failed to update reaction' })
  }
})

router.post('/:id/comments', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const parsed = CommentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid comment' })
    const postId = req.params.id

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const post = await FeedPost.findById(postId).populate('author', 'firstName lastName handle role')
    if (!post) return res.status(404).json({ error: 'Post not found' })

    let parentComment = null
    if (parsed.data.parentId) {
      if (!mongoose.Types.ObjectId.isValid(parsed.data.parentId)) {
        return res.status(400).json({ error: 'Invalid parent comment' })
      }
      parentComment = await FeedComment.findById(parsed.data.parentId)
      if (!parentComment || String(parentComment.post) !== String(postId)) {
        return res.status(400).json({ error: 'Parent comment not found' })
      }
      if (parentComment.parent) {
        return res.status(400).json({ error: 'Replies to replies are not supported' })
      }
    }

    const comment = await FeedComment.create({
      post: post._id,
      author: me._id,
      text: parsed.data.text.trim(),
      parent: parentComment ? parentComment._id : null,
    })
    await comment.populate('author', 'firstName lastName handle role')

    post.commentsCount = (post.commentsCount || 0) + 1
    await post.save()

    const response = await buildPostResponse(post, me._id, 50, parentComment ? [parentComment._id] : [])
    emitPostEvent('post.updated', post._id, clerkId)
    res.status(201).json({ comment: serializeComment(comment, null, me._id), post: response })
  } catch (err) {
    console.error('feed comment error', err)
    res.status(500).json({ error: 'Failed to add comment' })
  }
})

router.post('/:postId/comments/:commentId/vote', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const { postId, commentId } = req.params
    if (!mongoose.Types.ObjectId.isValid(commentId)) return res.status(400).json({ error: 'Invalid comment' })

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const comment = await FeedComment.findById(commentId).populate('author', 'firstName lastName handle role')
    if (!comment || String(comment.post) !== String(postId)) {
      return res.status(404).json({ error: 'Comment not found' })
    }

    const meString = String(me._id)
    const alreadyVoted = (comment.voters || []).some((id) => String(id) === meString)
    if (alreadyVoted) {
      comment.voters = (comment.voters || []).filter((id) => String(id) !== meString)
      comment.votesCount = Math.max(0, (comment.votesCount || 0) - 1)
    } else {
      comment.voters = [...(comment.voters || []), me._id]
      comment.votesCount = (comment.votesCount || 0) + 1
    }
    await comment.save()

    res.json({ comment: serializeComment(comment, null, me._id) })
  } catch (err) {
    console.error('feed comment vote error', err)
    res.status(500).json({ error: 'Failed to vote on comment' })
  }
})

router.get('/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id
    const clerkId = req.auth?.userId
    const viewer = clerkId ? await User.findOne({ clerkId }).select('_id') : null
    const parsed = ListSchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid query' })
    const { limit = 20, before } = parsed.data

    const rootFilter = { post: postId, parent: null }
    if (before && mongoose.Types.ObjectId.isValid(before)) {
      rootFilter._id = { $lt: new mongoose.Types.ObjectId(before) }
    }

    const roots = await FeedComment.find(rootFilter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'firstName lastName handle role')

    const rootIds = roots.map((c) => c._id)
    const replies = rootIds.length
      ? await FeedComment.find({ post: postId, parent: { $in: rootIds } })
          .sort({ createdAt: 1 })
          .populate('author', 'firstName lastName handle role')
      : []

    res.json({
      comments: buildNestedComments(roots, replies, viewer?._id || null),
    })
  } catch (err) {
    console.error('feed comment list error', err)
    res.status(500).json({ error: 'Failed to load comments' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    const me = clerkId ? await User.findOne({ clerkId }) : null

    const post = await FeedPost.findById(req.params.id).populate('author', 'firstName lastName handle role')
    if (!post) return res.status(404).json({ error: 'Post not found' })

    const response = await buildPostResponse(post, me?._id || null, 50)
    res.json({ post: response })
  } catch (err) {
    console.error('feed show error', err)
    res.status(500).json({ error: 'Failed to load post' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const clerkId = req.auth?.userId
    if (!clerkId) return res.status(401).json({ error: 'Unauthorized' })
    const postId = req.params.id

    const me = await User.findOne({ clerkId })
    if (!me) return res.status(404).json({ error: 'User not found' })

    const post = await FeedPost.findById(postId)
    if (!post) return res.status(404).json({ error: 'Post not found' })
    if (String(post.author) !== String(me._id)) return res.status(403).json({ error: 'Not allowed' })

    await FeedComment.deleteMany({ post: post._id })
    await FeedPost.deleteOne({ _id: post._id })
    emitPostEvent('post.deleted', post._id, clerkId)
    res.json({ ok: true })
  } catch (err) {
    console.error('feed delete error', err)
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

publicRouter.get('/profiles/:handle/posts', async (req, res) => {
  try {
    const parsed = ListSchema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid query' })
    const { limit = 20, before } = parsed.data
    const normalized = normalizeHandle(req.params.handle)
    if (!normalized) return res.status(400).json({ error: 'Invalid handle' })
    const handle = `@${normalized}`

    const [targetUser, viewer] = await Promise.all([
      User.findOne({ handle }).select('_id'),
      req.auth?.userId ? User.findOne({ clerkId: req.auth.userId }).select('_id') : null,
    ])
    if (!targetUser) return res.status(404).json({ error: 'User not found' })

    const query = { author: targetUser._id }
    if (before && mongoose.Types.ObjectId.isValid(before)) {
      query._id = { $lt: new mongoose.Types.ObjectId(before) }
    }

    const posts = await FeedPost.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', 'firstName lastName handle role')

    const postIds = posts.map((p) => p._id)
    const commentMap = await fetchCommentThreadsForPosts(postIds, 3, viewer?._id || null)

    const viewerId = viewer?._id || null
    const payload = posts.map((post) => {
      const list = commentMap.get(String(post._id)) || []
      return serializePost(post, viewerId, list)
    })
    res.json({ posts: payload })
  } catch (err) {
    console.error('public feed list error', err)
    res.status(500).json({ error: 'Failed to load posts' })
  }
})

export default router
export { publicRouter as publicFeedRouter }
