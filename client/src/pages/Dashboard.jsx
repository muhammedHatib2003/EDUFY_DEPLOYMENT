import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import {
  AlarmClock,
  Bell,
  Calendar,
  CheckCircle2,
  CircleDashed,
  Clock,
  NotebookPen,
  PlusCircle,
  Sparkles,
} from 'lucide-react'
import api from '../lib/api'

const dayKey = (date) => {
  try {
    const d = new Date(date)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return ''
  }
}

const formatDateTime = (date) => {
  try {
    return new Date(date).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function Dashboard() {
  const { getToken } = useAuth()
  const [me, setMe] = useState(null)
  const [classes, setClasses] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ classId: '', title: '', type: 'exam', date: '', description: '' })
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()))

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const [meRes, classRes, scheduleRes] = await Promise.all([
        http.get('/api/users/me'),
        http.get('/api/classrooms'),
        http.get('/api/schedule'),
      ])
      setMe(meRes.data.user)
      setClasses(classRes.data.classrooms || [])
      setItems(Array.isArray(scheduleRes.data.items) ? scheduleRes.data.items : [])
      const teacherClasses = (classRes.data.classrooms || []).filter((c) => c.teacherId === meRes.data.user?.clerkId)
      if (!form.classId && teacherClasses.length) {
        setForm((f) => ({ ...f, classId: teacherClasses[0]._id }))
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const fetchScheduleOnly = async () => {
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const { data } = await http.get('/api/schedule')
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to refresh schedule')
    }
  }

  const createItem = async () => {
    if (!form.classId || !form.title.trim() || !form.date) {
      setError('Classroom, title, and date are required')
      return
    }

    setSaving(true)
    setError('')
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      await http.post('/api/schedule', {
        classId: form.classId,
        title: form.title.trim(),
        type: form.type,
        date: form.date,
        description: form.description.trim(),
      })
      setForm((f) => ({ ...f, title: '', description: '' }))
      await fetchScheduleOnly()
    } catch (e) {
      setError(e?.response?.data?.error || 'Unable to save item')
    } finally {
      setSaving(false)
    }
  }

  const upcoming = useMemo(() => {
    const now = new Date()
    return [...items]
      .filter((i) => new Date(i.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 8)
  }, [items])

  const eventsByDay = useMemo(() => {
    const map = {}
    for (const item of items) {
      const key = dayKey(item.date)
      if (!key) continue
      if (!map[key]) map[key] = []
      map[key].push(item)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.date) - new Date(b.date))
    }
    return map
  }, [items])

  const monthGrid = useMemo(() => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    const today = dayKey(new Date())
    const days = []
    const pad = start.getDay() // sunday first
    for (let i = 0; i < pad; i++) days.push(null)
    for (let d = 1; d <= end.getDate(); d++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d)
      const key = dayKey(date)
      days.push({
        key,
        label: d,
        isToday: key === today,
        events: eventsByDay[key] || [],
      })
    }
    return days
  }, [currentMonth, eventsByDay])

  const selectedEvents = eventsByDay[selectedDay] || []

  const nextMonth = () => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const prevMonth = () => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="loading loading-lg text-primary mb-3" />
          <p className="text-base-content/70">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary font-semibold">
            <Sparkles size={16} /> Unified classroom view
          </div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-base-content/70">
            Track every exam, assignment, and announcement across your classrooms.
          </p>
        </div>
        <div className="flex gap-3">
          <StatPill
            label="Upcoming items"
            value={items.filter((i) => !i.isPast).length}
            icon={<AlarmClock size={16} />}
          />
          <StatPill
            label="Classes"
            value={classes.length}
            icon={<NotebookPen size={16} />}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <CircleDashed size={18} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {me?.role === 'teacher' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card bg-gradient-to-r from-base-200/80 via-base-100 to-base-200/80 border shadow-sm">
            <div className="card-body">
              <div className="flex items-center gap-2 mb-2">
                <PlusCircle size={18} className="text-primary" />
                <h3 className="font-semibold text-lg">Add exam or assignment</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="form-control">
                  <label className="label"><span className="label-text">Classroom</span></label>
                  <select
                    className="select select-bordered w-full"
                    value={form.classId}
                    onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}
                  >
                    <option value="">Select a class</option>
                    {classes.filter((c) => c.teacherId === me?.clerkId).map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Type</span></label>
                  <select
                    className="select select-bordered w-full"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="exam">Exam</option>
                    <option value="assignment">Assignment</option>
                    <option value="announcement">Announcement</option>
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <div className="form-control">
                  <label className="label"><span className="label-text">Title</span></label>
                  <input
                    className="input input-bordered"
                    placeholder="Midterm, Project 1, Quiz..."
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Date & time</span></label>
                  <input
                    type="datetime-local"
                    className="input input-bordered"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-control mt-3">
                <label className="label"><span className="label-text">Notes (optional)</span></label>
                <textarea
                  className="textarea textarea-bordered"
                  rows={2}
                  placeholder="Key details students should know..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="flex justify-end mt-4">
                <button
                  className={`btn btn-primary ${saving ? 'loading' : ''}`}
                  onClick={createItem}
                  disabled={saving}
                >
                  Save to calendar
                </button>
              </div>
            </div>
          </div>

          <div className="card border shadow-sm">
            <div className="card-body space-y-3">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-secondary" />
                <h4 className="font-semibold">Posting tips</h4>
              </div>
              <ul className="list-disc list-inside text-sm text-base-content/80 space-y-1">
                <li>Add a clear title so students see it in the list.</li>
                <li>Pick the class and time to place it on their calendar.</li>
                <li>Students get notified automatically once you save.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card border bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                <h3 className="font-semibold text-lg">
                  {currentMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-sm" onClick={prevMonth}>Prev</button>
                <button className="btn btn-ghost btn-sm" onClick={nextMonth}>Next</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-base-content/60 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {monthGrid.map((day, idx) => day ? (
                <button
                  key={day.key}
                  className={`p-2 rounded-lg border text-left transition ${
                    selectedDay === day.key ? 'border-primary bg-primary/10' : 'border-base-200 hover:border-primary/50'
                  } ${day.isToday ? 'ring-1 ring-primary/50' : ''}`}
                  onClick={() => setSelectedDay(day.key)}
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{day.label}</span>
                    {day.isToday && <span className="badge badge-ghost badge-xs">Today</span>}
                  </div>
                  {day.events.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {day.events.slice(0, 3).map((ev) => (
                        <div
                          key={ev._id}
                          className={`px-2 py-1 rounded text-xs ${
                            ev.type === 'exam'
                              ? 'bg-error/10 text-error'
                              : ev.type === 'assignment'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-info/10 text-info'
                          }`}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {day.events.length > 3 && (
                        <div className="text-[11px] text-base-content/60">+{day.events.length - 3} more</div>
                      )}
                    </div>
                  )}
                </button>
              ) : (
                <div key={`pad-${idx}`} />
              ))}
            </div>

            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={16} />
                <h4 className="font-semibold text-base">
                  {selectedDay ? new Date(selectedDay).toLocaleDateString() : 'Selected day'}
                </h4>
              </div>
              {selectedEvents.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed text-base-content/70">
                  No schedule items on this day.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map((ev) => (
                    <div key={ev._id} className="p-4 rounded-lg border bg-base-200/60">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <TypeBadge type={ev.type} />
                          <div className="font-semibold">{ev.title}</div>
                        </div>
                        <div className="text-sm text-base-content/70">{formatDateTime(ev.date)}</div>
                      </div>
                      <div className="text-sm text-base-content/80 mt-1">
                        {ev.className || 'Classroom'}
                      </div>
                      {ev.description && (
                        <p className="text-sm text-base-content/80 mt-2 whitespace-pre-wrap">{ev.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card border bg-base-100 shadow-sm">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={18} className="text-success" />
              <h3 className="font-semibold text-lg">Upcoming</h3>
            </div>
            {upcoming.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed text-base-content/70">
                Nothing scheduled yet. Items you or your teachers add will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((item) => (
                  <div key={item._id} className="p-3 rounded-lg border bg-base-200/60">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <TypeBadge type={item.type} />
                        <div className="font-semibold leading-tight">{item.title}</div>
                      </div>
                      <span className="text-xs text-base-content/60">{item.className || 'Classroom'}</span>
                    </div>
                    <div className="text-sm text-base-content/80 mt-1 flex items-center gap-2">
                      <Clock size={14} />
                      {formatDateTime(item.date)}
                    </div>
                    {item.description && (
                      <p className="text-sm text-base-content/70 mt-1 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatPill({ label, value, icon }) {
  return (
    <div className="px-4 py-3 rounded-xl border bg-base-100 shadow-sm flex items-center gap-2">
      <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
      <div>
        <div className="text-xs text-base-content/60">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  )
}

function TypeBadge({ type }) {
  const colors = {
    exam: 'bg-error/10 text-error border-error/30',
    assignment: 'bg-warning/10 text-warning border-warning/30',
    announcement: 'bg-info/10 text-info border-info/30',
  }
  const icons = {
    exam: <AlarmClock size={14} />,
    assignment: <NotebookPen size={14} />,
    announcement: <Bell size={14} />,
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${colors[type] || colors.announcement}`}>
      {icons[type] || icons.announcement}
      {type}
    </span>
  )
}
