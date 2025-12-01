import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import api from '../lib/api'
import ClassroomCard from '../components/ClassroomCard.jsx'
import { useNavigate } from 'react-router-dom'

export default function Classrooms() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', code: '' })
  const [me, setMe] = useState(null)
  const [activeTab, setActiveTab] = useState('myClasses')

  const load = async () => {
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const meRes = await http.get('/api/users/me')
      setMe(meRes.data.user)
      const { data } = await http.get('/api/classrooms')
      setClasses(data.classrooms || [])
    } catch (e) { 
      setError(e?.response?.data?.error || e?.message) 
    } finally { 
      setLoading(false) 
    }
  }
  
  useEffect(() => { load() }, [])

  const createClass = async () => {
    if (!form.name.trim()) {
      setError('Class name is required')
      return
    }
    
    setCreating(true)
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const { data } = await http.post('/api/classrooms', { 
        name: form.name.trim(), 
        description: form.description.trim() 
      })
      navigate(`/classrooms/${data.classroom._id}`)
    } catch (e) { 
      setError(e?.response?.data?.error || 'Failed to create classroom') 
    } finally { 
      setCreating(false) 
    }
  }

  const joinClass = async () => {
    if (!form.code.trim()) {
      setError('Join code is required')
      return
    }
    
    setJoining(true)
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const { data } = await http.post('/api/classrooms/join', { code: form.code.trim() })
      navigate(`/classrooms/${data.classroom._id}`)
    } catch (e) { 
      setError(e?.response?.data?.error || 'Failed to join classroom') 
    } finally { 
      setJoining(false) 
    }
  }

  const clearError = () => setError('')
  const clearForm = () => setForm({ name: '', description: '', code: '' })

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
        <div className="text-lg font-medium text-base-content">Loading classrooms...</div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-base-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-base-content mb-2">Classrooms</h1>
          <p className="text-base-content/70">Manage and join your learning spaces</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-error mb-6 shadow-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
            <button className="btn btn-ghost btn-sm" onClick={clearError}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Join Classroom Card */}
          <div className="card bg-base-100 border border-base-300 shadow-lg hover:shadow-xl transition-shadow">
            <div className="card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <h3 className="card-title text-lg">Join Classroom</h3>
              </div>
              
              <p className="text-sm text-base-content/70 mb-4">
                Enter a class code to join an existing classroom
              </p>
              
              <div className="space-y-3">
                <input 
                  className="input input-bordered w-full focus:input-primary"
                  placeholder="Enter join code..."
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  onKeyPress={(e) => e.key === 'Enter' && joinClass()}
                />
                <button 
                  className={`btn btn-primary w-full gap-2 ${joining ? 'loading' : ''}`}
                  onClick={joinClass}
                  disabled={!form.code.trim()}
                >
                  {joining ? 'Joining...' : 'Join Classroom'}
                </button>
              </div>
            </div>
          </div>

          {/* Create Classroom Card - Teachers Only */}
          {me?.role === 'teacher' && (
            <div className="card bg-base-100 border border-base-300 shadow-lg hover:shadow-xl transition-shadow lg:col-span-2">
              <div className="card-body">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-secondary/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h3 className="card-title text-lg">Create New Classroom</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <label className="label">
                        <span className="label-text font-medium">Class Name</span>
                      </label>
                      <input 
                        className="input input-bordered w-full focus:input-primary"
                        placeholder="e.g., Mathematics 101"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                    <button 
                      className={`btn btn-secondary w-full gap-2 ${creating ? 'loading' : ''}`}
                      onClick={createClass}
                      disabled={!form.name.trim()}
                    >
                      {creating ? 'Creating...' : 'Create Classroom'}
                    </button>
                  </div>
                  
                  <div>
                    <label className="label">
                      <span className="label-text font-medium">Description (Optional)</span>
                    </label>
                    <textarea 
                      className="textarea textarea-bordered w-full h-24 focus:textarea-primary"
                      placeholder="Describe what this class is about..."
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Classrooms List */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-base-content">
              My Classrooms ({classes.length})
            </h2>
            <div className="tabs tabs-boxed">
              <button 
                className={`tab ${activeTab === 'myClasses' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('myClasses')}
              >
                All Classes
              </button>
              <button 
                className={`tab ${activeTab === 'recent' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('recent')}
              >
                Recent
              </button>
            </div>
          </div>

          {classes.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-base-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-base-content/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-base-content mb-2">No classrooms yet</h3>
              <p className="text-base-content/70 mb-4">
                {me?.role === 'teacher' 
                  ? 'Create your first classroom or join an existing one to get started.'
                  : 'Join a classroom using a code from your teacher.'
                }
              </p>
              {me?.role === 'teacher' && (
                <button 
                  className="btn btn-primary gap-2"
                  onClick={() => document.getElementById('create-classroom-section')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create Classroom
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {classes.map((classroom) => (
                <ClassroomCard 
                  key={classroom._id} 
                  classroom={classroom} 
                  onOpen={(cls) => navigate(`/classrooms/${cls._id}`)} 
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}