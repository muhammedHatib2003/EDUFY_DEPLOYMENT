import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link, useNavigate } from 'react-router-dom'
import { authedApi } from '../lib/api.js'
import { UserPlus, UserCheck, UserX, Users, ChevronRight, Search, User, Check, X, Clock, Mail } from 'lucide-react'

export default function Friends() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [handle, setHandle] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('friends')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const http = await authedApi(getToken)
      const me = await http.get('/users/me')
      if (!me.data.user.onboarded) {
        navigate('/onboarding')
        return
      }
      const [friendsRes, pendingRes] = await Promise.all([
        http.get('/friends/list'),
        http.get('/friends/pending'),
      ])
      setFriends(friendsRes.data.friends || [])
      setIncoming(pendingRes.data.incoming || [])
      setOutgoing(pendingRes.data.outgoing || [])
    } catch (err) {
      console.error('Failed to load friends:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const sendRequest = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const http = await authedApi(getToken)
      await http.post('/friends/request', { handle })
      setHandle('')
      await load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to send request')
    }
  }

  const respond = async (requestId, action) => {
    const http = await authedApi(getToken)
    await http.post('/friends/respond', { requestId, action })
    await load()
  }

  // Filter friends based on search query
  const filteredFriends = friends.filter(friend => 
    friend.handle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const FriendCard = ({ user, requestId, type }) => {
    const profileLink = user.handle ? `/profiles/${user.handle.replace(/^@/, '')}` : null
    const avatarLetter = (user.handle || 'U').replace(/^@/, '').charAt(0).toUpperCase() || 'U'
    const goProfile = () => {
      if (profileLink) navigate(profileLink)
    }
    const stop = (e) => e.stopPropagation()
    return (
      <div
        role={profileLink ? 'button' : 'group'}
        tabIndex={profileLink ? 0 : -1}
        onClick={goProfile}
        onKeyDown={(e) => {
          if (profileLink && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            goProfile()
          }
        }}
        className="card card-side bg-base-100 dark:bg-base-200 shadow-sm hover:shadow-md transition duration-200 overflow-hidden cursor-pointer"
      >
        <div className="p-4 w-full">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative">
              {user.avatarUrl ? (
                <div className="avatar">
                  <div className="w-14 h-14 rounded-full ring ring-primary/40 ring-offset-base-100 overflow-hidden">
                    <img src={user.avatarUrl} alt={user.handle || 'User'} className="object-cover w-full h-full" />
                  </div>
                </div>
              ) : (
                <div className="avatar">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-xl">
                    {avatarLetter}
                  </div>
                </div>
              )}
              {type === 'friend' && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-success rounded-full flex items-center justify-center">
                  <UserCheck size={12} className="text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-base-content truncate">
                  {user.handle || 'Unknown'}
                </h3>
                {type === 'outgoing' && (
                  <span className="badge badge-warning badge-sm gap-1">
                    <Clock size={12} />
                    Pending
                  </span>
                )}
              </div>
              <p className="text-sm text-base-content/70 truncate">
                {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'No name provided'}
              </p>
              {user.role && (
                <span className="badge badge-neutral mt-1">
                  {user.role}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col items-end gap-2">
              {profileLink && (
                <Link
                  to={profileLink}
                  onClick={stop}
                  className="btn btn-sm btn-ghost text-primary gap-1"
                >
                  View
                  <ChevronRight size={16} />
                </Link>
              )}

              {type === 'incoming' && (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      stop(e)
                      respond(requestId, 'accept')
                    }}
                    className="btn btn-sm btn-success btn-circle"
                    title="Accept"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      stop(e)
                      respond(requestId, 'decline')
                    }}
                    className="btn btn-sm btn-error btn-circle"
                    title="Decline"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const EmptyState = ({ message, icon: Icon = Users }) => (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-base-200 dark:bg-base-300 mb-4">
        <Icon className="text-base-content/50" size={32} />
      </div>
      <p className="text-base-content/70">{message}</p>
    </div>
  )

  const tabs = [
    { 
      id: 'friends', 
      label: 'Friends', 
      count: friends.length, 
      icon: Users,
    },
    { 
      id: 'incoming', 
      label: 'Requests', 
      count: incoming.length, 
      icon: Mail,
    },
    { 
      id: 'outgoing', 
      label: 'Sent', 
      count: outgoing.length, 
      icon: UserPlus,
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="loading loading-spinner loading-lg text-primary"></div>
          <p className="text-base-content/70">Loading friends...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-100 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-base-content">Friends</h1>
          <p className="mt-2 text-base-content/70">Connect and collaborate with others</p>
        </div>

        {/* Add Friend Card */}
        <div className="card bg-base-100 dark:bg-base-200 shadow-sm border border-base-300 dark:border-base-300 mb-8">
          <div className="card-body p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <UserPlus className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-base-content">Add Friend</h2>
                <p className="text-sm text-base-content/70">Send a friend request using their username</p>
              </div>
            </div>

            <form onSubmit={sendRequest} className="space-y-4">
              <div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-base-content/50" size={20} />
                  <input
                    type="text"
                    className="input input-bordered w-full pl-12"
                    placeholder="@username"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <p className="mt-2 text-sm text-error">{error}</p>
                )}
              </div>
              <button 
                className="btn btn-primary w-full sm:w-auto gap-2"
                type="submit"
              >
                <UserPlus size={18} />
                Send Friend Request
              </button>
            </form>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="tabs tabs-boxed bg-base-200 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  className={`tab tab-lg flex items-center gap-2 ${
                    isActive ? 'tab-active' : ''
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={20} />
                  <span className="font-medium">{tab.label}</span>
                  {tab.count > 0 && (
                    <span className="badge badge-sm ml-1">
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Search for friends tab */}
        {activeTab === 'friends' && friends.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-base-content/50" size={20} />
              <input
                type="text"
                className="input input-bordered w-full pl-12"
                placeholder="Search friends by name or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="min-h-[400px]">
          {activeTab === 'friends' && (
            <div className="space-y-4">
              {filteredFriends.length > 0 ? (
                filteredFriends.map((friend) => (
                  <FriendCard key={friend._id} user={friend} type="friend" />
                ))
              ) : searchQuery ? (
                <EmptyState message={`No friends found matching "${searchQuery}"`} icon={Search} />
              ) : (
                <EmptyState message="No friends yet. Send some requests!" icon={Users} />
              )}
            </div>
          )}

          {activeTab === 'incoming' && (
            <div className="space-y-4">
              {incoming.length > 0 ? (
                incoming.map((request) => (
                  <FriendCard key={request._id} user={request.from} requestId={request._id} type="incoming" />
                ))
              ) : (
                <EmptyState message="No incoming friend requests" icon={Mail} />
              )}
            </div>
          )}

          {activeTab === 'outgoing' && (
            <div className="space-y-4">
              {outgoing.length > 0 ? (
                outgoing.map((request) => (
                  <FriendCard key={request._id} user={request.to} requestId={request._id} type="outgoing" />
                ))
              ) : (
                <EmptyState message="No sent friend requests" icon={UserPlus} />
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-8 pt-6 border-t border-base-300">
          <div className="stats shadow w-full">
            <div className="stat">
              <div className="stat-figure text-primary">
                <Users className="inline-block w-8 h-8" />
              </div>
              <div className="stat-title">Friends</div>
              <div className="stat-value text-primary">{friends.length}</div>
            </div>
            
            <div className="stat">
              <div className="stat-figure text-info">
                <Mail className="inline-block w-8 h-8" />
              </div>
              <div className="stat-title">Requests</div>
              <div className="stat-value text-info">{incoming.length}</div>
            </div>
            
            <div className="stat">
              <div className="stat-figure text-warning">
                <UserPlus className="inline-block w-8 h-8" />
              </div>
              <div className="stat-title">Sent</div>
              <div className="stat-value text-warning">{outgoing.length}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
