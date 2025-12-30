import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@clerk/clerk-react'
import api from '../lib/api'
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
        const token = await getToken()
        const http = api.authedApi(token)
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
      <div className="bg-base-100 border border-base-300 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="font-bold text-xl mb-2">Create New Chat</h3>
          <p className="text-sm text-base-content/70 mb-4">Select friends to start a conversation</p>
          
          <div className="max-h-64 overflow-auto border border-base-300 rounded-lg">
            {friends.length === 0 ? (
              <div className="p-4 text-center text-sm text-base-content/70">
                You have no friends yet
              </div>
            ) : (
              <ul className="divide-y divide-base-300">
                {friends.map((f) => (
                  <li key={f._id} className="flex items-center gap-3 p-3 hover:bg-base-200 transition-colors">
                    <input 
                      type="checkbox" 
                      className="checkbox checkbox-primary checkbox-sm" 
                      checked={!!selected[f.handle]} 
                      onChange={() => toggle(f.handle)} 
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-base-content truncate">{f.handle}</div>
                      <div className="text-xs text-base-content/70 truncate">
                        {[f.firstName, f.lastName].filter(Boolean).join(' ') || 'No name'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {error && (
            <div className="alert alert-error mt-4 p-3 text-sm">
              {error}
            </div>
          )}
          
          <div className="flex justify-end gap-3 mt-6">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button 
              className={`btn btn-primary btn-sm ${submitting ? 'loading' : ''}`} 
              onClick={onCreate} 
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Chat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChannelCallBar({ onStartVideo, onStartVoice }) {
  const { channel } = useChannelStateContext()
  return (
    <div className="bg-base-100/80 backdrop-blur border-b border-base-300 px-4 py-3 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-base-content">Ready to call</div>
      </div>
      <div className="flex gap-2">
        <button 
          className="btn btn-outline btn-sm gap-2"
          onClick={() => onStartVoice(channel)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          Voice
        </button>
        <button 
          className="btn btn-primary btn-sm gap-2"
          onClick={() => onStartVideo(channel)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Video
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

  const getChatTheme = () => {
    const t = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light'
    return t === 'dark' ? 'str-chat__theme-dark' : 'str-chat__theme-light'
  }
  const [chatTheme, setChatTheme] = useState(getChatTheme())

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        const token = await getToken()
        const http = api.authedApi(token)
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

  if (loading) return (
    <div className="w-screen h-screen flex items-center justify-center bg-base-100">
      <div className="text-center">
        <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
        <div className="text-base-content/70">Loading chat...</div>
      </div>
    </div>
  )
  
  if (!client) return (
    <div className="w-screen h-screen flex items-center justify-center bg-base-100 p-4">
      <div className="max-w-md w-full">
        <div className="alert alert-error mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Unable to connect to chat</span>
        </div>
        {error && (
          <div className="bg-base-200 rounded-lg p-4 mb-4">
            <div className="text-sm font-medium text-base-content mb-2">Error details:</div>
            <div className="text-sm text-base-content/70 font-mono">{String(error)}</div>
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
    <div className="w-screen h-screen bg-base-100 flex">
      <StreamChatUI client={client} theme={chatTheme}>
        <div className="w-full h-full flex">
          {/* Sidebar */}
          <div className="w-80 min-w-80 border-r border-base-300 bg-base-100 flex flex-col">
            <div className="p-4 border-b border-base-300">
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Chat
              </button>
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col min-w-0">
            <Channel>
              <Window>
                <ChannelCallBar
                  onStartVideo={async (ch) => {
                    try {
                      const id = ch?.id || (ch?.cid ? ch.cid.replace(':', '-') : 'graedufy-call')
                      const invite = { callId: id, mode: 'video', type: 'initial', from: client.userID, inviter: client.userID, ts: Date.now() }
                      await ch.sendMessage({ text: 'Call invite', callInvite: invite })
                      setOutgoingReq({ ...invite, channel: ch })
                      setCallAccepted({ callId: null, by: null })
                    } catch {}
                  }}
                  onStartVoice={async (ch) => {
                    try {
                      const id = ch?.id || (ch?.cid ? ch.cid.replace(':', '-') : 'graedufy-call')
                      const invite = { callId: id, mode: 'voice', type: 'initial', from: client.userID, inviter: client.userID, ts: Date.now() }
                      await ch.sendMessage({ text: 'Call invite', callInvite: invite })
                      setOutgoingReq({ ...invite, channel: ch })
                      setCallAccepted({ callId: null, by: null })
                    } catch {}
                  }}
                />
                <ChannelHeader />
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-hidden">
                    <MessageList />
                  </div>
                  <div className="border-t border-base-300 bg-base-100">
                    <MessageInput focus />
                  </div>
                </div>
              </Window>
              <Thread />
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

      {/* Incoming Call Modal */}
      {incomingReq && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-base-100 border border-base-300 rounded-2xl shadow-xl max-w-sm w-full">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="font-bold text-xl mb-2">
                Incoming {incomingReq.mode === 'voice' ? 'Voice' : 'Video'} Call
              </h3>
              <p className="text-base-content/70 mb-6">from {incomingReq.from}</p>
              <div className="flex gap-3 justify-center">
                <button 
                  className="btn btn-error btn-sm gap-2"
                  onClick={async () => { 
                    const { channel, ...rest } = incomingReq; 
                    try { 
                      await channel.sendMessage({ 
                        text: 'Call declined', 
                        callResponse: { ...rest, status: 'declined', from: client.userID } 
                      }) 
                    } catch {}; 
                    setIncomingReq(null) 
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Decline
                </button>
                <button 
                  className="btn btn-success btn-sm gap-2"
                  onClick={async () => {
                    const { channel, ...rest } = incomingReq
                    if (rest?.type !== 'add' && callAccepted.callId === incomingReq.callId && callAccepted.by && callAccepted.by !== client.userID) { 
                      setIncomingReq(null); 
                      return 
                    }
                    try { 
                      await channel.sendMessage({ 
                        text: 'Call accepted', 
                        callResponse: { ...rest, inviter: rest.inviter || rest.from, status: 'accepted', from: client.userID } 
                      }) 
                    } catch {}
                    if (rest?.type !== 'add') setCallAccepted({ callId: incomingReq.callId, by: client.userID })
                    setCallModal({ open: true, id: incomingReq.callId, mode: incomingReq.mode })
                    setCurrentCallChannel(channel); setCallRole('callee'); setIncomingReq(null)
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outgoing Call Modal */}
      {outgoingReq && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-base-100 border border-base-300 rounded-2xl shadow-xl max-w-sm w-full">
            <div className="p-6 text-center">
              <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
              <h3 className="font-bold text-xl mb-2">Calling...</h3>
              <p className="text-base-content/70 mb-6">Waiting for answer</p>
              <button 
                className="btn btn-ghost btn-sm"
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
        />
      )}
    </div>
  )
}
