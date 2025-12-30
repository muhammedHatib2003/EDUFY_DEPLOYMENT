import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CourseService } from '../services/courses'
import JoinCourseModal from '../components/JoinCourseModal'
import api from '../lib/api'

export default function CourseDetails() {
  const { id } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()

  const [course, setCourse] = useState(null)
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [joinError, setJoinError] = useState('')
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [me, setMe] = useState(null)
  const [lessonForm, setLessonForm] = useState({ title: '', description: '', content: '', videoUrl: '', order: '' })
  const [videoFile, setVideoFile] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ title: '', description: '', thumbnail: '', joinType: 'free', joinCode: '' })

  useEffect(() => {
    loadCourse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadCourse = async () => {
    setLoading(true)
    try {
      const token = await getToken().catch(() => null)
      const { data } = await CourseService.getOne(token, id)
      setCourse(data.course)
      setEditForm({
        title: data.course.title,
        description: data.course.description,
        thumbnail: data.course.thumbnail || '',
        joinType: data.course.joinType,
        joinCode: '',
      })
      if (token) {
        try {
          const http = api.authedApi(token)
          const { data: meData } = await http.get('/users/me')
          setMe(meData.user)
        } catch {
          setMe(null)
        }
      }
      if (token && (data.course.isOwner || data.course.isEnrolled)) {
        await loadLessons(token)
      } else {
        setLessons([])
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load course')
    } finally {
      setLoading(false)
    }
  }

  const loadLessons = async (token) => {
    try {
      const { data } = await CourseService.getLessons(token, id)
      setLessons(data.lessons || [])
    } catch {
      setLessons([])
    }
  }

  const joinCourse = async (code) => {
    setActionLoading(true)
    setJoinError('')
    try {
      const token = await getToken()
      await CourseService.join(token, id, code)
      setShowJoinModal(false)
      await loadCourse()
    } catch (err) {
      setJoinError(err?.response?.data?.error || 'Failed to join course')
    } finally {
      setActionLoading(false)
    }
  }

  const addLesson = async () => {
    if (!lessonForm.title.trim() || !lessonForm.description.trim()) return
    const hasVideoUrl = lessonForm.videoUrl.trim().length > 0
    if (!hasVideoUrl && !videoFile) {
      setError('Provide a video URL or upload a video file.')
      return
    }

    setActionLoading(true)
    setError('')
    try {
      const token = await getToken()
      let finalVideoUrl = lessonForm.videoUrl.trim()

      if (videoFile) {
        const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
        const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
        if (!cloud || !preset) throw new Error('Missing Cloudinary config')
        const fd = new FormData()
        fd.append('file', videoFile)
        fd.append('upload_preset', preset)
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/video/upload`, { method: 'POST', body: fd })
        const json = await res.json()
        if (!json?.secure_url) throw new Error('Failed to upload video')
        finalVideoUrl = json.secure_url
      }

      await CourseService.addLesson(token, id, {
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim(),
        content: lessonForm.content.trim(),
        videoUrl: finalVideoUrl,
        order: lessonForm.order ? Number(lessonForm.order) : undefined,
      })
      setLessonForm({ title: '', description: '', content: '', videoUrl: '', order: '' })
      setVideoFile(null)
      await loadLessons(token)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to add lesson')
    } finally {
      setActionLoading(false)
    }
  }

  const editLesson = async (lesson) => {
    const title = prompt('Lesson title', lesson.title)
    if (!title) return
    const description = prompt('Lesson description', lesson.description)
    if (!description) return
    const content = prompt('Lesson text content (leave blank to keep)', lesson.content)
    const videoUrl = prompt('Video URL (optional)', lesson.videoUrl)
    const order = Number(prompt('Order number', lesson.order || 1))
    try {
      const token = await getToken()
      await CourseService.updateLesson(token, lesson._id, { title, description, content, videoUrl, order })
      await loadLessons(token)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update lesson')
    }
  }

  const deleteLesson = async (lessonId) => {
    if (!window.confirm('Delete this lesson?')) return
    try {
      const token = await getToken()
      await CourseService.deleteLesson(token, lessonId)
      await loadLessons(token)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete lesson')
    }
  }

  const saveCourse = async () => {
    setActionLoading(true)
    setError('')
    try {
      const token = await getToken()
      const payload = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        thumbnail: editForm.thumbnail.trim(),
        joinType: editForm.joinType,
        ...(editForm.joinType === 'code' ? { joinCode: editForm.joinCode.trim() } : {}),
      }
      const { data } = await CourseService.update(token, id, payload)
      setCourse(data.course)
      setEditMode(false)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update course')
    } finally {
      setActionLoading(false)
    }
  }

  const deleteCourse = async () => {
    if (!window.confirm('Delete this course and its lessons?')) return
    setActionLoading(true)
    try {
      const token = await getToken()
      await CourseService.remove(token, id)
      navigate('/courses')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete course')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="p-4">Loading...</div>
  if (!course) return <div className="p-4">Course not found</div>

  const canAddLessons = course.isOwner
  const canEditCourse = course.isOwner
  const joined = course.isOwner || course.isEnrolled
  const isStudent = me?.role === 'student'

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="card bg-base-100 shadow-sm border">
        <div className="card-body space-y-3">
          {course.thumbnail && (
            <div className="w-full">
              <img src={course.thumbnail} alt={course.title} className="w-full h-56 object-cover rounded-lg border" />
            </div>
          )}
          {!editMode ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">{course.title}</h1>
                  <p className="opacity-80">{course.description}</p>
                  <div className="text-sm opacity-70 mt-1">By {course.teacherName}</div>
                </div>
                <span className="badge badge-outline">{(course.joinType || '').toUpperCase()}</span>
              </div>
              {error && <div className="alert alert-error text-sm">{error}</div>}
              <div className="flex gap-2 justify-end">
                {(!joined && course.joinType === 'free' && isStudent) && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => joinCourse()}
                  >
                    Join Course
                  </button>
                )}
                {(!joined && course.joinType === 'code' && isStudent) && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowJoinModal(true)}
                  >
                    Join with Code
                  </button>
                )}
                {joined && (
                  <Link className="btn btn-outline btn-sm" to={`/courses/${id}/learn`}>
                    Start Learning
                  </Link>
                )}
                {canEditCourse && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>Edit</button>
                    <button className="btn btn-error btn-sm" onClick={deleteCourse} disabled={actionLoading}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3">
                <div className="form-control">
                  <label className="label"><span className="label-text">Title</span></label>
                  <input className="input input-bordered" value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Description</span></label>
                  <textarea className="textarea textarea-bordered" value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Thumbnail URL</span></label>
                  <input className="input input-bordered" value={editForm.thumbnail} onChange={(e) => setEditForm(f => ({ ...f, thumbnail: e.target.value }))} />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Join Type</span></label>
                  <div className="join">
                    <button type="button" className={`btn join-item ${editForm.joinType === 'free' ? 'btn-primary' : ''}`} onClick={() => setEditForm(f => ({ ...f, joinType: 'free' }))}>free</button>
                    <button type="button" className={`btn join-item ${editForm.joinType === 'code' ? 'btn-primary' : ''}`} onClick={() => setEditForm(f => ({ ...f, joinType: 'code' }))}>code</button>
                  </div>
                  {editForm.joinType === 'code' && (
                    <div className="mt-2">
                      <input className="input input-bordered uppercase tracking-widest" placeholder="Join code" value={editForm.joinCode} onChange={(e) => setEditForm(f => ({ ...f, joinCode: e.target.value }))} />
                      <div className="text-xs opacity-70 mt-1">Required for CODE courses.</div>
                    </div>
                  )}
                </div>
              </div>
              {error && <div className="alert alert-error text-sm">{error}</div>}
              <div className="flex justify-end gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(false)}>Cancel</button>
                <button className={`btn btn-primary btn-sm ${actionLoading ? 'loading' : ''}`} onClick={saveCourse} disabled={actionLoading}>
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {joined && (
        <div className="card bg-base-100 shadow-sm border">
          <div className="card-body space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Lessons</h2>
              {canAddLessons && (
                <button className={`btn btn-primary btn-sm ${actionLoading ? 'loading' : ''}`} onClick={addLesson} disabled={actionLoading || !lessonForm.title.trim() || !lessonForm.description.trim()}>
                  Add Lesson
                </button>
              )}
            </div>

            {canAddLessons && (
              <div className="grid gap-3">
                <input className="input input-bordered" placeholder="Lesson title" value={lessonForm.title} onChange={(e) => setLessonForm(f => ({ ...f, title: e.target.value }))} />
                <input className="input input-bordered" placeholder="Short description" value={lessonForm.description} onChange={(e) => setLessonForm(f => ({ ...f, description: e.target.value }))} />
                <textarea className="textarea textarea-bordered" placeholder="Text content (optional)" value={lessonForm.content} onChange={(e) => setLessonForm(f => ({ ...f, content: e.target.value }))} rows={3} />
                <input className="input input-bordered" placeholder="Video URL (Cloudinary or any mp4 link)" value={lessonForm.videoUrl} onChange={(e) => setLessonForm(f => ({ ...f, videoUrl: e.target.value }))} />
                <input type="file" accept="video/*" className="file-input file-input-bordered" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
                <input className="input input-bordered" placeholder="Order (e.g., 1,2,3)" value={lessonForm.order} onChange={(e) => setLessonForm(f => ({ ...f, order: e.target.value }))} />
              </div>
            )}

            {lessons.length === 0 ? (
              <div className="p-3 rounded bg-base-200 text-sm">No lessons yet.</div>
            ) : (
              <div className="space-y-2">
                {lessons.map(lesson => (
                  <div key={lesson._id} className="border border-base-300 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">Lesson {lesson.order}: {lesson.title}</div>
                        <div className="text-sm opacity-80">{lesson.description}</div>
                        {lesson.videoUrl && (
                          <div className="mt-2 text-sm">
                            <a className="link" href={lesson.videoUrl} target="_blank" rel="noreferrer">Watch video</a>
                          </div>
                        )}
                        {lesson.content && <div className="text-sm opacity-80 whitespace-pre-wrap mt-1">{lesson.content}</div>}
                        <div className="text-xs opacity-60 mt-1">Published {new Date(lesson.createdAt).toLocaleString()}</div>
                      </div>
                      {canAddLessons && (
                        <div className="flex flex-col gap-1">
                          <button className="btn btn-ghost btn-xs" onClick={() => editLesson(lesson)}>Edit</button>
                          <button className="btn btn-ghost btn-xs text-error" onClick={() => deleteLesson(lesson._id)}>Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <JoinCourseModal
        course={course}
        open={showJoinModal}
        onClose={() => { setShowJoinModal(false); setJoinError('') }}
        onSubmit={joinCourse}
        error={joinError}
        loading={actionLoading}
      />
    </div>
  )
}

function toEmbedUrl(url) {
  if (typeof url !== 'string') return ''
  const trimmed = url.trim()
  const ytMatch = trimmed.match(/[?&]v=([^&]+)/)
  const shortMatch = trimmed.match(/youtu\.be\/([^?]+)/)
  const id = ytMatch?.[1] || shortMatch?.[1]
  if (id) return `https://www.youtube.com/embed/${id}`
  // If already embed or unrecognized, return original
  if (/\/embed\//.test(trimmed)) return trimmed
  return trimmed
}
