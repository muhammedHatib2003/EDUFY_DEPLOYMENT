import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../lib/api'
import Tabs from '../components/Tabs.jsx'
import VideoCall from './VideoCall.jsx'
import { StreamChat } from 'stream-chat'
import { Chat as StreamChatUI, Channel, ChannelHeader, MessageList, MessageInput, Thread, Window } from 'stream-chat-react'
import 'stream-chat-react/dist/css/v2/index.css'

export default function ClassroomView() {
  const { id } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('posts')
  const [me, setMe] = useState(null)
  const [cls, setCls] = useState(null)
  const [posts, setPosts] = useState([])
  const [postText, setPostText] = useState('')
  const [postMedia, setPostMedia] = useState([])
  const [posting, setPosting] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState({})
  const [commentsByPost, setCommentsByPost] = useState({})
  const [commentTextByPost, setCommentTextByPost] = useState({})
  const [assignments, setAssignments] = useState([])
  const [chatClient, setChatClient] = useState(null)
  const [channel, setChannel] = useState(null)
  const [call, setCall] = useState({ open: false, id: null, mode: 'video' })
  const [newA, setNewA] = useState({ open: false, title: '', description: '', dueDate: '' })
  const [uploading, setUploading] = useState(false)
  const [quizzes, setQuizzes] = useState([])
  const [newQz, setNewQz] = useState({ open: false, title: '', description: '', questions: [] })
  const [take, setTake] = useState({ open: false, quiz: null, answers: [], result: null })

  const tabs = useMemo(() => ([
    { key: 'posts', label: 'Posts' },
    { key: 'chat', label: 'Chat' },
    { key: 'live', label: 'Live Class' },
    { key: 'members', label: 'Members' },
    { key: 'assignments', label: 'Assignments' },
    { key: 'quizzes', label: 'Quizzes' },
  ]), [])

  const load = async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const meRes = await http.get('/api/users/me')
      setMe(meRes.data.user)
      const { data } = await http.get(`/api/classrooms/${id}`)
      setCls(data)
      const postsRes = await http.get(`/api/classrooms/${id}/posts`)
      setPosts(postsRes.data.posts || [])
      const aRes = await http.get(`/api/classrooms/${id}/assignments`)
      setAssignments(aRes.data.assignments || [])
      const qRes = await http.get(`/api/classrooms/${id}/quizzes`)
      setQuizzes(qRes.data.quizzes || [])
      
      // Initialize chat
      const { data: tok } = await http.post('/api/stream/token/chat')
      const chat = StreamChat.getInstance(tok.apiKey)
      if (chat.userID && chat.userID !== tok.userId) { 
        try { await chat.disconnectUser() } catch {} 
      }
      if (!chat.userID || chat.userID !== tok.userId) { 
        await chat.connectUser({ id: tok.userId }, tok.token) 
      }
      const ch = chat.channel('messaging', data.channelId, { 
        name: data.classroom?.name || 'Classroom' 
      })
      await ch.create().catch(() => {})
      await ch.addMembers([tok.userId]).catch(() => {})
      setChatClient(chat)
      setChannel(ch)
    } catch (e) { 
      setError(e?.response?.data?.error || e?.message) 
    } finally { 
      setLoading(false) 
    }
  }
  
  useEffect(() => { load() }, [id])

  const post = async () => {
    if (!postText.trim() && postMedia.length === 0) return
    
    setPosting(true)
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      let attachments = []
      
      if (postMedia.length > 0) {
        const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
        const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
        for (const file of postMedia) {
          try {
            if (cloud && preset) {
              const fd = new FormData()
              fd.append('file', file)
              fd.append('upload_preset', preset)
              const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, { 
                method: 'POST', 
                body: fd 
              })
              const json = await res.json()
              if (json?.secure_url) attachments.push({ 
                url: json.secure_url, 
                type: json?.resource_type === 'video' ? 'video' : 'image' 
              })
            } else {
              const url = URL.createObjectURL(file)
              const type = file.type.startsWith('video') ? 'video' : 'image'
              attachments.push({ url, type })
            }
          } catch {}
        }
      }
      
      await http.post(`/api/classrooms/${id}/posts`, { 
        text: postText, 
        attachments 
      })
      setPostText('')
      setPostMedia([])
      const res = await http.get(`/api/classrooms/${id}/posts`)
      setPosts(res.data.posts || [])
    } catch (e) { 
      setError(e?.response?.data?.error || 'Failed to post') 
    } finally { 
      setPosting(false) 
    }
  }

  const toggleComments = async (postId) => {
    const nowOpen = !commentsOpen[postId]
    setCommentsOpen(prev => ({ ...prev, [postId]: nowOpen }))
    if (nowOpen && !commentsByPost[postId]) {
      try {
        const token = await getToken()
        const http = api.authedApi(token)
        const res = await http.get(`/api/classrooms/${id}/posts/${postId}/comments`)
        setCommentsByPost(prev => ({ ...prev, [postId]: res.data.comments || [] }))
      } catch (e) { 
        setError(e?.response?.data?.error || 'Failed to load comments') 
      }
    }
  }

  const likePost = async (postId) => {
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const res = await http.post(`/api/classrooms/${id}/posts/${postId}/like`)
      setPosts(prev => prev.map(p => 
        p._id === postId ? { 
          ...p, 
          likedByMe: res.data.likedByMe, 
          likesCount: res.data.likesCount 
        } : p
      ))
    } catch (e) { 
      setError(e?.response?.data?.error || 'Failed to like') 
    }
  }

  const addComment = async (postId) => {
    try {
      const text = (commentTextByPost[postId] || '').trim()
      if (!text) return
      const token = await getToken()
      const http = api.authedApi(token)
      await http.post(`/api/classrooms/${id}/posts/${postId}/comments`, { text })
      setCommentTextByPost(prev => ({ ...prev, [postId]: '' }))
      const res = await http.get(`/api/classrooms/${id}/posts/${postId}/comments`)
      setCommentsByPost(prev => ({ ...prev, [postId]: res.data.comments || [] }))
      setPosts(prev => prev.map(p => 
        p._id === postId ? { 
          ...p, 
          commentsCount: (p.commentsCount || 0) + 1 
        } : p
      ))
    } catch (e) { 
      setError(e?.response?.data?.error || 'Failed to comment') 
    }
  }

  const createAssignment = async () => {
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const body = { 
        title: newA.title, 
        description: newA.description, 
        dueDate: newA.dueDate || undefined 
      }
      await http.post(`/api/classrooms/${id}/assignments`, body)
      setNewA({ open: false, title: '', description: '', dueDate: '' })
      const res = await http.get(`/api/classrooms/${id}/assignments`)
      setAssignments(res.data.assignments || [])
    } catch (e) { 
      setError(e?.response?.data?.error || 'Failed to create assignment') 
    }
  }

  const uploadAndSubmit = async (assignmentId, file) => {
    if (!file) return
    
    setUploading(true)
    try {
      let fileURL = ''
      const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
      const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
      
      if (cloud && preset) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('upload_preset', preset)
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, { 
          method: 'POST', 
          body: fd 
        })
        const json = await res.json()
        fileURL = json.secure_url
      }
      
      if (!fileURL) {
        fileURL = URL.createObjectURL(file)
      }
      
      const token = await getToken()
      const http = api.authedApi(token)
      await http.post(`/api/classrooms/${id}/assignments/${assignmentId}/submit`, { fileURL })
      const res = await http.get(`/api/classrooms/${id}/assignments`)
      setAssignments(res.data.assignments || [])
    } catch (e) { 
      setError(e?.response?.data?.error || e?.message || 'Submit failed') 
    } finally { 
      setUploading(false) 
    }
  }

  // Quizzes helpers
  const addQuestion = () => {
    setNewQz((s) => ({ ...s, questions: [...s.questions, { type: 'mcq', text: '', options: ['', '', '', ''], correct: 0, points: 1 }] }))
  }
  const updateQuestion = (idx, patch) => {
    setNewQz((s) => ({ ...s, questions: s.questions.map((q,i)=> i===idx ? { ...q, ...patch } : q ) }))
  }
  const updateOption = (qi, oi, val) => {
    setNewQz((s)=> ({ ...s, questions: s.questions.map((q,i)=> i===qi ? { ...q, options: q.options.map((o,j)=> j===oi? val : o) } : q ) }))
  }
  const removeQuestion = (idx) => {
    setNewQz((s)=> ({ ...s, questions: s.questions.filter((_,i)=> i!==idx) }))
  }
  const createQuiz = async () => {
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const body = { title: newQz.title, description: newQz.description, questions: newQz.questions }
      await http.post(`/api/classrooms/${id}/quizzes`, body)
      setNewQz({ open: false, title: '', description: '', questions: [] })
      const qRes = await http.get(`/api/classrooms/${id}/quizzes`)
      setQuizzes(qRes.data.quizzes || [])
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to create quiz')
    }
  }
  const startTakeQuiz = async (quizId) => {
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const { data } = await http.get(`/api/classrooms/${id}/quizzes/${quizId}`)
      const quiz = data.quiz
      setTake({ open: true, quiz, answers: new Array((quiz?.questions||[]).length).fill(null), result: null })
    } catch (e) { setError(e?.response?.data?.error || 'Failed to load quiz') }
  }
  const submitQuiz = async () => {
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const { data } = await http.post(`/api/classrooms/${id}/quizzes/${take.quiz._id}/submit`, { answers: take.answers })
      setTake((s)=> ({ ...s, result: data }))
      const qRes = await http.get(`/api/classrooms/${id}/quizzes`)
      setQuizzes(qRes.data.quizzes || [])
    } catch (e) { setError(e?.response?.data?.error || 'Submit failed') }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
        <div className="text-lg font-medium">Loading classroom...</div>
      </div>
    </div>
  )
  
  if (!cls) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="alert alert-error shadow-lg max-w-md">
        <span>Classroom not found</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-base-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-base-content mb-2">
                {cls.classroom.name}
              </h1>
              <div className="flex items-center gap-4 text-sm text-base-content/70">
                <span className="bg-primary/20 text-primary px-3 py-1 rounded-full font-medium">
                  Code: {cls.classroom.joinCode}
                </span>
                <span>Teacher: {cls.teacher?.name || cls.teacher?.handle}</span>
              </div>
            </div>
            <button 
              className="btn btn-ghost gap-2"
              onClick={() => navigate('/classrooms')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Classes
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="alert alert-error mb-4 shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setError('')}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>

        {/* Posts Tab */}
        {tab === 'posts' && (
          <div className="space-y-6">
            {/* Create Post Card */}
            <div className="card bg-base-100 border border-base-300 shadow-lg">
              <div className="card-body">
                <h3 className="card-title text-lg mb-4">Create Post</h3>
                <textarea 
                  className="textarea textarea-bordered w-full focus:textarea-primary resize-none" 
                  rows={4}
                  placeholder="Share something with your class..."
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                />
                
                {/* Media Preview */}
                {postMedia.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">Selected files:</span>
                      <span className="text-sm text-base-content/70">
                        {postMedia.length} file{postMedia.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {postMedia.map((file, index) => (
                        <div key={index} className="relative">
                          {file.type.startsWith('image') ? (
                            <img 
                              src={URL.createObjectURL(file)} 
                              alt="Preview" 
                              className="w-16 h-16 object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-base-200 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-base-content/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <button 
                            className="absolute -top-1 -right-1 btn btn-xs btn-circle btn-error"
                            onClick={() => setPostMedia(prev => prev.filter((_, i) => i !== index))}
                          >
                            Ã—
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between mt-4">
                  <label className="btn btn-outline btn-sm gap-2 cursor-pointer">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Add Media
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*,video/*" 
                      multiple 
                      onChange={(e) => setPostMedia(Array.from(e.target.files || []))} 
                    />
                  </label>
                  
                  <button 
                    className="btn btn-primary gap-2"
                    onClick={post}
                    disabled={posting || (!postText.trim() && postMedia.length === 0)}
                  >
                    {posting ? (
                      <>
                        <div className="loading loading-spinner loading-sm"></div>
                        Posting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Post
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Posts List */}
            <div className="space-y-4">
              {posts.map((post) => (
                <div key={post._id} className="card bg-base-100 border border-base-300 shadow-lg">
                  <div className="card-body">
                    {/* Post Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="avatar placeholder">
                          <div className="bg-primary text-primary-content rounded-full w-10">
                            <span className="text-sm">
                              {(post.author?.name || post.author?.handle || 'U').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="font-semibold">
                            {post.author?.name || post.author?.handle || 'User'}
                          </div>
                          <div className="text-xs text-base-content/70">
                            {new Date(post.createdAt).toLocaleDateString()} at{' '}
                            {new Date(post.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Post Content */}
                    {post.text && (
                      <div className="mb-4 whitespace-pre-wrap text-base-content/90">
                        {post.text}
                      </div>
                    )}

                    {/* Attachments */}
                    {Array.isArray(post.attachments) && post.attachments.length > 0 && (
                      <div className="mb-4">
                        <div className={`grid gap-3 ${
                          post.attachments.length === 1 ? 'grid-cols-1' : 
                          post.attachments.length === 2 ? 'grid-cols-2' : 
                          'grid-cols-2 md:grid-cols-3'
                        }`}>
                          {post.attachments.map((attachment, index) => (
                            attachment.type === 'image' ? (
                              <img 
                                key={index}
                                src={attachment.url} 
                                alt="Post attachment" 
                                className="rounded-lg w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(attachment.url, '_blank')}
                              />
                            ) : (
                              <video 
                                key={index}
                                src={attachment.url} 
                                controls 
                                className="rounded-lg w-full h-48 object-cover"
                              />
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Post Actions */}
                    <div className="flex items-center gap-4 border-t border-base-300 pt-3">
                      <button 
                        className={`btn btn-ghost btn-sm gap-2 ${
                          post.likedByMe ? 'text-red-500' : ''
                        }`}
                        onClick={() => likePost(post._id)}
                      >
                        <svg className="w-4 h-4" fill={post.likedByMe ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        {post.likesCount || 0}
                      </button>
                      
                      <button 
                        className="btn btn-ghost btn-sm gap-2"
                        onClick={() => toggleComments(post._id)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {post.commentsCount || 0}
                      </button>
                    </div>

                    {/* Comments Section */}
                    {commentsOpen[post._id] && (
                      <div className="mt-4 border-t border-base-300 pt-4">
                        <div className="space-y-3 mb-4">
                          {(commentsByPost[post._id] || []).map(comment => (
                            <div key={comment._id} className="flex gap-3">
                              <div className="avatar placeholder">
                                <div className="bg-secondary text-secondary-content rounded-full w-8">
                                  <span className="text-xs">
                                    {(comment.author?.name || comment.author?.handle || 'U').charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="bg-base-200 rounded-2xl p-3">
                                  <div className="font-medium text-sm mb-1">
                                    {comment.author?.name || comment.author?.handle || 'User'}
                                  </div>
                                  <div className="text-sm whitespace-pre-wrap">
                                    {comment.text}
                                  </div>
                                </div>
                                <div className="text-xs text-base-content/70 mt-1 ml-2">
                                  {new Date(comment.createdAt).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add Comment */}
                        <div className="flex gap-3">
                          <div className="avatar placeholder">
                            <div className="bg-accent text-accent-content rounded-full w-8">
                              <span className="text-xs">
                                {(me?.name || me?.handle || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 flex gap-2">
                            <input 
                              className="input input-bordered flex-1 input-sm"
                              placeholder="Write a comment..."
                              value={commentTextByPost[post._id] || ''}
                              onChange={(e) => setCommentTextByPost(prev => ({ 
                                ...prev, 
                                [post._id]: e.target.value 
                              }))}
                              onKeyPress={(e) => e.key === 'Enter' && addComment(post._id)}
                            />
                            <button 
                              className="btn btn-primary btn-sm gap-2"
                              onClick={() => addComment(post._id)}
                              disabled={!((commentTextByPost[post._id] || '').trim())}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {posts.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-24 h-24 bg-base-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-12 h-12 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium mb-2">No posts yet</h3>
                  <p className="text-base-content/70">Be the first to share something with the class!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Tab */}
        {tab === 'chat' && chatClient && channel && (
          <div className="h-[70vh] rounded-xl overflow-hidden border border-base-300 shadow-lg">
            <StreamChatUI client={chatClient}>
              <Channel channel={channel}>
                <Window>
                  <ChannelHeader />
                  <MessageList />
                  <MessageInput focus />
                </Window>
                <Thread />
              </Channel>
            </StreamChatUI>
          </div>
        )}

        {/* Live Tab */}
        {tab === 'live' && (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-4">Live Classroom</h3>
              <p className="text-base-content/70 mb-6">
                {me?.clerkId === cls.classroom.teacherId 
                  ? 'Start a live video session with your students'
                  : 'Join the live class session when your teacher starts it'
                }
              </p>
              <button 
                className={`btn gap-2 ${
                  me?.clerkId === cls.classroom.teacherId ? 'btn-primary' : 'btn-secondary'
                }`}
                onClick={() => setCall({ 
                  open: true, 
                  id: `classroom-${cls.classroom._id}`, 
                  mode: 'video' 
                })}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {me?.clerkId === cls.classroom.teacherId ? 'Start Class' : 'Join Class'}
              </button>
            </div>
            {call.open && (
              <VideoCall 
                onClose={() => setCall({ open: false, id: null, mode: 'video' })} 
                callId={call.id} 
                mode={call.mode} 
                channel={channel} 
              />
            )}
          </div>
        )}

        {/* Members Tab */}
        {tab === 'members' && (
          <div className="space-y-6">
            {/* Teacher Section */}
            <div className="card bg-base-100 border border-base-300 shadow-lg">
              <div className="card-body">
                <h3 className="card-title text-lg mb-4">Teacher</h3>
                <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
                  <div className="avatar placeholder">
                    <div className="bg-primary text-primary-content rounded-full w-12">
                      <span className="text-lg">
                        {(cls.teacher?.name || cls.teacher?.handle || 'T').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold">{cls.teacher?.name || cls.teacher?.handle}</div>
                    <div className="text-sm text-base-content/70">Teacher</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Students Section */}
            <div className="card bg-base-100 border border-base-300 shadow-lg">
              <div className="card-body">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="card-title text-lg">Students</h3>
                  <span className="badge badge-primary">
                    {cls.members.filter(m => m.clerkId !== cls.classroom.teacherId).length} students
                  </span>
                </div>
                <div className="space-y-3">
                  {cls.members
                    .filter(member => member.clerkId !== cls.classroom.teacherId)
                    .map((member, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-base-200 rounded-lg">
                        <div className="avatar placeholder">
                          <div className="bg-secondary text-secondary-content rounded-full w-10">
                            <span className="text-sm">
                              {(member.name || member.handle || 'S').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{member.name || member.handle}</div>
                          <div className="text-xs text-base-content/70">Student</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assignments Tab */}
        {tab === 'assignments' && (
          <div className="space-y-6">
            {/* Create Assignment - Teachers Only */}
            {me?.clerkId === cls.classroom.teacherId && (
              <div className="card bg-base-100 border border-base-300 shadow-lg">
                <div className="card-body">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="card-title text-lg">Create Assignment</h3>
                    <button 
                      className="btn btn-sm gap-2"
                      onClick={() => setNewA(prev => ({ ...prev, open: !prev.open }))}
                    >
                      {newA.open ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          Close
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          New Assignment
                        </>
                      )}
                    </button>
                  </div>
                  
                  {newA.open && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="label">
                            <span className="label-text font-medium">Assignment Title</span>
                          </label>
                          <input 
                            className="input input-bordered w-full focus:input-primary"
                            placeholder="Enter assignment title..."
                            value={newA.title}
                            onChange={(e) => setNewA(prev => ({ ...prev, title: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="label">
                            <span className="label-text font-medium">Due Date</span>
                          </label>
                          <input 
                            className="input input-bordered w-full focus:input-primary"
                            type="date"
                            value={newA.dueDate}
                            onChange={(e) => setNewA(prev => ({ ...prev, dueDate: e.target.value }))}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="label">
                          <span className="label-text font-medium">Description</span>
                        </label>
                        <textarea 
                          className="textarea textarea-bordered w-full focus:textarea-primary"
                          rows={4}
                          placeholder="Describe the assignment requirements..."
                          value={newA.description}
                          onChange={(e) => setNewA(prev => ({ ...prev, description: e.target.value }))}
                        />
                      </div>
                      
                      <div className="flex justify-end">
                        <button 
                          className="btn btn-primary gap-2"
                          onClick={createAssignment}
                          disabled={!newA.title.trim()}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Create Assignment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assignments List */}
            <div className="space-y-4">
              {assignments.map((assignment) => (
                <div key={assignment._id} className="card bg-base-100 border border-base-300 shadow-lg">
                  <div className="card-body">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-lg mb-2">{assignment.title}</h4>
                        {assignment.description && (
                          <p className="text-base-content/80 mb-3 whitespace-pre-wrap">
                            {assignment.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-base-content/70">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No due date'}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Submissions: {assignment.submissions?.length || 0}
                          </span>
                        </div>
                      </div>
                      
                      {/* Student View */}
                      {me?.clerkId !== cls.classroom.teacherId ? (
                        <div className="text-right">
                          {assignment.mySubmission ? (
                            <div className="space-y-1">
                              <div className="badge badge-success gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Submitted
                              </div>
                              {assignment.mySubmission.grade && (
                                <div className="text-sm font-medium">
                                  Grade: {assignment.mySubmission.grade}
                                </div>
                              )}
                              {assignment.mySubmission.feedback && (
                                <div className="text-xs text-base-content/70 max-w-xs">
                                  Feedback: {assignment.mySubmission.feedback}
                                </div>
                              )}
                            </div>
                          ) : (
                            <label className="btn btn-primary btn-sm gap-2 cursor-pointer">
                              {uploading ? (
                                <>
                                  <div className="loading loading-spinner loading-xs"></div>
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                  </svg>
                                  Submit File
                                </>
                              )}
                              <input 
                                type="file" 
                                className="hidden" 
                                onChange={(e) => uploadAndSubmit(assignment._id, e.target.files?.[0])} 
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        /* Teacher View */
                        <div className="dropdown dropdown-end">
                          <label tabIndex={0} className="btn btn-sm gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Grade ({assignment.submissions?.length || 0})
                          </label>
                          <div tabIndex={0} className="dropdown-content z-[1] card card-compact bg-base-100 shadow-xl w-96 max-h-96 overflow-auto">
                            <div className="card-body">
                              <h3 className="card-title text-sm">Submissions</h3>
                              {assignment.submissions?.length > 0 ? (
                                <div className="space-y-3">
                                  {assignment.submissions.map((submission) => (
                                    <div key={submission._id} className="border border-base-300 rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="font-medium text-sm">
                                          {submission.studentId}
                                        </div>
                                        <a 
                                          href={submission.fileURL} 
                                          target="_blank" 
                                          rel="noreferrer"
                                          className="btn btn-xs btn-ghost gap-1"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                          </svg>
                                          View
                                        </a>
                                      </div>
                                      <div className="space-y-2">
                                        <input 
                                          className="input input-bordered input-sm w-full"
                                          placeholder="Grade (e.g., 85/100)"
                                          defaultValue={submission.grade || ''}
                                          id={`grade-${submission._id}`}
                                        />
                                        <input 
                                          className="input input-bordered input-sm w-full"
                                          placeholder="Feedback"
                                          defaultValue={submission.feedback || ''}
                                          id={`feedback-${submission._id}`}
                                        />
                                        <button 
                                          className="btn btn-primary btn-sm w-full gap-2"
                                          onClick={async () => {
                                            const grade = document.getElementById(`grade-${submission._id}`).value
                                            const feedback = document.getElementById(`feedback-${submission._id}`).value
                                            const token = await getToken()
                                            const http = api.authedApi(token)
                                            await http.post(`/api/classrooms/${id}/submissions/${submission._id}/grade`, { 
                                              grade, 
                                              feedback 
                                            })
                                            const res = await http.get(`/api/classrooms/${id}/assignments`)
                                            setAssignments(res.data.assignments || [])
                                          }}
                                        >
        {/* Quizzes Tab */}
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                          Save Grade
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-base-content/70">
                                  No submissions yet
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {assignments.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-24 h-24 bg-base-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-12 h-12 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium mb-2">No assignments yet</h3>
                  <p className="text-base-content/70 mb-4">
                    {me?.clerkId === cls.classroom.teacherId 
                      ? 'Create your first assignment to get started'
                      : 'No assignments have been posted yet'
                    }
                  </p>
                  {me?.clerkId === cls.classroom.teacherId && (
                    <button 
                      className="btn btn-primary gap-2"
                      onClick={() => setNewA(prev => ({ ...prev, open: true }))}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Create First Assignment
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'quizzes' && (
          <div className="space-y-6">
            {me?.clerkId === cls.classroom.teacherId && (
              <div className="card bg-base-100 border border-base-300 shadow-lg">
                <div className="card-body">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="card-title text-lg">Create Quiz</h3>
                    <button className="btn btn-sm" onClick={() => setNewQz((s) => ({ ...s, open: !s.open }))}>
                      {newQz.open ? 'Close' : 'New Quiz'}
                    </button>
                  </div>
                  {newQz.open && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          className="input input-bordered"
                          placeholder="Quiz Title"
                          value={newQz.title}
                          onChange={(e) => setNewQz((s) => ({ ...s, title: e.target.value }))}
                        />
                        <input
                          className="input input-bordered"
                          placeholder="Description (optional)"
                          value={newQz.description}
                          onChange={(e) => setNewQz((s) => ({ ...s, description: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Questions</h4>
                        <button className="btn btn-ghost btn-sm" onClick={addQuestion}>+ Add Question</button>
                      </div>
                      <div className="space-y-4">
                        {newQz.questions.map((q, qi) => (
                          <div key={qi} className="p-3 rounded-lg border">
                            <div className="flex items-center gap-2 mb-2">
                              <select
                                className="select select-bordered select-sm"
                                value={q.type}
                                onChange={(e) => updateQuestion(qi, { type: e.target.value })}
                              >
                                <option value="mcq">Multiple Choice</option>
                                <option value="boolean">True/False</option>
                              </select>
                              <input
                                className="input input-bordered input-sm flex-1"
                                placeholder="Question text"
                                value={q.text}
                                onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                              />
                              <input
                                className="input input-bordered input-sm w-24"
                                type="number"
                                min="0"
                                max="100"
                                value={q.points || 1}
                                onChange={(e) => updateQuestion(qi, { points: Number(e.target.value) || 0 })}
                              />
                              <button className="btn btn-ghost btn-xs" onClick={() => removeQuestion(qi)}>Remove</button>
                            </div>
                            {q.type === 'mcq' ? (
                              <div className="space-y-1">
                                {q.options.map((opt, oi) => (
                                  <div key={oi} className="flex items-center gap-2">
                                    <input
                                      className="radio"
                                      type="radio"
                                      name={`correct-${qi}`}
                                      checked={q.correct === oi}
                                      onChange={() => updateQuestion(qi, { correct: oi })}
                                    />
                                    <input
                                      className="input input-bordered input-sm flex-1"
                                      placeholder={`Option ${oi + 1}`}
                                      value={opt}
                                      onChange={(e) => updateOption(qi, oi, e.target.value)}
                                    />
                                  </div>
                                ))}
                                <button className="btn btn-ghost btn-xs" onClick={() => updateQuestion(qi, { options: [...q.options, ''] })}>
                                  + Option
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <label className="label cursor-pointer">
                                  <span className="label-text">Correct is True</span>
                                  <input
                                    type="checkbox"
                                    className="toggle"
                                    checked={!!q.correct}
                                    onChange={(e) => updateQuestion(qi, { correct: e.target.checked })}
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <button
                          className="btn btn-primary"
                          onClick={createQuiz}
                          disabled={!newQz.title.trim() || newQz.questions.length === 0}
                        >
                          Create Quiz
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {quizzes.map((q) => (
                <div key={q._id} className="card bg-base-100 border border-base-300 shadow-lg">
                  <div className="card-body">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-lg mb-1">{q.title}</h4>
                        {q.description && (
                          <p className="text-base-content/80 mb-2 whitespace-pre-wrap">{q.description}</p>
                        )}
                        <div className="text-sm text-base-content/70">
                          Questions: {q.questionCount} • Points: {q.totalPoints}
                        </div>
                        {q.dueDate && (
                          <div className="text-xs text-base-content/60">Due {new Date(q.dueDate).toLocaleDateString()}</div>
                        )}
                      </div>
                      <div className="text-right">
                        {q.myAttempt ? (
                          <div className="badge badge-success gap-2">
                            Score: {q.myAttempt.score} / {q.myAttempt.totalPoints}
                          </div>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={() => startTakeQuiz(q._id)}>
                            Take Quiz
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {quizzes.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-base-content/70 mb-3">No quizzes yet</div>
                  {me?.clerkId === cls.classroom.teacherId && (
                    <button className="btn btn-primary" onClick={() => setNewQz((s) => ({ ...s, open: true }))}>
                      Create First Quiz
                    </button>
                  )}
                </div>
              )}
            </div>

            {take.open && take.quiz && (
              <div className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4">
                <div className="bg-base-100 rounded-xl border border-base-300 max-w-3xl w-full">
                  <div className="p-4 border-b flex items-center justify-between">
                    <div className="font-bold">{take.quiz.title}</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTake({ open: false, quiz: null, answers: [], result: null })}>
                      Close
                    </button>
                  </div>
                  <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
                    {(take.quiz.questions || []).map((q, idx) => (
                      <div key={idx} className="border rounded-lg p-3">
                        <div className="font-medium mb-2">
                          Q{idx + 1}. {q.text} <span className="badge ml-2">{q.points} pt</span>
                        </div>
                        {q.type === 'mcq' ? (
                          <div className="space-y-2">
                            {(q.options || []).map((opt, oi) => (
                              <label key={oi} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`ans-${idx}`}
                                  className="radio"
                                  checked={take.answers[idx] === oi}
                                  onChange={() =>
                                    setTake((s) => ({
                                      ...s,
                                      answers: s.answers.map((a, i) => (i === idx ? oi : a)),
                                    }))
                                  }
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <label className="label cursor-pointer">
                              <span className="label-text">True</span>
                              <input
                                type="radio"
                                name={`ans-${idx}`}
                                className="radio"
                                checked={take.answers[idx] === true}
                                onChange={() =>
                                  setTake((s) => ({
                                    ...s,
                                    answers: s.answers.map((a, i) => (i === idx ? true : a)),
                                  }))
                                }
                              />
                            </label>
                            <label className="label cursor-pointer">
                              <span className="label-text">False</span>
                              <input
                                type="radio"
                                name={`ans-${idx}`}
                                className="radio"
                                checked={take.answers[idx] === false}
                                onChange={() =>
                                  setTake((s) => ({
                                    ...s,
                                    answers: s.answers.map((a, i) => (i === idx ? false : a)),
                                  }))
                                }
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    ))}

                    {take.result && (
                      <div className="alert alert-success">
                        Score: {take.result.score} / {take.result.totalPoints}
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t flex justify-end gap-2">
                    {!take.result && (
                      <button className="btn btn-primary" onClick={submitQuiz}>
                        Submit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
