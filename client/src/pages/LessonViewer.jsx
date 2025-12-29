import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate, useParams } from 'react-router-dom'
import { CourseService } from '../services/courses'

export default function LessonViewer() {
  const { id } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()

  const [course, setCourse] = useState(null)
  const [lessons, setLessons] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const token = await getToken()
        const [courseRes, lessonsRes] = await Promise.all([
          CourseService.getOne(token, id),
          CourseService.getLessons(token, id),
        ])
        setCourse(courseRes.data.course)
        const list = lessonsRes.data.lessons || []
        setLessons(list)
        setActiveIndex(0)
      } catch (err) {
        setError(err?.response?.data?.error || 'Failed to load lessons')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getToken, id])

  if (loading) return <div className="p-4">Loading...</div>
  if (error) return <div className="p-4 text-error">{error}</div>
  if (!course) return <div className="p-4">Course not found</div>
  if (!lessons.length) return <div className="p-4">No lessons yet.</div>

  const lesson = lessons[activeIndex]
  const prev = () => setActiveIndex((i) => Math.max(0, i - 1))
  const next = () => setActiveIndex((i) => Math.min(lessons.length - 1, i + 1))

  return (
    <div className="max-w-5xl mx-auto grid md:grid-cols-[2fr,1fr] gap-4">
      <div className="card bg-base-100 border shadow-sm">
        <div className="card-body space-y-3">
          <div className="text-sm opacity-70">Lesson {lesson.order}</div>
          <h1 className="text-2xl font-bold">{lesson.title}</h1>
          <p className="opacity-80">{lesson.description}</p>
          {lesson.videoUrl ? (
            <div className="w-full bg-base-200 rounded-lg overflow-hidden">
              <video className="w-full max-h-[520px] bg-black" controls src={lesson.videoUrl}>
                Your browser does not support the video tag.
              </video>
            </div>
          ) : null}
          {lesson.content && (
            <div className="prose max-w-none whitespace-pre-wrap">{lesson.content}</div>
          )}
          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={prev} disabled={activeIndex === 0}>Previous</button>
            <button className="btn btn-ghost" onClick={next} disabled={activeIndex === lessons.length - 1}>Next</button>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card bg-base-100 border shadow-sm">
          <div className="card-body space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Course Outline</h2>
              <button className="btn btn-ghost btn-xs" onClick={() => navigate(`/courses/${id}`)}>Back to course</button>
            </div>
            <div className="divide-y divide-base-200">
              {lessons.map((l, idx) => (
                <button
                  key={l._id}
                  className={`w-full text-left py-2 px-2 rounded ${idx === activeIndex ? 'bg-base-200 font-semibold' : 'hover:bg-base-200'}`}
                  onClick={() => setActiveIndex(idx)}
                >
                  <div className="text-xs opacity-70">Lesson {l.order}</div>
                  <div>{l.title}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
