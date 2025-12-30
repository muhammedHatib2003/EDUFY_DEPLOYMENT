import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'

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

  const load = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const http = api.authedApi(token)
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
      const token = await getToken()
      const http = api.authedApi(token)
      await http.post('/friends/request', { handle })
      setHandle('')
      await load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to send request')
    }
  }

  const respond = async (requestId, action) => {
    const token = await getToken()
    const http = api.authedApi(token)
    await http.post('/friends/respond', { requestId, action })
    await load()
  }

  const FriendCard = ({ user, requestId, type }) => {
    const profileLink = user.handle ? `/profiles/${user.handle.replace(/^@/, '')}` : null
    return (
      <div className="card card-side bg-base-100 shadow-sm border border-base-300 hover:shadow-md transition-shadow">
        <figure className="px-4 py-3">
          <div className="avatar placeholder">
            <div className="bg-neutral text-neutral-content rounded-full w-12">
              <span className="text-lg font-semibold">
                {user.handle?.charAt(1)?.toUpperCase() || 'U'}
              </span>
            </div>
          </div>
        </figure>
        <div className="card-body py-3 px-0 pr-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                {profileLink ? (
                  <Link to={profileLink} className="card-title text-base hover:text-primary transition-colors">
                    {user.handle}
                  </Link>
                ) : (
                  <h3 className="card-title text-base">{user.handle}</h3>
                )}
                {profileLink && (
                  <Link to={profileLink} className="btn btn-xs btn-ghost">
                    View
                  </Link>
                )}
              </div>
              <p className="text-sm text-base-content/70">
                {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                {user.role && ` - ${user.role}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {type === 'incoming' && (
                <div className="join join-vertical sm:join-horizontal">
                  <button
                    onClick={() => respond(requestId, 'accept')}
                    className="btn btn-sm btn-success join-item"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond(requestId, 'decline')}
                    className="btn btn-sm btn-ghost join-item"
                  >
                    Decline
                  </button>
                </div>
              )}
              {type === 'outgoing' && <div className="badge badge-warning badge-lg">Pending</div>}
              {type === 'friend' && <div className="badge badge-success badge-lg">Friends</div>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const EmptyState = ({ message }) => (
    <div className="text-center py-12 text-base-content/60">{message}</div>
  )

  const tabs = [
    { id: 'friends', label: 'Friends', count: friends.length, icon: '[F]' },
    { id: 'incoming', label: 'Incoming', count: incoming.length, icon: '[I]' },
    { id: 'outgoing', label: 'Outgoing', count: outgoing.length, icon: '[O]' },
  ]

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-24" />
        <div className="skeleton h-64" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Friends</h1>
        <p className="text-base-content/60">Connect and collaborate with others</p>
      </div>

      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body">
          <h2 className="card-title">Add Friend</h2>
          <form onSubmit={sendRequest} className="flex flex-col sm:flex-row gap-4">
            <div className="form-control flex-1">
              <input
                type="text"
                className="input input-bordered"
                placeholder="Enter handle (e.g. @john123)"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                required
              />
              {error && (
                <label className="label">
                  <span className="label-text-alt text-error">{error}</span>
                </label>
              )}
            </div>
            <button className="btn btn-primary sm:w-auto" type="submit">
              Send Request
            </button>
          </form>
        </div>
      </div>

      <div className="tabs tabs-boxed bg-base-200 p-1 w-fit mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab tab-lg ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
            {tab.count > 0 && <span className="badge badge-sm badge-neutral ml-2">{tab.count}</span>}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'friends' && (
          <div className="space-y-4">
            {friends.length > 0 ? (
              friends.map((friend) => <FriendCard key={friend._id} user={friend} type="friend" />)
            ) : (
              <EmptyState message="No friends yet. Send some requests!" />
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
              <EmptyState message="No incoming requests" />
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
              <EmptyState message="No outgoing requests" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
