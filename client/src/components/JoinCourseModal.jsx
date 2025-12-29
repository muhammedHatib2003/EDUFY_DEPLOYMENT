export default function JoinCourseModal({ course, open, onClose, onSubmit, error, loading }) {
  const show = Boolean(open)
  if (!show) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    const form = new FormData(e.target)
    const code = form.get('code')
    onSubmit(code)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-base-100 p-5 rounded-xl shadow-xl w-full max-w-md space-y-3">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h3 className="text-lg font-semibold">Join {course?.title}</h3>
            <p className="text-sm opacity-70">Enter the course code to enroll.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="form-control">
            <label className="label"><span className="label-text">Join Code</span></label>
            <input name="code" className="input input-bordered uppercase tracking-widest" maxLength={30} required />
          </div>
          {error && <div className="alert alert-error text-sm">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn-primary ${loading ? 'loading' : ''}`} disabled={loading}>
              Join Course
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
