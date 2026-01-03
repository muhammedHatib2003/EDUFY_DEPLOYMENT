import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import {
  Loader2,
  RefreshCw,
  Send,
  Heart,
  MessageCircle,
  Trash2,
  Image as ImageIcon,
  Video as VideoIcon,
  ArrowBigUp,
  ArrowBigDown,
  Search,
  X,
} from 'lucide-react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { authedApi, apiBase } from '../lib/api.js'

const MAX_TEXT = 560
const MAX_COMMENT = 280
const MAX_ATTACHMENTS = 4
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MEDIA_FRAME_CLASS = 'relative w-full overflow-hidden rounded-xl bg-base-200 aspect-[4/3] sm:aspect-video'
const MEDIA_CONTENT_CLASS = 'absolute inset-0 h-full w-full object-contain'

const initialComposer = { text: '', attachments: [] }
const initialQuestionComposer = { title: '', details: '', tags: '', attachments: [] }
const FEED_TABS = [
  { id: 'feed', label: 'Feed' },
  { id: 'qa', label: 'Q&A' },
]

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

function mediaSrc(media) {
  if (!media) return ''
  if (media.data?.startsWith('data:')) return media.data
  const mime = media.mimeType || (media.kind === 'video' ? 'video/mp4' : 'image/png')
  return `data:${mime};base64,${media.data}`
}

function profilePath(handle) {
  if (!handle || typeof handle !== 'string') return null
  const slug = handle.replace(/^@/, '').trim()
  if (!slug) return null
  return `/profiles/${slug}`
}

function authorDisplay(author) {
  if (!author) return 'User'
  if (typeof author === 'string') return author
  const name = [author.firstName, author.lastName].filter(Boolean).join(' ').trim()
  return author.name || author.handle || name || 'User'
}

function authorProfileLink(author) {
  if (!author) return null
  if (typeof author === 'string') {
    if (author.startsWith('@')) return profilePath(author)
    return null
  }
  return profilePath(author.handle)
}

function maxCommentVotes(comments = []) {
  let max = 0
  const walk = (list) => {
    for (const item of list || []) {
      if (item?.votesCount > max) max = item.votesCount
      if (Array.isArray(item?.replies) && item.replies.length) walk(item.replies)
    }
  }
  walk(comments)
  return max
}

