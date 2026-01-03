import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { authedApi } from '../lib/api.js'
import { StreamChat } from 'stream-chat'
import {
  Chat as StreamChatUI,
  Channel,
  ChannelHeader,
  ChannelList,
  MessageInput,
  MessageList,
  Thread,
  Window,
  useChatContext,
  useChannelStateContext,
} from 'stream-chat-react'
import 'stream-chat-react/dist/css/v2/index.css'
import VideoCall from './VideoCall.jsx'
import { useNavigate } from 'react-router-dom'
import { 
  MessageCircle, 
  Phone, 
  Video, 
  Users, 
  X, 
  Check, 
  PhoneOff,
  Plus,
  Menu,
  Search,
  ArrowLeft
} from 'lucide-react'

function CreateChatModal({ open, onClose, client, friends }) {
  const { setActiveChannel } = useChatContext()
  const { getToken } = useAuth()
  const [selected, setSelected] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) { setSelected({}); setError(''); setSubmitting(false) }
  }, [open])

  const toggle = (handle) => setSelected((s) => ({ ...s, [handle]: !s[handle] }))

  const onCreate = async () => {
    setSubmitting(true); setError('')
    try {
      const chosen = Object.keys(selected).filter((h) => selected[h])
      if (chosen.length === 0) { setError('Select at least one friend'); setSubmitting(false); return }

      // Ensure all selected users exist in Stream Chat before creating the channel
      let friendIds = []
      try {
        const http = await authedApi(getToken)
        const { data } = await http.post('/stream/users/upsert', { identifiers: chosen })
        friendIds = Array.isArray(data?.users) ? data.users.map(u => u.userId).filter(Boolean) : []
      } catch (_) {}

      if (friendIds.length !== chosen.length) {
        setError('Some selected users are unavailable. Please try again later.')
        setSubmitting(false)
        return
      }

      const members = Array.from(new Set([client.userID, ...friendIds]))
      const channel = client.channel('messaging', { members })
      await channel.create()
      setActiveChannel(channel)
      onClose()
    } catch (e) {
      setError(e?.message || 'Failed to create chat')
    } finally { setSubmitting(false) }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-base-100 border border-base-300 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-6 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-xl">New Conversation</h3>
            <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-base-content/70 mb-4">Select friends to start a conversation</p>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" size={18} />
            <input 
              type="text" 
              placeholder="Search friends..." 
              className="input input-bordered w-full pl-10"
              onChange={(e) => {
                const search = e.target.value.toLowerCase()
                // You can implement search filtering here
              }}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-auto min-h-0 border-t border-base-300">
          {friends.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-base-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="text-base-content/50" size={24} />
              </div>
              <p className="text-base-content/70">No friends found</p>
              <p className="text-sm text-base-content/50 mt-2">Add friends to start chatting</p>
            </div>
          ) : (
            <div className="divide-y divide-base-300">
              {friends.map((f) => (
                <div
                  key={f._id}
                  className="flex items-center gap-3 p-4 hover:bg-base-200 transition-colors cursor-pointer active:scale-[0.98]"
                  onClick={() => toggle(f.handle)}
                >
                  <div className="avatar">
                    {f.avatarUrl ? (
                      <div className="w-12 h-12 rounded-full ring ring-primary/30 overflow-hidden">
                        <img src={f.avatarUrl} alt={f.handle || 'User'} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                        {(f.handle || 'U').replace(/^@/, '').charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base-content truncate">{f.handle}</div>
                    <div className="text-sm text-base-content/70 truncate">
                      {[f.firstName, f.lastName].filter(Boolean).join(' ') || 'No name'}
                    </div>
                  </div>
                  <input 
                    type="checkbox" 
                    className="checkbox checkbox-primary checkbox-lg" 
                    checked={!!selected[f.handle]} 
                    onChange={() => toggle(f.handle)} 
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-base-300 flex-shrink-0">
          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
            </div>
          )}
          
          <div className="flex gap-3">
            <button 
              className="btn btn-ghost flex-1" 
              onClick={onClose}
            >
              Cancel
            </button>
            <button 
              className={`btn btn-primary flex-1 gap-2 ${submitting ? 'loading' : ''}`} 
              onClick={onCreate} 
              disabled={submitting || Object.keys(selected).filter(k => selected[k]).length === 0}
            >
              {!submitting && <MessageCircle size={18} />}
              {submitting ? 'Creating...' : 'Start Chat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChannelCallBar({ onStartVideo, onStartVoice }) {
  const { channel } = useChannelStateContext()
  const { client } = useChatContext()
  const members = Object.values(channel?.state?.members || {}).filter(m => m.user?.id !== client.userID)
  
  return (
    <div className="bg-base-100 border-b border-base-300 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-base-content truncate">
          {members.length === 1 ? members[0]?.user?.name || members[0]?.user?.id : `${members.length} participants`}
        </div>
        <div className="text-xs text-base-content/70">Tap to start a call</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="btn btn-outline btn-xs sm:btn-sm rounded-full"
          onClick={() => onStartVoice(channel)}
          aria-label="Voice call"
        >
          <Phone size={16} />
          <span className="hidden sm:inline">Voice</span>
        </button>
        <button
          className="btn btn-primary btn-xs sm:btn-sm rounded-full"
          onClick={() => onStartVideo(channel)}
          aria-label="Video call"
        >
          <Video size={16} />
          <span className="hidden sm:inline">Video</span>
        </button>
      </div>
    </div>
  )
}

function CallInviteHandler({ onIncoming, onResponse, onCancel, onAccepted, onEnded }) {
  const { client } = useChatContext()
  const { channel } = useChannelStateContext()
  useEffect(() => {
    if (!client || !channel) return
    const handler = (event) => {
      try {
        const msg = event?.message
        if (!msg || event?.cid !== channel?.cid) return
        if (msg.callInvite) {
          onIncoming?.({ ...msg.callInvite, from: msg.user?.id, channel })
        } else if (msg.callResponse) {
          onResponse?.(msg.callResponse)
          if (msg.callResponse?.status === 'accepted') onAccepted?.(msg.callResponse)
        } else if (msg.callCancel) {
          onCancel?.(msg.callCancel)
        } else if (msg.callEnded) {
          onEnded?.(msg.callEnded)
        }
      } catch {}
    }
    client.on('message.new', handler)
    return () => { try { client.off('message.new', handler) } catch {} }
  }, [client, channel?.cid, onIncoming, onResponse, onCancel, onAccepted, onEnded])
  return null
}

function MobileSidebar({ show, onClose, client, friends, onCreateChat }) {
  const friendIds = (friends || []).map(f => f.handle).filter(Boolean)
  const filters = friendIds.length > 0
    ? { type: 'messaging', $and: [ { members: { $in: [client.userID] } }, { members: { $in: friendIds } } ] }
    : { type: 'messaging', members: { $in: [client.userID] } }
  const sort = { last_message_at: -1 }
  const options = { presence: true, state: true }

  return (
    <div className={`fixed inset-0 z-40 transform transition-transform duration-300 ease-in-out ${
      show ? 'translate-x-0' : '-translate-x-full'
    }`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-80 max-w-[85vw] h-full bg-base-100 flex flex-col">
        <div className="p-4 border-b border-base-300 flex items-center gap-3">
          <button onClick={onClose} className="btn btn-ghost btn-circle">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-bold text-base-content">Messages</h2>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <ChannelList 
            filters={filters} 
            sort={sort} 
            options={options}
          />
        </div>
        
        <div className="p-4 border-t border-base-300">
          <button 
            className="btn btn-primary w-full gap-2"
            onClick={() => {
              onClose()
              onCreateChat()
            }}
          >
            <Plus size={20} />
            New Chat
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Chat() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [friends, setFriends] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const [callModal, setCallModal] = useState({ open: false, id: null, mode: 'video' })
  const [incomingReq, setIncomingReq] = useState(null)
  const [outgoingReq, setOutgoingReq] = useState(null)
  const [callAccepted, setCallAccepted] = useState({ callId: null, by: null })
  const [currentCallChannel, setCurrentCallChannel] = useState(null)
  const [callRole, setCallRole] = useState(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const windowRef = useRef(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const getChatTheme = () => {
    const t = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light'
    return t === 'dark' ? 'str-chat__theme-dark' : 'str-chat__theme-light'
  }
  const [chatTheme, setChatTheme] = useState(getChatTheme())

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
      const http = await authedApi(getToken)
        const me = await http.get('/users/me')
        if (!me.data.user.onboarded) return navigate('/onboarding')

        const { data } = await http.post('/stream/token/chat')
        const chat = StreamChat.getInstance(data.apiKey)
        if (chat.userID && chat.userID !== data.userId) { try { await chat.disconnectUser() } catch {} }
        if (!chat.userID || chat.userID !== data.userId) { await chat.connectUser({ id: data.userId }, data.token) }

        const fr = await http.get('/friends/list')
        if (mounted) { setClient(chat); setFriends(fr.data.friends || []) }
      } catch (e) {
        const msg = e?.response?.data?.error || e?.message || 'Failed to connect to chat'
        setError(msg)
      } finally { if (mounted) setLoading(false) }
    }
    init()
    return () => { mounted = false; try { client?.disconnectUser?.() } catch {} }
  }, [])

  useEffect(() => {
    const handler = () => setChatTheme(getChatTheme())
    window.addEventListener('app:themechange', handler)
    return () => window.removeEventListener('app:themechange', handler)
  }, [])

  // Listen for call invites on any channel so missed chats still surface the request
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

        if (msg.callInvite) {
          if (msg.user?.id === client.userID) return
          const channel = await getOrWatchChannel(event)
          setIncomingReq((prev) => {
            if (prev?.callId === msg.callInvite.callId && prev.from === msg.user?.id) return prev
            return { ...msg.callInvite, from: msg.user?.id, channel }
          })
        } else if (msg.callCancel) {
          setIncomingReq((prev) => (prev?.callId === msg.callCancel.callId ? null : prev))
        }
      } catch {}
    }

    client.on('message.new', handleMsgEvent)
    client.on('notification.message_new', handleMsgEvent)

    return () => {
      try { client.off('message.new', handleMsgEvent) } catch {}
      try { client.off('notification.message_new', handleMsgEvent) } catch {}
    }
  }, [client])

  if (loading) return (
    <div className="w-screen h-screen flex items-center justify-center bg-base-100">
      <div className="text-center space-y-4">
        <div className="loading loading-spinner loading-lg text-primary"></div>
        <div className="text-base-content/70">Loading chat...</div>
      </div>
    </div>
  )
  
  if (!client) return (
    <div className="w-screen h-screen flex items-center justify-center bg-base-100 p-4">
      <div className="card bg-base-100 shadow-xl max-w-md w-full">
        <div className="card-body">
          <div className="alert alert-error mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Unable to connect to chat</span>
          </div>
          {error && (
            <div className="bg-base-200 rounded-lg p-4 mb-4">
              <div className="text-sm font-medium text-base-content mb-2">Error details:</div>
              <div className="text-sm text-base-content/70 font-mono break-all">{String(error)}</div>
            </div>
          )}
          <div className="bg-base-200 rounded-lg p-4">
            <div className="text-sm font-medium text-base-content mb-2">Troubleshooting steps:</div>
            <ul className="text-sm text-base-content/70 space-y-1">
              <li>• Check server environment variables</li>
              <li>• Verify server is running</li>
              <li>• Ensure you're signed in</li>
            </ul>
          </div>
          <div className="card-actions justify-end mt-4">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  const friendIds = (friends || []).map(f => f.handle).filter(Boolean)
  const filters = friendIds.length > 0
    ? { type: 'messaging', $and: [ { members: { $in: [client.userID] } }, { members: { $in: friendIds } } ] }
    : { type: 'messaging', members: { $in: [client.userID] } }
  const sort = { last_message_at: -1 }
  const options = { presence: true, state: true }

  return (
    <div className="w-screen h-screen bg-base-100 overflow-hidden" ref={windowRef}>
      <StreamChatUI client={client} theme={chatTheme}>
        <div className="h-full flex flex-col md:flex-row overflow-hidden">
          {/* Mobile Sidebar */}
          <MobileSidebar 
            show={mobileSidebarOpen}
            onClose={() => setMobileSidebarOpen(false)}
            client={client}
            friends={friends}
            onCreateChat={() => setCreateOpen(true)}
          />

          {/* Desktop Sidebar (hidden on mobile) */}
          {!isMobile && (
            <div className="w-80 min-w-80 border-r border-base-300 bg-base-100 flex flex-col hidden md:flex">
              <div className="p-6 border-b border-base-300">
                <h2 className="text-xl font-bold text-base-content">Messages</h2>
              </div>
              
              <div className="flex-1 overflow-hidden">
                <ChannelList 
                  filters={filters} 
                  sort={sort} 
                  options={options}
                />
              </div>
              
              <div className="p-4 border-t border-base-300">
                <button 
                  className="btn btn-primary w-full gap-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={20} />
                  New Chat
                </button>
              </div>
            </div>
          )}

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
            {/* Mobile Header */}
            {isMobile && (
              <div className="bg-base-100 border-b border-base-300 px-4 py-3 flex items-center gap-3 md:hidden">
                <button 
                  className="btn btn-ghost btn-circle"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <Menu size={20} />
                </button>
                <div className="flex-1">
                  <div className="text-sm font-medium text-base-content truncate">
                    {windowRef.current?.querySelector('.str-chat__header-livestream-title')?.textContent || 'Messages'}
                  </div>
                </div>
              </div>
            )}

            <Channel>
              <div className="flex flex-1 min-h-0">
                <Window>
                  <ChannelCallBar
                    onStartVideo={async (ch) => {
                      try {
                        const id = ch?.id || (ch?.cid ? ch.cid.replace(':', '-') : 'graedufy-call')
                        const invite = { callId: id, mode: 'video', type: 'initial', from: client.userID, inviter: client.userID, ts: Date.now() }
                        await ch.sendMessage({ text: 'Video call invite', callInvite: invite })
                        setOutgoingReq({ ...invite, channel: ch })
                        setCallAccepted({ callId: null, by: null })
                      } catch {}
                    }}
                    onStartVoice={async (ch) => {
                      try {
                        const id = ch?.id || (ch?.cid ? ch.cid.replace(':', '-') : 'graedufy-call')
                        const invite = { callId: id, mode: 'voice', type: 'initial', from: client.userID, inviter: client.userID, ts: Date.now() }
                        await ch.sendMessage({ text: 'Voice call invite', callInvite: invite })
                        setOutgoingReq({ ...invite, channel: ch })
                        setCallAccepted({ callId: null, by: null })
                      } catch {}
                    }}
                  />
                  <ChannelHeader />
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 min-h-0">
                      <MessageList />
                    </div>
                    <div className="border-t border-base-300 bg-base-100">
                      <MessageInput focus />
                    </div>
                  </div>
                </Window>
                <Thread />
              </div>
              <CallInviteHandler
                onIncoming={(inv) => {
                  if (inv.from === client.userID) return
                  const isAdd = inv?.type === 'add'
                  if (Array.isArray(inv?.to) && !inv.to.includes(client.userID)) return
                  if (!isAdd && callAccepted.callId && callAccepted.callId === inv.callId && callAccepted.by) return
                  setIncomingReq(inv)
                }}
                onResponse={(resp) => {
                  if (resp?.status === 'declined' && outgoingReq && resp?.callId === outgoingReq.callId) { setOutgoingReq(null) }
                }}
                onAccepted={(resp) => {
                  const isAdd = resp?.type === 'add'
                  if (!isAdd) {
                    setCallAccepted((prev) => {
                      if (prev.callId === resp.callId && prev.by && prev.by !== resp.from) return prev
                      return { callId: resp.callId, by: resp.from }
                    })
                  }
                  if ((outgoingReq && resp.callId === outgoingReq.callId) || resp?.inviter === client.userID) {
                    const id = outgoingReq ? outgoingReq.callId : resp.callId
                    const mode = outgoingReq ? outgoingReq.mode : (resp.mode || 'video')
                    setCallModal({ open: true, id, mode })
                    setCurrentCallChannel(outgoingReq ? outgoingReq.channel : channel)
                    setCallRole('caller')
                    setOutgoingReq(null)
                  }
                  if (!isAdd && incomingReq && resp.callId === incomingReq.callId && resp.from !== client.userID) { setIncomingReq(null) }
                  if (!isAdd && resp.from !== client.userID && callModal.open && callModal.id === resp.callId && callRole === 'callee') {
                    setCallModal({ open: false, id: null, mode: 'video' }); setCurrentCallChannel(null)
                  }
                }}
                onCancel={(cancel) => { if (incomingReq && cancel?.callId === incomingReq.callId) setIncomingReq(null); if (outgoingReq && cancel?.callId === outgoingReq.callId) setOutgoingReq(null) }}
                onEnded={(ended) => {
                  if (callModal.open && ended?.callId === callModal.id) {
                    setCallModal({ open: false, id: null, mode: 'video' }); setCurrentCallChannel(null)
                    setCallAccepted({ callId: null, by: null }); setCallRole(null); setOutgoingReq(null); setIncomingReq(null)
                  }
                }}
              />
            </Channel>
          </div>
        </div>

        <CreateChatModal 
          open={createOpen} 
          onClose={() => setCreateOpen(false)} 
          client={client} 
          friends={friends} 
        />
      </StreamChatUI>

      {/* Incoming Call Floating Pop-up */}
      {incomingReq && (
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
              <button
                className="btn btn-error flex-1 gap-2"
                onClick={async () => {
                  const { channel, ...rest } = incomingReq
                  try {
                    await channel.sendMessage({
                      text: 'Call declined',
                      callResponse: { ...rest, status: 'declined', from: client.userID },
                    })
                  } catch {}
                  setIncomingReq(null)
                }}
              >
                <PhoneOff size={18} />
                Decline
              </button>
              <button
                className="btn btn-success flex-1 gap-2"
                onClick={async () => {
                  const { channel, ...rest } = incomingReq
                  if (
                    rest?.type !== 'add' &&
                    callAccepted.callId === incomingReq.callId &&
                    callAccepted.by &&
                    callAccepted.by !== client.userID
                  ) {
                    setIncomingReq(null)
                    return
                  }
                  try {
                    await channel.sendMessage({
                      text: 'Call accepted',
                      callResponse: { ...rest, inviter: rest.inviter || rest.from, status: 'accepted', from: client.userID },
                    })
                  } catch {}
                  if (rest?.type !== 'add') setCallAccepted({ callId: incomingReq.callId, by: client.userID })
                  setCallModal({ open: true, id: incomingReq.callId, mode: incomingReq.mode })
                  setCurrentCallChannel(channel)
                  setCallRole('callee')
                  setIncomingReq(null)
                }}
              >
                <Check size={18} />
                Answer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outgoing Call Modal */}
      {outgoingReq && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-base-100 border border-base-300 rounded-2xl shadow-xl max-w-sm w-full animate-in fade-in zoom-in-95">
            <div className="p-8 text-center">
              <div className="loading loading-spinner loading-lg text-primary mb-6"></div>
              <h3 className="font-bold text-xl mb-2">
                Calling...
              </h3>
              <p className="text-base-content/70 mb-6">Waiting for answer</p>
              <button 
                className="btn btn-outline btn-lg gap-2"
                onClick={async () => { 
                  try { 
                    await outgoingReq.channel.sendMessage({ 
                      text: 'Call canceled', 
                      callCancel: { callId: outgoingReq.callId, from: client.userID } 
                    }) 
                  } catch {}; 
                  setOutgoingReq(null) 
                }}
              >
                <X size={20} />
                Cancel Call
              </button>
            </div>
          </div>
        </div>
      )}

      {callModal.open && (
        <VideoCall
          onClose={async () => {
            try { 
              if (currentCallChannel && callModal.id) { 
                await currentCallChannel.sendMessage({ 
                  text: 'Call ended', 
                  callEnded: { callId: callModal.id, from: client.userID } 
                }) 
              } 
            } catch {}
            setCallModal({ open: false, id: null, mode: 'video' }); 
            setCurrentCallChannel(null)
            setCallAccepted({ callId: null, by: null }); 
            setCallRole(null); 
            setOutgoingReq(null); 
            setIncomingReq(null)
          }}
          callId={callModal.id}
          mode={callModal.mode}
          channel={currentCallChannel}
          friends={friends}
          isMobile={isMobile}
        />
      )}
    </div>
  )
}
