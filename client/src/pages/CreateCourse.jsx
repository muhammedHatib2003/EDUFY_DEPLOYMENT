import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { CourseService } from '../services/courses'
import api from '../lib/api'

export default function CreateCourse() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    thumbnail: '',
    joinType: 'free',
    joinCode: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken()
        const http = api.authedApi(token)
        const { data } = await http.get('/users/me')
        setMe(data.user)
      } catch {
        setMe(null)
      }
    }
    load()
  }, [getToken])

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        thumbnail: form.thumbnail.trim() || undefined,
        joinType: form.joinType,
        ...(form.joinType === 'code' ? { joinCode: form.joinCode.trim() } : {}),
      }
      const { data } = await CourseService.create(token, payload)
      navigate(`/courses/${data.course._id}`)
    } catch (err) {
      setError(err?.response?.data?.error ? `${err.response.data.error}${err.response.data.details ? ': ' + JSON.stringify(err.response.data.details) : ''}` : 'Failed to create course')
    } finally {
      setLoading(false)
    }
  }

  if (me && me.role !== 'teacher') {
    return <div className="p-4">Only teachers can create courses.</div>
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create Course</h1>
      <form className="space-y-4" onSubmit={submit}>
        {error && <div className="alert alert-error text-sm">{error}</div>}

        <div className="form-control">
          <label className="label"><span className="label-text">Title</span></label>
          <input className="input input-bordered" name="title" value={form.title} onChange={onChange} required />
        </div>

        <div className="form-control">
          <label className="label"><span className="label-text">Description</span></label>
          <textarea className="textarea textarea-bordered" name="description" value={form.description} onChange={onChange} rows={3} required />
        </div>

        <div className="form-control">
          <label className="label"><span className="label-text">Thumbnail URL (optional)</span></label>
          <input className="input input-bordered" name="thumbnail" value={form.thumbnail} onChange={onChange} placeholder="https://..." />
        </div>

        <div className="form-control">
          <label className="label"><span className="label-text">Join Type</span></label>
          <div className="join">
            <button type="button" className={`btn join-item ${form.joinType === 'free' ? 'btn-primary' : ''}`} onClick={() => setForm(f => ({ ...f, joinType: 'free' }))}>free</button>
            <button type="button" className={`btn join-item ${form.joinType === 'code' ? 'btn-primary' : ''}`} onClick={() => setForm(f => ({ ...f, joinType: 'code' }))}>code</button>
          </div>
          {form.joinType === 'code' && (
            <div className="mt-2">
              <input className="input input-bordered uppercase tracking-widest" name="joinCode" value={form.joinCode} onChange={onChange} placeholder="Enter join code" required minLength={3} />
              <div className="text-xs opacity-70 mt-1">Students will need this code to join.</div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" className={`btn btn-primary ${loading ? 'loading' : ''}`} disabled={loading}>
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