export default function Feed() {
  const { getToken, userId } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [composer, setComposer] = useState(initialComposer)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [commentInputs, setCommentInputs] = useState({})
  const [commentingIds, setCommentingIds] = useState(new Set())
  const [expanded, setExpanded] = useState(new Set())
  const [replyInputs, setReplyInputs] = useState({})
  const [replyingIds, setReplyingIds] = useState(new Set())
  const [commentVotingIds, setCommentVotingIds] = useState(new Set())
  const [loadingComments, setLoadingComments] = useState(new Set())
  const [activeTab, setActiveTab] = useState('feed')
  const [questionComposer, setQuestionComposer] = useState(() => ({ ...initialQuestionComposer, attachments: [] }))
  const [answerDrafts, setAnswerDrafts] = useState({})
  const [questions, setQuestions] = useState([])
  const [replyDrafts, setReplyDrafts] = useState({})
  const [questionVotes, setQuestionVotes] = useState(() => new Set())
  const [questionQuery, setQuestionQuery] = useState('')
  const [questionsLoading, setQuestionsLoading] = useState(true)
  const [questionsRefreshing, setQuestionsRefreshing] = useState(false)
  const [questionSubmitting, setQuestionSubmitting] = useState(false)
  const [questionError, setQuestionError] = useState('')
  const [answeringIds, setAnsweringIds] = useState(new Set())
  const [replyingAnswerIds, setReplyingAnswerIds] = useState(new Set())
  const [votingQuestionIds, setVotingQuestionIds] = useState(new Set())
  const [votingAnswerIds, setVotingAnswerIds] = useState(new Set())
  const streamController = useRef(null)
  const reconnectTimeout = useRef(null)

  const hasPosts = useMemo(() => posts.length > 0, [posts])
  const sortedQuestions = useMemo(() => {
    return [...questions].sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [questions])
  const visibleQuestions = useMemo(() => {
    const query = questionQuery.trim().toLowerCase()
    if (!query) return sortedQuestions
    return sortedQuestions.filter((question) => {
      const haystack = [
        question.title,
        question.details,
        ...(question.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [sortedQuestions, questionQuery])

  const fetchPosts = useCallback(
    async (opts = {}) => {
      try {
        if (!opts?.silent) setRefreshing(true)
        const http = await authedApi(getToken)
        const { data } = await http.get('/feed', { params: { limit: 25 } })
        setPosts(Array.isArray(data.posts) ? data.posts : [])
      } catch (err) {
        console.error('Failed to load feed', err)
        setError(err?.response?.data?.error || 'Failed to load feed')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [getToken]
  )

  const fetchPostById = useCallback(
    async (postId) => {
      try {
        const http = await authedApi(getToken)
        const { data } = await http.get(`/feed/${postId}`)
        return data.post
      } catch (err) {
        console.error('Failed to fetch post', err)
        return null
      }
    },
    [getToken]
  )

  const fetchQuestions = useCallback(
    async (opts = {}) => {
      setQuestionError('')
      try {
        if (!opts?.silent) setQuestionsRefreshing(true)
        const http = await authedApi(getToken)
        const { data } = await http.get('/questions', { params: { limit: 50 } })
        setQuestions(Array.isArray(data?.questions) ? data.questions : [])
      } catch (err) {
        console.error('Failed to load questions', err)
        setQuestionError(err?.response?.data?.error || 'Failed to load questions')
      } finally {
        setQuestionsLoading(false)
        setQuestionsRefreshing(false)
      }
    },
    [getToken]
  )

  const loadComments = useCallback(
    async (postId) => {
      try {
        setLoadingComments((prev) => new Set(prev).add(postId))
        const http = await authedApi(getToken)
        const { data } = await http.get(`/feed/${postId}/comments`, { params: { limit: 50 } })
        const comments = Array.isArray(data.comments) ? data.comments : []
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments } : p)))
      } catch (err) {
        console.error('Failed to load comments', err)
        setError(err?.response?.data?.error || 'Unable to load comments')
      } finally {
        setLoadingComments((prev) => {
          const next = new Set(prev)
          next.delete(postId)
          return next
        })
      }
    },
    [getToken]
  )

  const attachEventStream = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    const controller = new AbortController()
    streamController.current = controller
    await fetchEventSource(`${apiBase}/feed/stream`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      onmessage: async (event) => {
        if (!event?.data) return
        try {
          const payload = JSON.parse(event.data)
          if (payload.actorId && payload.actorId === userId) return
          if (payload.type === 'post.deleted') {
            setPosts((prev) => prev.filter((p) => p.id !== payload.postId))
            return
          }
          const updated = await fetchPostById(payload.postId)
          if (!updated) return
          setPosts((prev) => {
            const idx = prev.findIndex((p) => p.id === updated.id)
            if (idx === -1) return payload.type === 'post.created' ? [updated, ...prev] : prev
            const clone = [...prev]
            clone[idx] = updated
            return clone
          })
        } catch (err) {
          console.error('Event parse error', err)
        }
      },
      onerror: (err) => {
        console.error('Feed stream error', err)
        controller.abort()
        streamController.current = null
        clearTimeout(reconnectTimeout.current)
        reconnectTimeout.current = setTimeout(() => {
          attachEventStream().catch(() => {})
        }, 3000)
      },
    })
  }, [fetchPostById, getToken, userId])

  useEffect(() => {
    fetchPosts()
    fetchQuestions()
    attachEventStream().catch((err) => console.error(err))
    return () => {
      streamController.current?.abort()
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
    }
  }, [attachEventStream, fetchPosts, fetchQuestions])

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const next = [...composer.attachments]
    for (const file of files) {
      if (next.length >= MAX_ATTACHMENTS) break
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" is too large (max 8MB)`)
        continue
      }
      const kind = file.type.startsWith('video') ? 'video' : 'image'
      if (kind === 'video' && !file.type.startsWith('video')) continue
      const base64 = await toBase64(file)
      if (!base64) continue
      const [meta, data] = base64.split(',')
      if (!meta || !data) continue
      const mimeType = meta.substring(meta.indexOf(':') + 1, meta.indexOf(';'))
      next.push({
        id: `${file.name}-${Date.now()}`,
        file,
        preview: base64,
        kind,
        data,
        mimeType,
      })
    }
    setComposer((prev) => ({ ...prev, attachments: next }))
    event.target.value = ''
  }

  const removeAttachment = (id) => {
    setComposer((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((att) => att.id !== id),
    }))
  }

  const handleQuestionFileChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const next = [...(questionComposer.attachments || [])]
    setQuestionError('')
    for (const file of files) {
      if (next.length >= MAX_ATTACHMENTS) break
      if (file.size > MAX_FILE_BYTES) {
        setQuestionError(`"${file.name}" is too large (max 8MB)`)
        continue
      }
      const kind = file.type.startsWith('video') ? 'video' : 'image'
      const base64 = await toBase64(file)
      if (!base64) continue
      const [meta, data] = base64.split(',')
      if (!meta || !data) continue
      const mimeType = meta.substring(meta.indexOf(':') + 1, meta.indexOf(';'))
      next.push({
        id: `question-${file.name}-${Date.now()}`,
        file,
        preview: base64,
        kind,
        data,
        mimeType,
      })
    }
    setQuestionComposer((prev) => ({ ...prev, attachments: next }))
    event.target.value = ''
  }

  const removeQuestionAttachment = (id) => {
    setQuestionComposer((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((att) => att.id !== id),
    }))
  }

  const submitPost = async (event) => {
    event.preventDefault()
    if (!composer.text.trim() && composer.attachments.length === 0) return
    try {
      setPosting(true)
      setError('')
      const http = await authedApi(getToken)
      const media = composer.attachments.map((att) => ({
        kind: att.kind,
        data: att.data,
        mimeType: att.mimeType,
      }))
      const { data } = await http.post('/feed', {
        text: composer.text,
        media,
      })
      if (data?.post) {
        setPosts((prev) => [data.post, ...prev.filter((p) => p.id !== data.post.id)])
      }
      setComposer(initialComposer)
    } catch (err) {
      console.error('Failed to create post', err)
      setError(err?.response?.data?.error || 'Unable to create post')
    } finally {
      setPosting(false)
    }
  }

  const toggleLike = async (postId) => {
    try {
      const http = await authedApi(getToken)
      const { data } = await http.post(`/feed/${postId}/like`)
      if (!data?.post) return
      setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)))
    } catch (err) {
      console.error('Failed to like', err)
      setError(err?.response?.data?.error || 'Unable to react to post')
    }
  }

  const deletePost = async (postId) => {
    if (!confirm('Delete this post?')) return
    try {
      const http = await authedApi(getToken)
      await http.delete(`/feed/${postId}`)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch (err) {
      console.error('Failed to delete post', err)
      setError(err?.response?.data?.error || 'Unable to delete post')
    }
  }

  const toggleComments = (postId) => {
    const isExpanded = expanded.has(postId)
    if (isExpanded) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    } else {
      loadComments(postId)
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add(postId)
        return next
      })
    }
  }

  const submitComment = async (postId) => {
    const text = (commentInputs[postId] || '').trim()
    if (!text) return
    try {
      setCommentingIds((prev) => new Set(prev).add(postId))
      const http = await authedApi(getToken)
      const { data } = await http.post(`/feed/${postId}/comments`, { text })
      if (data?.post) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)))
      }
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }))
    } catch (err) {
      console.error('Failed to comment', err)
      setError(err?.response?.data?.error || 'Unable to add comment')
    } finally {
      setCommentingIds((prev) => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    }
  }

  const submitCommentReply = async (postId, commentId) => {
    const text = (replyInputs[commentId] || '').trim()
    if (!text) return
    try {
      setReplyingIds((prev) => new Set(prev).add(commentId))
      const http = await authedApi(getToken)
      const { data } = await http.post(`/feed/${postId}/comments`, { text, parentId: commentId })
      if (data?.post) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)))
      }
      setReplyInputs((prev) => ({ ...prev, [commentId]: '' }))
    } catch (err) {
      console.error('Failed to reply', err)
      setError(err?.response?.data?.error || 'Unable to reply')
    } finally {
      setReplyingIds((prev) => {
        const next = new Set(prev)
        next.delete(commentId)
        return next
      })
    }
  }

  const voteComment = async (postId, commentId) => {
    if (commentVotingIds.has(commentId)) return
    try {
      setCommentVotingIds((prev) => new Set(prev).add(commentId))
      const http = await authedApi(getToken)
      const { data } = await http.post(`/feed/${postId}/comments/${commentId}/vote`)
      if (data?.comment) {
        const updated = data.comment
        const applyUpdate = (list = []) =>
          list.map((comment) => {
            if (comment.id === updated.id) {
              return { ...comment, votesCount: updated.votesCount || 0, voted: updated.voted }
            }
            const nextReplies = applyUpdate(comment.replies || [])
            if (nextReplies !== comment.replies) {
              return { ...comment, replies: nextReplies }
            }
            return comment
          })
        setPosts((prev) =>
          prev.map((post) => {
            if (post.id !== postId) return post
            return { ...post, comments: applyUpdate(post.comments || []) }
          })
        )
      }
    } catch (err) {
      console.error('Failed to vote on comment', err)
      setError(err?.response?.data?.error || 'Unable to vote on comment')
    } finally {
      setCommentVotingIds((prev) => {
        const next = new Set(prev)
        next.delete(commentId)
        return next
      })
    }
  }

  const submitQuestion = async (event) => {
    event.preventDefault()
    const title = questionComposer.title.trim()
    const details = questionComposer.details.trim()
    if (title.length < 3 || details.length < 3) {
      setQuestionError('Please add a title and details of at least 3 characters.')
      return
    }
    const tags = questionComposer.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 4)
    const attachments = (questionComposer.attachments || []).map((att) => ({
      kind: att.kind,
      data: att.data,
      mimeType: att.mimeType,
    }))

    try {
      setQuestionSubmitting(true)
      setQuestionError('')
      const http = await authedApi(getToken)
      const { data } = await http.post('/questions', {
        title,
        details,
        tags,
        attachments,
      })
      if (data?.question) {
        setQuestions((prev) => [data.question, ...prev.filter((q) => q.id !== data.question.id)])
      }
      setQuestionComposer(() => ({ ...initialQuestionComposer, attachments: [] }))
    } catch (err) {
      console.error('Failed to create question', err)
      setQuestionError(err?.response?.data?.error || 'Unable to create question')
    } finally {
      setQuestionSubmitting(false)
    }
  }

  const voteQuestion = async (questionId, delta) => {
    if (votingQuestionIds.has(questionId)) return
    try {
      setQuestionError('')
      setVotingQuestionIds((prev) => new Set(prev).add(questionId))
      const http = await authedApi(getToken)
      const { data } = await http.post(`/questions/${questionId}/vote`, { delta })
      if (data?.question) {
        setQuestions((prev) => prev.map((question) => (question.id === questionId ? data.question : question)))
        setQuestionVotes((prev) => {
          const next = new Set(prev)
          next.add(questionId)
          return next
        })
      }
    } catch (err) {
      console.error('Failed to vote on question', err)
      const message = err?.response?.data?.error
      if (typeof message === 'string' && message.toLowerCase().includes('already voted')) {
        setQuestionVotes((prev) => {
          const next = new Set(prev)
          next.add(questionId)
          return next
        })
      }
      setQuestionError(message || 'Unable to vote on question')
    } finally {
      setVotingQuestionIds((prev) => {
        const next = new Set(prev)
        next.delete(questionId)
        return next
      })
    }
  }

  const submitAnswer = async (questionId) => {
    const text = (answerDrafts[questionId] || '').trim()
    if (!text) return
    try {
      setAnsweringIds((prev) => new Set(prev).add(questionId))
      setQuestionError('')
      const http = await authedApi(getToken)
      const { data } = await http.post(`/questions/${questionId}/answers`, { body: text })
      if (data?.question) {
        setQuestions((prev) => prev.map((question) => (question.id === questionId ? data.question : question)))
        setAnswerDrafts((prev) => ({ ...prev, [questionId]: '' }))
      }
    } catch (err) {
      console.error('Failed to add answer', err)
      setQuestionError(err?.response?.data?.error || 'Unable to add answer')
    } finally {
      setAnsweringIds((prev) => {
        const next = new Set(prev)
        next.delete(questionId)
        return next
      })
    }
  }

  const submitReply = async (questionId, answerId) => {
    const key = `${questionId}:${answerId}`
    const text = (replyDrafts[key] || '').trim()
    if (!text) return
    try {
      setReplyingAnswerIds((prev) => new Set(prev).add(key))
      setQuestionError('')
      const http = await authedApi(getToken)
      const { data } = await http.post(`/questions/${questionId}/answers/${answerId}/replies`, { body: text })
      if (data?.question) {
        setQuestions((prev) => prev.map((question) => (question.id === questionId ? data.question : question)))
        setReplyDrafts((prev) => ({ ...prev, [key]: '' }))
      }
    } catch (err) {
      console.error('Failed to add reply', err)
      setQuestionError(err?.response?.data?.error || 'Unable to add reply')
    } finally {
      setReplyingAnswerIds((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const voteAnswer = async (questionId, answerId) => {
    if (votingAnswerIds.has(answerId)) return
    try {
      setVotingAnswerIds((prev) => new Set(prev).add(answerId))
      setQuestionError('')
      const http = await authedApi(getToken)
      const { data } = await http.post(`/questions/${questionId}/answers/${answerId}/vote`)
      if (data?.question) {
        setQuestions((prev) => prev.map((q) => (q.id === questionId ? data.question : q)))
      }
    } catch (err) {
      console.error('Failed to vote on answer', err)
      setQuestionError(err?.response?.data?.error || 'Unable to vote on answer')
    } finally {
      setVotingAnswerIds((prev) => {
        const next = new Set(prev)
        next.delete(answerId)
        return next
      })
    }
  }

  const renderMedia = (media) => {
    if (!media?.length) return null
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {media.map((item, index) => (
          <div key={`${item.data}-${index}`} className={MEDIA_FRAME_CLASS}>
            {item.kind === 'video' ? (
              <video controls className={MEDIA_CONTENT_CLASS} src={mediaSrc(item)} />
            ) : (
              <img className={MEDIA_CONTENT_CLASS} src={mediaSrc(item)} alt="Post attachment" />
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderComments = (post) => {
    if (!expanded.has(post.id)) return null

    const maxVotes = maxCommentVotes(post.comments || [])

    const renderCommentNode = (comment, isReply = false) => {
      const handle = comment.author?.handle
      const name =
        handle || [comment.author?.firstName, comment.author?.lastName].filter(Boolean).join(' ') || 'User'
      const link = profilePath(handle)
      const isReplying = replyingIds.has(comment.id)
      const replyValue = replyInputs[comment.id] || ''
      const isVoting = commentVotingIds.has(comment.id)
      const isTopVoted = maxVotes > 0 && comment.votesCount === maxVotes
      const isTeacher = comment.author?.role === 'teacher'
      const containerClass = (() => {
        if (isTeacher) {
          return `rounded-lg p-3 ${
            isReply ? 'ml-4 border-l-2 border-emerald-400 bg-emerald-50/80' : 'border border-emerald-400 bg-emerald-50/90 shadow-sm'
          }`
        }
        if (isTopVoted) {
          return `rounded-lg p-3 ${
            isReply ? 'ml-4 border-l-2 border-amber-300 bg-amber-50/80' : 'border border-amber-300 bg-amber-50/90 shadow-sm'
          }`
        }
        return `rounded-lg p-3 ${isReply ? 'bg-base-200/40 ml-4 border-l border-base-300' : 'bg-base-200/70'}`
      })()
      return (
        <div
          key={comment.id}
          className={containerClass}
        >
          <p className="text-sm font-semibold">
            {link ? (
              <Link to={link} className="hover:text-primary transition-colors">
                {name}
              </Link>
            ) : (
              name
            )}
          </p>
          <p className="text-sm text-base-content/80 whitespace-pre-wrap">{comment.text}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-base-content/60">
            <span>{formatTime(comment.createdAt)}</span>
            <button
              type="button"
              className={`btn btn-ghost btn-xs gap-1 ${comment.voted ? 'text-amber-600' : ''}`}
              onClick={() => voteComment(post.id, comment.id)}
              disabled={isVoting}
              title={comment.voted ? 'Remove vote' : 'Upvote comment'}
            >
              {isVoting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowBigUp className="w-3 h-3" />}
              <span className="tabular-nums text-sm">{comment.votesCount || 0}</span>
            </button>
          </div>

          {!isReply && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() =>
                  setReplyInputs((prev) => ({
                    ...prev,
                    [comment.id]: Object.prototype.hasOwnProperty.call(prev, comment.id) ? prev[comment.id] : '',
                  }))
                }
              >
                Reply
              </button>
            </div>
          )}

          {!isReply && Object.prototype.hasOwnProperty.call(replyInputs, comment.id) && (
            <div className="mt-2 flex items-center gap-2">
              <input
                className="input input-sm input-bordered flex-1"
                maxLength={MAX_COMMENT}
                placeholder="Write a reply"
                value={replyValue}
                onChange={(e) => setReplyInputs((prev) => ({ ...prev, [comment.id]: e.target.value }))}
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={() => submitCommentReply(post.id, comment.id)}
                disabled={!replyValue.trim() || isReplying}
              >
                {isReplying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}
              </button>
            </div>
          )}

          {Array.isArray(comment.replies) && comment.replies.length > 0 && (
            <div className="mt-3 space-y-2">
              {comment.replies.map((reply) => renderCommentNode(reply, true))}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {loadingComments.has(post.id) ? (
          <div className="flex items-center gap-2 text-sm text-base-content/70">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading comments...</span>
          </div>
        ) : (
          (post.comments || []).map((comment) => renderCommentNode(comment))
        )}
        <div className="flex items-center gap-2">
          <input
            className="input input-sm input-bordered flex-1"
            maxLength={MAX_COMMENT}
            placeholder="Write a comment"
            value={commentInputs[post.id] || ''}
            onChange={(e) => setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={() => submitComment(post.id)}
            disabled={!commentInputs[post.id]?.trim() || commentingIds.has(post.id)}
          >
            {commentingIds.has(post.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </button>
        </div>
      </div>
    )
  }

  const renderPost = (post) => {
    const authorHandle = post.author?.handle
    const authorName =
      [post.author?.firstName, post.author?.lastName].filter(Boolean).join(' ') || authorHandle || 'User'
    const authorLink = profilePath(authorHandle)

    return (
      <article key={post.id} className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                {authorLink ? (
                  <Link to={authorLink} className="hover:text-primary transition-colors">
                    {authorName}
                  </Link>
                ) : (
                  authorName
                )}
              </p>
              {authorHandle &&
                (authorLink ? (
                  <Link to={authorLink} className="text-xs text-primary">
                    {authorHandle}
                  </Link>
                ) : (
                  <p className="text-xs text-base-content/60">{authorHandle}</p>
                ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-base-content/60">
              <span>{formatTime(post.createdAt)}</span>
              {post.canDelete && (
                <button className="btn btn-ghost btn-xs" onClick={() => deletePost(post.id)} title="Delete post">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {post.text && <p className="text-base-content/90 whitespace-pre-wrap">{post.text}</p>}
          {renderMedia(post.media)}

          <div className="flex items-center gap-4 text-sm text-base-content/70">
            <button
              className={`btn btn-sm ${post.liked ? 'btn-error text-error-content' : 'btn-ghost'}`}
              onClick={() => toggleLike(post.id)}
            >
              <Heart className={`w-4 h-4 ${post.liked ? 'fill-current' : ''}`} />
              <span className="ml-2">{post.likesCount || 0}</span>
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => toggleComments(post.id)}>
              <MessageCircle className="w-4 h-4" />
              <span className="ml-2">{post.commentsCount || 0}</span>
            </button>
          </div>

          {renderComments(post)}
        </div>
      </article>
    )
  }

  const renderQuestionCard = (question) => {
    const answers = question.answers || []
    const answersToShow = answers.slice(0, 3)
    const hiddenAnswers = Math.max(answers.length - answersToShow.length, 0)
    const maxAnswerVotes = answers.reduce((m, a) => Math.max(m, a.votes || 0), 0)
    const questionAuthorName = authorDisplay(question.author)
    const questionAuthorLink = authorProfileLink(question.author)
    return (
      <article key={question.id} className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body space-y-4">
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-xl font-semibold">{question.title}</h3>
              <p className="text-sm text-base-content/60">
                Asked by{' '}
                {questionAuthorLink ? (
                  <Link to={questionAuthorLink} className="font-medium text-base-content hover:text-primary transition-colors">
                    {questionAuthorName}
                  </Link>
                ) : (
                  <span className="font-medium text-base-content">{questionAuthorName}</span>
                )}{' '}
                - {formatTime(question.createdAt)}
              </p>
            </div>
          </div>

          <p className="text-base-content/90 whitespace-pre-wrap">{question.details}</p>

          {question.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {question.tags.map((tag) => (
                <span key={`${question.id}-${tag}`} className="badge badge-outline">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {question.attachments?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {question.attachments.map((attachment, idx) => (
                <div key={attachment.id || `${question.id}-attachment-${idx}`} className={MEDIA_FRAME_CLASS}>
                  {attachment.kind === 'video' ? (
                    <video controls className={MEDIA_CONTENT_CLASS} src={mediaSrc(attachment)} />
                  ) : (
                    <img className={MEDIA_CONTENT_CLASS} src={mediaSrc(attachment)} alt="Question attachment" />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              {answers.length ? `${answers.length} Answer${answers.length === 1 ? '' : 's'}` : 'Be the first to answer'}
            </p>
            <div className="space-y-3">
              {answersToShow.map((answer) => {
                const replyKey = `${question.id}:${answer.id}`
                const isReplying = replyingAnswerIds.has(replyKey)
                const isAnswerVoting = votingAnswerIds.has(answer.id)
                const isTopAnswer = maxAnswerVotes > 0 && (answer.votes || 0) === maxAnswerVotes
                const answerAuthorName = authorDisplay(answer.author)
                const answerAuthorLink = authorProfileLink(answer.author)
                return (
                  <div
                    key={answer.id}
                    className={`rounded-xl p-3 ${
                      isTopAnswer ? 'bg-amber-50 border border-amber-300 shadow-sm' : 'bg-base-200/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-base-content">
                        {answerAuthorLink ? (
                          <Link to={answerAuthorLink} className="hover:text-primary transition-colors">
                            {answerAuthorName}
                          </Link>
                        ) : (
                          answerAuthorName
                        )}
                      </p>
                      <button
                        className={`btn btn-ghost btn-xs gap-1 ${answer.voted ? 'text-amber-600' : ''}`}
                        onClick={() => voteAnswer(question.id, answer.id)}
                        disabled={isAnswerVoting}
                        title={answer.voted ? 'Remove vote' : 'Upvote answer'}
                      >
                        {isAnswerVoting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowBigUp className="w-3 h-3" />}
                        <span className="tabular-nums">{answer.votes || 0}</span>
                      </button>
                    </div>
                    <p className="text-sm text-base-content/80 whitespace-pre-wrap">{answer.body}</p>
                    <p className="text-xs text-base-content/60 mt-1">{formatTime(answer.createdAt)}</p>
                    {(answer.replies || []).length > 0 && (
                      <div className="mt-3 space-y-2 border-l-2 border-base-300 pl-3">
                        {(answer.replies || []).map((reply) => (
                          <div key={reply.id}>
                            <p className="text-sm font-semibold text-base-content">
                              {authorProfileLink(reply.author) ? (
                                <Link to={authorProfileLink(reply.author)} className="hover:text-primary transition-colors">
                                  {authorDisplay(reply.author)}
                                </Link>
                              ) : (
                                authorDisplay(reply.author)
                              )}
                            </p>
                            <p className="text-sm text-base-content/80 whitespace-pre-wrap">{reply.body}</p>
                            <p className="text-xs text-base-content/50 mt-0.5">{formatTime(reply.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <textarea
                        className="textarea textarea-bordered flex-1 textarea-sm"
                        rows={2}
                        placeholder="Add a reply"
                        maxLength={200}
                        value={replyDrafts[replyKey] || ''}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [replyKey]: e.target.value }))}
                      />
                      <button
                        className="btn btn-sm btn-outline shrink-0"
                        type="button"
                        onClick={() => submitReply(question.id, answer.id)}
                        disabled={!replyDrafts[replyKey]?.trim() || isReplying}
                      >
                        {isReplying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {hiddenAnswers > 0 && (
                <p className="text-xs text-base-content/60">+{hiddenAnswers} more answer{hiddenAnswers === 1 ? '' : 's'} hidden</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                className="textarea textarea-bordered flex-1"
                rows={2}
                placeholder="Share your answer..."
                maxLength={MAX_COMMENT}
                value={answerDrafts[question.id] || ''}
                onChange={(e) => setAnswerDrafts((prev) => ({ ...prev, [question.id]: e.target.value }))}
              />
              <button
                className="btn btn-primary shrink-0"
                type="button"
                onClick={() => submitAnswer(question.id)}
                disabled={!answerDrafts[question.id]?.trim() || answeringIds.has(question.id)}
              >
                {answeringIds.has(question.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Answer'}
              </button>
            </div>
          </div>
        </div>
      </article>
    )
  }

  const renderFeedSection = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          <div className="skeleton h-32" />
          <div className="skeleton h-64" />
        </div>
      )
    }

    return (
      <>
        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}

        <section className="card bg-base-100 border border-base-300 shadow-sm">
          <div className="card-body space-y-4">
            <h2 className="card-title text-lg">Compose</h2>
            <form className="space-y-3" onSubmit={submitPost}>
              <textarea
                className="textarea textarea-bordered w-full min-h-[140px] resize-none"
                placeholder="What's happening?"
                maxLength={MAX_TEXT}
                value={composer.text}
                onChange={(e) => setComposer((prev) => ({ ...prev, text: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-sm btn-ghost gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Photo
                  <input type="file" accept="image/*" hidden multiple onChange={handleFileChange} />
                </label>
                <label className="btn btn-sm btn-ghost gap-2">
                  <VideoIcon className="w-4 h-4" />
                  Video
                  <input type="file" accept="video/*" hidden multiple onChange={handleFileChange} />
                </label>
                <span className="text-sm text-base-content/60 ml-auto">{MAX_TEXT - composer.text.length} characters left</span>
              </div>
              {composer.attachments.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {composer.attachments.map((att) => (
                <div key={att.id} className={MEDIA_FRAME_CLASS}>
                  {att.kind === 'video' ? (
                    <video className={MEDIA_CONTENT_CLASS} src={att.preview} controls />
                  ) : (
                    <img className={MEDIA_CONTENT_CLASS} src={att.preview} alt={att.file.name} />
                  )}
                      <button
                        type="button"
                        className="btn btn-xs btn-error absolute top-2 right-2 btn-circle z-10"
                        onClick={() => removeAttachment(att.id)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  className="btn btn-primary gap-2"
                  type="submit"
                  disabled={posting || (!composer.text.trim() && composer.attachments.length === 0)}
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Post
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="space-y-4">
          {!hasPosts && (
            <div className="card bg-base-100 border border-dashed border-base-300 text-center py-12">
              <p className="font-semibold mb-2">No posts yet</p>
              <p className="text-base-content/60">Share something to get the conversation started.</p>
            </div>
          )}
          {posts.map((post) => renderPost(post))}
        </section>
      </>
    )
  }

  const renderQuestionsSection = () => {
    if (questionsLoading) {
      return (
        <div className="space-y-4">
          <div className="skeleton h-20" />
          <div className="skeleton h-64" />
        </div>
      )
    }

    return (
      <>
        {questionError && (
          <div className="alert alert-error">
            <span>{questionError}</span>
          </div>
        )}

        <section className="card bg-base-100 border border-base-300 shadow-sm">
          <div className="card-body space-y-2">
            <label className="input input-bordered flex items-center gap-2">
              <Search className="w-4 h-4 opacity-70" />
              <input
                type="text"
                className="grow"
                placeholder="Search questions, tags, or details"
                value={questionQuery}
                onChange={(e) => setQuestionQuery(e.target.value)}
              />
              {questionQuery && (
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => setQuestionQuery('')}>
                  Clear
                </button>
              )}
            </label>
            <p className="text-xs text-base-content/60">
              Search works instantly - perfect for finding similar threads before posting. Showing {visibleQuestions.length} of {sortedQuestions.length} questions.
            </p>
          </div>
        </section>

        <section className="card bg-base-100 border border-base-300 shadow-sm">
          <div className="card-body space-y-4">
            <h2 className="card-title text-lg">Ask the community</h2>
            <form className="space-y-3" onSubmit={submitQuestion}>
              <input
                className="input input-bordered w-full"
                placeholder="Your question in one sentence"
                maxLength={150}
                value={questionComposer.title}
                onChange={(e) => setQuestionComposer((prev) => ({ ...prev, title: e.target.value }))}
              />
              <textarea
                className="textarea textarea-bordered w-full min-h-[150px]"
                placeholder="Add details, what you tried, and what you expect - just like Reddit threads."
                maxLength={800}
                value={questionComposer.details}
                onChange={(e) => setQuestionComposer((prev) => ({ ...prev, details: e.target.value }))}
              />
              <input
                className="input input-bordered w-full"
                placeholder="Tags (comma separated, e.g. math, project, #react)"
                maxLength={80}
                value={questionComposer.tags}
                onChange={(e) => setQuestionComposer((prev) => ({ ...prev, tags: e.target.value }))}
              />
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <label className="btn btn-sm btn-ghost gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Reference image
                    <input type="file" accept="image/*" hidden multiple onChange={handleQuestionFileChange} />
                  </label>
                  <label className="btn btn-sm btn-ghost gap-2">
                    <VideoIcon className="w-4 h-4" />
                    Reference video
                    <input type="file" accept="video/*" hidden multiple onChange={handleQuestionFileChange} />
                  </label>
                  <span className="text-xs text-base-content/60 ml-auto">
                    {questionComposer.attachments?.length || 0}/{MAX_ATTACHMENTS} attachments
                  </span>
                </div>
                {questionComposer.attachments?.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {questionComposer.attachments.map((att) => (
                      <div key={att.id} className={MEDIA_FRAME_CLASS}>
                        {att.kind === 'video' ? (
                          <video className={MEDIA_CONTENT_CLASS} src={att.preview} controls />
                        ) : (
                          <img className={MEDIA_CONTENT_CLASS} src={att.preview} alt="Question attachment preview" />
                        )}
                        <button
                          type="button"
                          className="btn btn-xs btn-error absolute top-2 right-2 btn-circle z-10"
                          onClick={() => removeQuestionAttachment(att.id)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={
                    questionSubmitting ||
                    questionComposer.title.trim().length < 3 ||
                    questionComposer.details.trim().length < 3
                  }
                >
                  {questionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ask Question'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="space-y-4">
          {!visibleQuestions.length && (
            <div className="card bg-base-100 border border-dashed border-base-300 text-center py-12">
              <p className="font-semibold mb-2">
                {questionQuery ? 'No matches found' : 'No questions yet'}
              </p>
              <p className="text-base-content/60">
                {questionQuery ? 'Try a different keyword or clear the search filter.' : 'Kick things off by asking for help or sharing your knowledge.'}
              </p>
            </div>
          )}
          {visibleQuestions.map((question) => renderQuestionCard(question))}
        </section>
      </>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Community Hub</h1>
          <p className="text-base-content/60">
            Toggle between the realtime feed and a Reddit-style space for deep dives and answers.
          </p>
        </div>
        {activeTab === 'feed' ? (
          <button className="btn btn-ghost btn-sm gap-2" onClick={() => fetchPosts({ silent: true })} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        ) : (
          <button
            className="btn btn-ghost btn-sm gap-2"
            onClick={() => fetchQuestions()}
            disabled={questionsRefreshing}
          >
            {questionsRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        )}
      </header>

      <div className="tabs tabs-boxed bg-base-200/60 w-fit">
        {FEED_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'tab-active font-semibold' : ''}`}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'feed' ? renderFeedSection() : renderQuestionsSection()}
    </div>
  )
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
