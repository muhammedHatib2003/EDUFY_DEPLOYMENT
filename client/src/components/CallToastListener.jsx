import { useEffect, useState } from 'react'
import { StreamChat } from 'stream-chat'
import { useAuth } from '@clerk/clerk-react'
import { Phone, Video, PhoneOff, Check } from 'lucide-react'
import api from '../lib/api'
import VideoCall from '../pages/VideoCall.jsx'

// Lightweight, app-wide call invite listener so incoming calls float over any screen.
export default function CallToastListener() {
  const { getToken } = useAuth()
  const [client, setClient] = useState(null)
  const [incomingReq, setIncomingReq] = useState(null)
  const [callModal, setCallModal] = useState({ open: false, id: null, mode: 'video' })
  const [currentChannel, setCurrentChannel] = useState(null)
  const [liveNotice, setLiveNotice] = useState(null)

  // Connect to Stream Chat once for call invites
  useEffect(() => {
    let mounted = true
    let chat = null
    const init = async () => {
      try {
        const token = await getToken()
        const http = api.authedApi(token)
        const { data } = await http.post('/stream/token/chat')
        chat = StreamChat.getInstance(data.apiKey)
        if (chat.userID && chat.userID !== data.userId) {
          try { await chat.disconnectUser() } catch {}
        }
        if (!chat.userID || chat.userID !== data.userId) {
          await chat.connectUser({ id: data.userId }, data.token)
        }
        if (mounted) setClient(chat)
      } catch (err) {
        console.error('CallToastListener init failed', err)
      }
    }
    init()
    return () => {
      mounted = false
      if (chat) {
        try { chat.disconnectUser() } catch {}
      }
    }
  }, [getToken])

  // Helpers to attach to the channel even if not already watched
  useEffect(() => {
    if (!client) return

    const getOrWatchChannel = async (event) => {
      const cid = event?.cid
      if (!cid) return null
      if (event?.channel) return event.channel
      const existing = client.activeChannels?.[cid]
      if (existing) return existing
      const [type, id] = cid.split(':')
      const ch = client.channel(type, id)
      try { await ch.watch() } catch {}
      return ch
    }

    const handleMsgEvent = async (event) => {
      try {
        const msg = event?.message
        if (!msg) return
        if (msg.user?.id === client.userID) return

        if (msg.callInvite) {
          const channel = await getOrWatchChannel(event)
          // Avoid duplicate toasts
          setIncomingReq((prev) => {
            if (prev?.callId === msg.callInvite.callId && prev.from === msg.user?.id) return prev
            return { ...msg.callInvite, from: msg.user?.id, channel }
          })
        } else if (msg.callCancel) {
          setIncomingReq((prev) => (prev?.callId === msg.callCancel.callId ? null : prev))
        } else if (msg.callEnded) {
          if (callModal.open && msg.callEnded.callId === callModal.id) {
            setCallModal({ open: false, id: null, mode: 'video' })
            setCurrentChannel(null)
          }
        }
      } catch {}
    }

    const handleCustomEvent = async (event) => {
      try {
        if (event?.user?.id === client.userID) return
        if (event?.type === 'live_class_started') {
          const channel = await getOrWatchChannel(event)
          setLiveNotice({
            callId: event.callId,
            teacherName: event.user?.name || event.teacherName || 'Teacher',
            channel,
          })
        }
      } catch {}
    }

    client.on('message.new', handleMsgEvent)
    client.on('notification.message_new', handleMsgEvent)
    client.on('event', handleCustomEvent)
    client.on('notification.event', handleCustomEvent)

    return () => {
      try { client.off('message.new', handleMsgEvent) } catch {}
      try { client.off('notification.message_new', handleMsgEvent) } catch {}
      try { client.off('event', handleCustomEvent) } catch {}
      try { client.off('notification.event', handleCustomEvent) } catch {}
    }
  }, [client, callModal])

  const handleDecline = async () => {
    if (!incomingReq?.channel) {
      setIncomingReq(null)
      return
    }
    const { channel, ...rest } = incomingReq
    try {
      await channel.sendMessage({
        text: 'Call declined',
        callResponse: { ...rest, status: 'declined', from: client.userID },
      })
    } catch {}
    setIncomingReq(null)
  }

  const handleAccept = async () => {
    if (!incomingReq?.channel) {
      setIncomingReq(null)
      return
    }
    const { channel, ...rest } = incomingReq
    try {
      await channel.sendMessage({
        text: 'Call accepted',
        callResponse: { ...rest, inviter: rest.inviter || rest.from, status: 'accepted', from: client.userID },
      })
    } catch {}
    setCallModal({ open: true, id: incomingReq.callId, mode: incomingReq.mode })
    setCurrentChannel(channel)
    setIncomingReq(null)
  }

  const closeCall = async () => {
    try {
      if (currentChannel && callModal.id) {
        await currentChannel.sendMessage({
          text: 'Call ended',
          callEnded: { callId: callModal.id, from: client.userID },
        })
      }
    } catch {}
    setCallModal({ open: false, id: null, mode: 'video' })
    setCurrentChannel(null)
  }

  // Hide toast when already on /chat (Chat page handles its own popup)
  const isOnChatPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/chat')
  const showToast = incomingReq && !isOnChatPage

  return (
    <>
      {showToast && (
        <div className="fixed z-[10000] right-4 bottom-4 md:right-6 md:bottom-6 w-full max-w-sm">
          <div className="bg-base-100 border border-base-300 shadow-2xl rounded-2xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                {incomingReq.mode === 'voice' ? (
                  <Phone className="w-6 h-6 text-primary" />
                ) : (
                  <Video className="w-6 h-6 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-base-content/70">Incoming {incomingReq.mode === 'voice' ? 'voice' : 'video'} call</div>
                <div className="font-semibold truncate">{incomingReq.from}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-error flex-1 gap-2" onClick={handleDecline}>
                <PhoneOff size={18} />
                Decline
              </button>
              <button className="btn btn-success flex-1 gap-2" onClick={handleAccept}>
                <Check size={18} />
                Answer
              </button>
            </div>
          </div>
        </div>
      )}

      {callModal.open && (
        <VideoCall
          onClose={closeCall}
          callId={callModal.id}
          mode={callModal.mode}
          channel={currentChannel}
          friends={[]}
          isMobile={typeof window !== 'undefined' ? window.innerWidth < 768 : false}
        />
      )}

      {liveNotice && (
        <div className="fixed z-[10000] right-4 bottom-4 md:right-6 md:bottom-6 w-full max-w-sm">
          <div className="bg-base-100 border border-base-300 shadow-2xl rounded-2xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <Video className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-base-content/70">Live class starting</div>
                <div className="font-semibold truncate">{liveNotice.teacherName || 'Teacher'}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setLiveNotice(null)}>
                Dismiss
              </button>
              <button
                className="btn btn-primary flex-1 gap-2"
                onClick={() => {
                  if (liveNotice.callId) {
                    setCallModal({ open: true, id: liveNotice.callId, mode: 'video' })
                    setCurrentChannel(liveNotice.channel || null)
                  }
                  setLiveNotice(null)
                }}
              >
                <Check size={18} />
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
