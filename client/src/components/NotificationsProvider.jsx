import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { authedApi } from '../lib/api.js'

const Ctx = createContext(null)

export function useNotifications() {
  return useContext(Ctx)
}

export default function NotificationsProvider({ children }) {
  const { getToken } = useAuth()
  const navigate = useNavigate()

  const [toasts, setToasts] = useState([])
  const [enabled, setEnabled] = useState(true)

  const showingIds = useRef(new Set())
  const seenIds = useRef(new Set())

  /* ---------------------------------------
     NOTIFICATION PERMISSION (WEB ONLY)
     --------------------------------------- */
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission !== 'granted'
    ) {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  /* ---------------------------------------
     TOAST HELPERS
     --------------------------------------- */
  const showToast = (n) => {
    if (!enabled) return
    if (!n?._id) return
    if (showingIds.current.has(n._id)) return

    showingIds.current.add(n._id)

    const toast = {
      id: n._id,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      data: n.data,
      type: n.type || 'info',
    }

    setToasts((prev) => [...prev, toast])

    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== n._id))
      showingIds.current.delete(n._id)
    }, 6000)
  }

  const maybeDesktop = (n) => {
    try {
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const notif = new Notification(n.title || 'Notification', {
          body: n.body || '',
        })

        notif.onclick = () => {
          const d = n.data || {}
          if (d.classroomId) navigate(`/classrooms/${d.classroomId}`)
          window.focus()
        }
      }
    } catch {}
  }

  /* ---------------------------------------
     FETCH NOTIFICATIONS
     --------------------------------------- */
  const fetchNew = async () => {
    try {
      const token = await getToken()
      if (!token) return

      const http = authedApi(token)
      const { data } = await http.get('/notifications', {
        params: { limit: 20 },
      })

      const list = Array.isArray(data?.notifications)
        ? data.notifications
        : []

      if (seenIds.current.size === 0) {
        list.forEach((n) => seenIds.current.add(n._id))
        return
      }

      const fresh = list.filter(
        (n) => !n.readAt && !seenIds.current.has(n._id)
      )

      for (const n of fresh) {
        seenIds.current.add(n._id)
        showToast(n)
        maybeDesktop(n)
      }
    } catch (err) {
      console.error('[notifications]', err)
    }
  }

  useEffect(() => {
    const interval = setInterval(fetchNew, 10000)
    const first = setTimeout(fetchNew, 1500)

    return () => {
      clearInterval(interval)
      clearTimeout(first)
    }
  }, [])

  /* ---------------------------------------
     UI HELPERS
     --------------------------------------- */
  const onToastClick = (toast) => {
    const d = toast.data || {}
    if (d.classroomId) navigate(`/classrooms/${d.classroomId}`)
    setToasts((prev) => prev.filter((t) => t.id !== toast.id))
    showingIds.current.delete(toast.id)
  }

  const onToastClose = (toast, e) => {
    e.stopPropagation()
    setToasts((prev) => prev.filter((t) => t.id !== toast.id))
    showingIds.current.delete(toast.id)
  }

  const formatTime = (createdAt) => {
    if (!createdAt) return ''
    const diff = Date.now() - new Date(createdAt).getTime()
    const m = Math.floor(diff / 60000)
    const h = Math.floor(diff / 3600000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    if (h < 24) return `${h}h ago`
    return new Date(createdAt).toLocaleDateString()
  }

  const value = useMemo(
    () => ({
      enableToasts: () => setEnabled(true),
      disableToasts: () => setEnabled(false),
      toasts,
      clearToasts: () => {
        setToasts([])
        showingIds.current.clear()
      },
    }),
    [toasts]
  )

  /* ---------------------------------------
     RENDER
     --------------------------------------- */
  return (
    <Ctx.Provider value={value}>
      {children}

      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[200] space-y-3 max-w-sm w-full">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              onClick={() => onToastClick(toast)}
              className="relative p-4 rounded-xl shadow-lg border bg-base-100 cursor-pointer"
            >
              <button
                className="absolute top-2 right-2 text-xs"
                onClick={(e) => onToastClose(toast, e)}
              >
                ✕
              </button>

              <h4 className="font-semibold text-sm">{toast.title}</h4>

              {toast.body && (
                <p className="text-xs opacity-80 mt-1">{toast.body}</p>
              )}

              <div className="text-xs opacity-60 mt-2">
                {formatTime(toast.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  )
}
