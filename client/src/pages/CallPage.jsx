import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import VideoCall from './VideoCall.jsx'

export default function CallPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const { mode, callName } = useMemo(() => {
    const sp = new URLSearchParams(location.search || '')
    const rawMode = (sp.get('mode') || '').toLowerCase()
    const mode = rawMode === 'voice' ? 'voice' : 'video'
    const callName = sp.get('name') || ''
    return { mode, callName }
  }, [location.search])

  const onClose = async () => {
    try {
      // If opened via window.open(), try to close the tab/window.
      window.close()
    } catch {}
    // Fallback: navigate back into the app.
    navigate('/dashboard', { replace: true })
  }

  if (!id) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-base-content/70">Missing call id.</div>
      </div>
    )
  }

  return (
    <VideoCall
      onClose={onClose}
      callId={id}
      callName={callName || id}
      mode={mode}
      channel={null}
      friends={[]}
    />
  )
}

