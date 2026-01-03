import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { authedApi } from '../lib/api.js'

export default function NotificationsBell() {
  const { getToken } = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const unreadCount = useMemo(
    () => items.filter(n => !n.readAt).length,
    [items]
  )

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const http = authedApi(await getToken())
      const { data } = await http.get('/notifications', { params: { limit: 20 } })
      setItems(Array.isArray(data.notifications) ? data.notifications : [])
    } catch (err) {
      console.warn('Failed to fetch notifications', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
    const id = setInterval(fetchNotifications, 20000)
    return () => clearInterval(id)
  }, [])

  const markAllRead = async () => {
    try {
      const http = authedApi(await getToken())
      await http.post('/notifications/mark-read', {})
      setItems(prev =>
        prev.map(n => ({
          ...n,
          readAt: n.readAt || new Date().toISOString(),
        }))
      )
    } catch (err) {
      console.warn('Failed to mark all read', err)
    }
  }

  const clickItem = async (n) => {
    // optimistic update
    setItems(prev =>
      prev.map(x =>
        x._id === n._id
          ? { ...x, readAt: x.readAt || new Date().toISOString() }
          : x
      )
    )

    try {
      const http = authedApi(await getToken())
      await http.post('/notifications/mark-read', { ids: [n._id] })
    } catch (err) {
      console.warn('Failed to mark read', err)
    }

    if (n.data?.classroomId) {
      navigate(`/classrooms/${n.data.classroomId}`)
      setOpen(false)
    }
  }

  const requestDesktopPermission = async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
    } catch {}
  }

  return (
    <div className="dropdown dropdown-end">
      <button
        className="btn btn-ghost btn-circle"
        onClick={() => {
          setOpen(!open)
          if (!open) fetchNotifications()
        }}
        aria-label="Notifications"
      >
        <div className="indicator">
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="badge badge-error badge-xs indicator-item">
              {unreadCount}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="card card-compact dropdown-content bg-base-100 w-80 shadow z-[100]">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Notifications</div>
              <button
                className="btn btn-ghost btn-xs"
                onClick={markAllRead}
                disabled={!unreadCount}
              >
                Mark all read
              </button>
            </div>

            <div className="divider my-1" />

            <div className="max-h-80 overflow-auto">
              {items.length === 0 && (
                <div className="text-sm opacity-70">
                  {loading ? 'Loading...' : 'No notifications'}
                </div>
              )}

              {items.map(n => (
                <button
                  key={n._id}
                  className={`w-full text-left px-2 py-2 rounded hover:bg-base-200 ${
                    !n.readAt ? 'font-medium' : ''
                  }`}
                  onClick={() => clickItem(n)}
                >
                  <div className="text-sm">{n.title}</div>
                  {n.body && (
                    <div className="text-xs opacity-80">{n.body}</div>
                  )}
                  <div className="text-[10px] opacity-60 mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </button>
              ))}

              {'Notification' in window &&
                Notification.permission !== 'granted' && (
                  <div className="mt-2">
                    <button
                      className="btn btn-xs"
                      onClick={requestDesktopPermission}
                    >
                      Enable desktop alerts
                    </button>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
