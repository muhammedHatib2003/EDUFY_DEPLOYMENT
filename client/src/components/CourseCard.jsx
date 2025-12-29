import { Link } from 'react-router-dom'

export default function CourseCard({ course, onJoin, joining }) {
  const created = course.createdAt ? new Date(course.createdAt).toLocaleDateString() : ''
  const joinLabel = course.joinType === 'code' ? 'Join with Code' : 'Join Instantly'

  return (
    <div className="card bg-base-100 shadow-sm border border-base-300">
      {course.thumbnail && (
        <figure className="h-40 overflow-hidden bg-base-200">
          <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
        </figure>
      )}
      <div className="card-body space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="card-title text-lg">{course.title}</h3>
            <p className="text-sm opacity-80 line-clamp-2">{course.description}</p>
            <div className="text-xs opacity-70 mt-1">
              By {course.teacherName || 'Teacher'} • {created}
            </div>
          </div>
          <span className="badge badge-outline">{(course.joinType || '').toUpperCase()}</span>
        </div>

        <div className="card-actions justify-end gap-2">
          <Link className="btn btn-ghost btn-sm" to={`/courses/${course._id}`}>View</Link>
          {onJoin && (
            <button
              className={`btn btn-primary btn-sm ${joining ? 'loading' : ''}`}
              onClick={() => onJoin(course)}
              disabled={joining}
            >
              {joinLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
