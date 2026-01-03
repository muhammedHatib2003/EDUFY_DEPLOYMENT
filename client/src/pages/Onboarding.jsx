import { useState, useEffect } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { authedApi } from '../lib/api.js'

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

  // Prefill name from Clerk
  useEffect(() => {
    if (user) {
      setForm(f => ({
        ...f,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
      }))
    }
  }, [user])

  // Skip onboarding if already completed
  useEffect(() => {
    const check = async () => {
      try {
        const http = await authedApi(getToken)
        const { data } = await http.get('/users/me')
        if (data?.user?.onboarded) {
          navigate('/', { replace: true })
        }
      } catch {
        // ignore
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
      const http = await authedApi(getToken)

      if (photoFile && user) {
        try {
          await user.setProfileImage({ file: photoFile })
        } catch {
          // ignore avatar errors
        }
      }

      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
        age: Number(form.age),
        handle: form.handle.trim(),
        avatarUrl: user?.imageUrl,
        ...(form.bio ? { bio: form.bio.trim() } : {}),
      }

      await http.post('/users/onboard', payload)
      navigate('/', { replace: true })
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
              <label className="label">
                <span className="label-text">Photo</span>
              </label>
              <input
                className="file-input file-input-bordered"
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                className="input input-bordered"
                name="firstName"
                value={form.firstName}
                onChange={onChange}
                placeholder="First name"
                required
              />
              <input
                className="input input-bordered"
                name="lastName"
                value={form.lastName}
                onChange={onChange}
                placeholder="Last name"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                className="input input-bordered"
                name="age"
                type="number"
                min="1"
                max="120"
                value={form.age}
                onChange={onChange}
                placeholder="Age"
                required
              />
              <select
                className="select select-bordered"
                name="role"
                value={form.role}
                onChange={onChange}
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>

            <input
              className="input input-bordered"
              name="handle"
              value={form.handle}
              onChange={onChange}
              placeholder="Username"
              required
            />

            <textarea
              className="textarea textarea-bordered"
              name="bio"
              value={form.bio}
              onChange={onChange}
              placeholder="Bio (optional)"
              rows={3}
            />

            <div className="card-actions justify-end">
              <button
                className={`btn btn-primary ${loading ? 'loading' : ''}`}
                disabled={loading}
                type="submit"
              >
                Continue
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
