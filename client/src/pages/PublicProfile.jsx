import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, Loader2, MessageCircle, Users } from 'lucide-react'
import api from '../lib/api'

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

export default function PublicProfile() {
  const { handle: rawHandle } = useParams()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const safeHandle = useMemo(() => (rawHandle || '').replace(/^@/, '').trim(), [rawHandle])

  useEffect(() => {
    const load = async () => {
      if (!safeHandle) {
        setError('Invalid profile handle')
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError('')
        const token = await getToken().catch(() => null)
        const http = api.authedApi(token)
        const handleParam = encodeURIComponent(safeHandle)
        const [profileRes, postsRes] = await Promise.all([
          http.get(`/public/users/profiles/${handleParam}`),
          http.get(`/public/feed/profiles/${handleParam}/posts`),
        ])
        setProfile(profileRes.data.profile)
        setPosts(Array.isArray(postsRes.data.posts) ? postsRes.data.posts : [])
      } catch (err) {
        console.error('public profile load error', err)
        setError(err?.response?.data?.error || 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [safeHandle, getToken])

  const header = (
    <div className="flex items-center gap-2 text-sm text-base-content/70">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>
      <Link className="link text-primary" to="/feed">
        Go to Feed
      </Link>
    </div>
  )

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-10 space-y-6">
        {header}
        <div className="flex items-center gap-2 text-base-content/70">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading profile…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-10 space-y-4">
        {header}
        <div className="alert alert-error">{error}</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto py-10 space-y-4">
        {header}
        <div className="alert alert-warning">Profile not found</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-6">
      {header}

      <section className="bg-base-100/70 backdrop-blur rounded-2xl border border-base-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="avatar placeholder">
            <div className="w-24 h-24 rounded-full bg-primary text-primary-content text-3xl font-bold flex items-center justify-center">
              {profile.handle?.charAt(1)?.toUpperCase() || profile.firstName?.charAt(0) || profile.lastName?.charAt(0) || '?'}
            </div>
          </div>
          <div className="flex-1 text-center sm:text-left space-y-2">
            <div>
              <h1 className="text-3xl font-bold">
                {[profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Unnamed'}
              </h1>
              <p className="text-base-content/60">{profile.handle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-base-content/70 justify-center sm:justify-start">
              {profile.role && <span className="badge badge-primary badge-outline uppercase">{profile.role}</span>}
              {typeof profile.age === 'number' && <span>{profile.age} years old</span>}
              {profile.createdAt && <span>Joined {new Date(profile.createdAt).toLocaleDateString()}</span>}
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {profile.friendsCount || 0} friends
              </span>
            </div>
          </div>
        </div>

        {profile.bio && (
          <div className="bg-base-200 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-1">About</h2>
            <p className="text-base-content/80 whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Recent Posts</h2>
            <p className="text-base-content/60">What {profile.firstName || profile.handle} has shared publicly.</p>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="card bg-base-100 border border-dashed border-base-200">
            <div className="card-body text-center space-y-2">
              <p className="font-semibold">No posts yet</p>
              <p className="text-base-content/60">This user hasn't shared anything yet.</p>
            </div>
          </div>
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </section>
    </div>
  )
}

function PostCard({ post }) {
  return (
    <article className="card bg-base-100 border border-base-200 shadow-sm">
      <div className="card-body space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              {[post.author?.firstName, post.author?.lastName].filter(Boolean).join(' ') || post.author?.handle || 'User'}
            </p>
            {post.author?.handle && (
              <Link to={`/profiles/${post.author.handle.replace(/^@/, '')}`} className="text-xs text-primary">
                {post.author.handle}
              </Link>
            )}
          </div>
          <span className="text-xs text-base-content/60">{formatTime(post.createdAt)}</span>
        </div>

        {post.text && <p className="text-base-content/80 whitespace-pre-wrap">{post.text}</p>}

        {post.media && post.media.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {post.media.map((item, idx) => (
              <div key={idx} className="rounded-xl overflow-hidden border border-base-200">
                {item.kind === 'video' ? (
                  <video className="w-full max-h-72 object-cover" controls src={mediaSrc(item)} />
                ) : (
                  <img className="w-full max-h-72 object-cover" src={mediaSrc(item)} alt="Post media" />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-base-content/70">
          <span className="inline-flex items-center gap-1">
            <Heart className={`w-4 h-4 ${post.liked ? 'fill-current text-error' : ''}`} />
            {post.likesCount || 0} {post.likesCount === 1 ? 'Like' : 'Likes'}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="w-4 h-4" />
            {post.commentsCount || 0} {post.commentsCount === 1 ? 'Comment' : 'Comments'}
          </span>
        </div>
      </div>
    </article>
  )
}
