import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import CourseCard from '../components/CourseCard'
import JoinCourseModal from '../components/JoinCourseModal'
import { CourseService } from '../services/courses'
import { authedApi } from '@/lib/api'

export default function Courses() {
  const { getToken } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [modalCourse, setModalCourse] = useState(null)
  const [me, setMe] = useState(null)

  useEffect(() => {
    loadCourses()
    loadMe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMe = async () => {
    try {
      const http = await authedApi(getToken)
      const { data } = await http.get('/users/me')
      setMe(data.user)
    } catch {
      // ignore
    }
  }

  const loadCourses = async () => {
    setLoading(true)
    try {
      const { data } = await CourseService.list(getToken)
      setCourses(data.courses || [])
    } catch {
      setCourses([])
    } finally {
      setLoading(false)
    }
  }

  const handleJoinClick = (course) => {
    setJoinError('')
    if (course.joinType === 'code') {
      setModalCourse(course)
    } else {
      joinCourse(course, null)
    }
  }

  const joinCourse = async (course, code) => {
    setJoinLoading(true)
    setJoinError('')
    try {
      await CourseService.join(getToken, course._id, code)
      setModalCourse(null)
      await loadCourses()
    } catch (err) {
      setJoinError(err?.response?.data?.error || 'Failed to join course')
    } finally {
      setJoinLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Courses</h1>
          <p className="opacity-70 text-sm">Browse public courses and join with a click or code.</p>
        </div>
        {me?.role === 'teacher' && (
          <Link to="/courses/create" className="btn btn-primary btn-sm">Create Course</Link>
        )}
      </div>

      {joinError && !modalCourse && (
        <div className="alert alert-error text-sm">{joinError}</div>
      )}

      {loading ? (
        <div className="p-4 text-sm opacity-70">Loading courses...</div>
      ) : courses.length === 0 ? (
        <div className="p-4 rounded bg-base-200 text-sm">No courses yet.</div>
      ) : (
        <div className="grid gap-3">
          {courses.map(course => (
            <CourseCard
              key={course._id}
              course={course}
              onJoin={me?.role === 'student' ? handleJoinClick : undefined}
              joining={joinLoading}
            />
          ))}
        </div>
      )}

      <JoinCourseModal
        course={modalCourse}
        open={Boolean(modalCourse)}
        onClose={() => { setModalCourse(null); setJoinError('') }}
        onSubmit={(code) => modalCourse && joinCourse(modalCourse, code)}
        error={joinError}
        loading={joinLoading}
      />
    </div>
  )
}
