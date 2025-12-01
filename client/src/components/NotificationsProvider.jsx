import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

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

  // Request notification permission on app load
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission()
    }
  }, [])

  const showToast = (n) => {
    if (!enabled) return
    if (showingIds.current.has(n._id)) return
    showingIds.current.add(n._id)
    const t = { 
      id: n._id, 
      title: n.title, 
      body: n.body, 
      createdAt: n.createdAt, 
      data: n.data,
      type: n.type || 'info'
    }
    setToasts((prev) => [...prev, t])
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== n._id))
      showingIds.current.delete(n._id)
    }, 6000)
  }

  const maybeDesktop = (n) => {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const notif = new Notification(n.title || 'Notification', { 
          body: n.body || '',
          icon: '/favicon.ico',
          badge: '/favicon.ico'
        })
        notif.onclick = () => {
          const d = n.data || {}
          if (d.classroomId) navigate(`/classrooms/${d.classroomId}`)
          window.focus()
        }
      }
    } catch {}
  }

  const fetchNew = async () => {
    try {
      const token = await getToken()
      const http = api.authedApi(token)
      const { data } = await http.get('/api/notifications', { params: { limit: 20 } })
      const list = Array.isArray(data.notifications) ? data.notifications : []
      if (seenIds.current.size === 0 && list.length) {
        for (const n of list) seenIds.current.add(n._id)
        return
      }
      const fresh = list.filter(n => !n.readAt && !seenIds.current.has(n._id))
      for (const n of fresh) { 
        seenIds.current.add(n._id)
        showToast(n)
        maybeDesktop(n)
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }

  useEffect(() => {
    const id = setInterval(fetchNew, 10000)
    const t = setTimeout(fetchNew, 1500)
    return () => { 
      clearInterval(id)
      clearTimeout(t)
    }
  }, [])

  const onToastClick = (toast) => {
    const d = toast.data || {}
    if (d.classroomId) navigate(`/classrooms/${d.classroomId}`)
    setToasts(prev => prev.filter(t => t.id !== toast.id))
    showingIds.current.delete(toast.id)
  }

  const onToastClose = (toast, e) => {
    e.stopPropagation()
    setToasts(prev => prev.filter(t => t.id !== toast.id))
    showingIds.current.delete(toast.id)
  }

  const getToastStyle = (type) => {
    const styles = {
      info: 'bg-info text-info-content border-info/20',
      success: 'bg-success text-success-content border-success/20',
      warning: 'bg-warning text-warning-content border-warning/20',
      error: 'bg-error text-error-content border-error/20',
      default: 'bg-base-100 text-base-content border-base-300'
    }
    return styles[type] || styles.default
  }

  const getToastIcon = (type) => {
    const icons = {
      info: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      success: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      warning: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
      error: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
    return icons[type] || icons.info
  }

  const formatTime = (createdAt) => {
    if (!createdAt) return ''
    const date = new Date(createdAt)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  const value = useMemo(() => ({ 
    enableToasts: () => setEnabled(true), 
    disableToasts: () => setEnabled(false),
    toasts,
    clearToasts: () => {
      setToasts([])
      showingIds.current.clear()
    }
  }), [toasts])

  return (
    <Ctx.Provider value={value}>
      {children}
      
      {/* Enhanced Toast Container */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[200] space-y-3 max-w-sm w-full">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`relative p-4 rounded-xl shadow-lg border transform transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] ${getToastStyle(toast.type)}`}
              onClick={() => onToastClick(toast)}
            >
              {/* Close Button */}
              <button
                className="absolute top-2 right-2 btn btn-ghost btn-xs btn-circle opacity-70 hover:opacity-100"
                onClick={(e) => onToastClose(toast, e)}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Toast Content */}
              <div className="flex items-start gap-3 pr-6">
                <div className="flex-shrink-0 mt-0.5">
                  {getToastIcon(toast.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm leading-tight mb-1">
                    {toast.title}
                  </h4>
                  {toast.body && (
                    <p className="text-xs opacity-90 leading-relaxed mb-2">
                      {toast.body}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs opacity-70">
                      {formatTime(toast.createdAt)}
                    </span>
                    {toast.data?.classroomId && (
                      <span className="text-xs opacity-70">
                        Click to view
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-current opacity-20 rounded-b-xl">
                <div 
                  className="h-full bg-current opacity-40 rounded-b-xl transition-all duration-6000 ease-linear"
                  style={{ width: '100%' }}
                  onAnimationEnd={() => {
                    setToasts(prev => prev.filter(t => t.id !== toast.id))
                    showingIds.current.delete(toast.id)
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  )
}