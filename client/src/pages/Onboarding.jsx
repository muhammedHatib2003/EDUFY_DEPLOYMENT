import { useState, useEffect } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

export default function Onboarding() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    age: '',
    role: 'student',
    handle: '',
    bio: '',
  })
  const [photoFile, setPhotoFile] = useState(null)

  useEffect(() => {
    if (user) {
      setForm(f => ({
        ...f,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
      }))
    }
  }, [user])

  // If already onboarded, skip this page
  useEffect(() => {
    const check = async () => {
      try {
        const token = await getToken()
        const http = api.authedApi(token)
        const { data } = await http.get('/users/me')
        if (data?.user?.onboarded) navigate('/')
      } catch (e) {
        // ignore; likely not onboarded yet or unauthorized
      }
    }
    check()
  }, [getToken, navigate])

  const onChange = (e) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      if (photoFile && user) {
        try {
          await user.setProfileImage({ file: photoFile })
        } catch (e) {
          console.warn('Failed to set Clerk profile image', e)
        }
      }
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
        age: Number(form.age),
        handle: form.handle.trim(),
      }
      if (form.bio) payload.bio = form.bio.trim()
      await http.post('/users/onboard', payload)
      navigate('/')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save onboarding')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="card w-full max-w-xl bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title">Welcome! Complete your profile</h2>
          {error && <div className="alert alert-error text-sm">{error}</div>}
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="form-control">
              <label className="label"><span className="label-text">Photo</span></label>
              <input className="file-input file-input-bordered" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label"><span className="label-text">First name</span></label>
                <input className="input input-bordered" name="firstName" value={form.firstName} onChange={onChange} required />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Last name</span></label>
                <input className="input input-bordered" name="lastName" value={form.lastName} onChange={onChange} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label"><span className="label-text">Age</span></label>
                <input className="input input-bordered" name="age" value={form.age} onChange={onChange} type="number" min="1" max="120" required />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Role</span></label>
                <select className="select select-bordered" name="role" value={form.role} onChange={onChange} required>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                </select>
              </div>
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Username (unique)</span></label>
              <input className="input input-bordered" name="handle" value={form.handle} onChange={onChange} placeholder="e.g. john123" required />
              <label className="label"><span className="label-text-alt">Only letters, numbers, and underscores</span></label>
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Bio</span></label>
              <textarea className="textarea textarea-bordered" name="bio" value={form.bio} onChange={onChange} placeholder="Tell others about yourself" rows={3} />
            </div>
            <div className="card-actions justify-end">
              <button className={`btn btn-primary ${loading ? 'loading' : ''}`} disabled={loading} type="submit">Continue</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
