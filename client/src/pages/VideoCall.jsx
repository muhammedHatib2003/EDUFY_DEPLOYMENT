import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import api from '../lib/api'
import * as VideoSDK from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { AiService } from '../services/ai'
import { downloadSummaryPdf } from '../utils/downloadSummaryPdf'

const SUMMARY_STORAGE_KEY = 'graedufy_voice_summaries'

function saveSummaryLocally(entry) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(SUMMARY_STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    const next = Array.isArray(list) ? list : []
    next.unshift(entry)
    window.localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(next.slice(0, 50)))
  } catch (err) {
    console.error('Failed to store summary', err)
  }
}

export default function VideoCall({ onClose, callId: callIdProp, callName: callNameProp, mode = 'video', channel, friends = [], onOpen, isTeacher = false, screenShareOnlyForTeacher = false }) {
  const { getToken } = useAuth()
  const [client, setClient] = useState(null)
  const [call, setCall] = useState(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [selectedToAdd, setSelectedToAdd] = useState({})
  const [isAudioMuted, setIsAudioMuted] = useState(false)
  const [isVideoMuted, setIsVideoMuted] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [summary, setSummary] = useState('')
  const [transcript, setTranscript] = useState('')
  const [summaryTopic, setSummaryTopic] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [processingSummary, setProcessingSummary] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const recorderRef = useRef(null)
  const [audioDataUrl, setAudioDataUrl] = useState('')
  const [expanded, setExpanded] = useState(false)
  const callLabel = callNameProp || callIdProp || 'Active Call'
  const canShareScreen = mode !== 'voice' && (!screenShareOnlyForTeacher || isTeacher)

  const channelMemberIds = useMemo(() => {
    try {
      const mem = channel?.state?.members || {}
      const ids = Object.keys(mem)
      if (ids.length > 0) return ids
      const vals = Object.values(mem || {})
      return vals.map((m) => m?.user?.id || m?.user_id).filter(Boolean)
    } catch {
      return []
    }
  }, [channel?.id, channel?.cid, channel?.state?.members])

  const friendOptions = useMemo(() => {
    const me = channel?.getClient?.()?.userID
    const set = new Set(channelMemberIds)
    return (friends || [])
      .filter((f) => !!f?.handle)
      .filter((f) => f.handle !== me)
      .filter((f) => !set.has(f.handle))
  }, [friends, channelMemberIds, channel?.id])

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        const token = await getToken()
        const http = api.authedApi(token)
        const { data } = await http.post('/stream/token/video')

        const c = new VideoSDK.StreamVideoClient({
          apiKey: data.apiKey,
          user: { id: data.userId },
          token: data.token
        })

        if (!mounted) return
        setClient(c)

        const id = callIdProp || 'graedufy-demo'
        const newCall = c.call('default', id)
        await newCall.join({ create: true })

        if (mode === 'voice') {
          try { await newCall.camera?.disable?.() } catch (_) {}
          try { await newCall.microphone?.enable?.() } catch (_) {}
        }

        if (!mounted) return
        try { onOpen && (await onOpen()) } catch {}
        setCall(newCall)
      } catch (e) {
        console.error('Video init error', e)
        const msg = e?.response?.data?.error || e?.message || 'Failed to init video call'
        const details = e?.response?.data?.details
        setError(details ? `${msg}: ${details}` : msg)
      }
    }

    init()
    return () => {
      mounted = false
      client?.disconnectUser?.()
    }
  }, [])

  // Custom control handlers
  const toggleAudio = async () => {
    try {
      if (call) {
        if (isAudioMuted) {
          await call.microphone.enable()
        } else {
          await call.microphone.disable()
        }
        setIsAudioMuted(!isAudioMuted)
      }
    } catch (error) {
      console.error('Failed to toggle audio:', error)
    }
  }

  const toggleVideo = async () => {
    try {
      if (call && mode !== 'voice') {
        if (isVideoMuted) {
          await call.camera.enable()
        } else {
          await call.camera.disable()
        }
        setIsVideoMuted(!isVideoMuted)
      }
    } catch (error) {
      console.error('Failed to toggle video:', error)
    }
  }

  const toggleScreenShare = async () => {
    if (!call || !canShareScreen) return
    try {
      const sharing = call.screenShare?.state?.status === 'enabled'
      if (sharing) {
        await call.screenShare.disable(true)
      } else {
        await call.screenShare.enable()
      }
    } catch (error) {
      console.error('Failed to toggle screen share:', error)
      setError('Unable to toggle screen share. Please check permissions and try again.')
    }
  }

  const stopRecordingTracks = () => {
    const rec = recorderRef.current
    if (rec?.stream) {
      rec.stream.getTracks().forEach((t) => t.stop())
    }
    recorderRef.current = null
  }

  const startRecording = async () => {
    setSummaryError('')
    setSummary('')
    setTranscript('')
    setAudioBlob(null)
    setAudioDataUrl('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 }
      const recorder = new MediaRecorder(stream, options)
      const chunks = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setAudioBlob(blob)
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result
          if (typeof result === 'string') {
            setAudioDataUrl(result)
            try {
              const key = `live-audio-${callIdProp || 'default'}`
              window.localStorage.setItem(key, result)
            } catch {}
          }
        }
        reader.readAsDataURL(blob)
        stopRecordingTracks()
        setIsRecording(false)
      }
      recorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('record error', err)
      setSummaryError('Microphone access denied or unavailable.')
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  const summarizeAudio = async () => {
    if (!audioBlob || !audioDataUrl) {
      setSummaryError('Record audio first.')
      return
    }
    const approxBytes = Math.ceil((audioDataUrl.length * 3) / 4)
    if (approxBytes > 12 * 1024 * 1024) {
      setSummaryError('Recording is too large. Please record a shorter clip (under ~12MB).')
      return
    }
    setProcessingSummary(true)
    setSummaryError('')
    try {
      const token = await getToken()
      const { data } = await AiService.voiceSummary(token, {
        dataUrl: audioDataUrl,
        topic: summaryTopic,
      })
      setTranscript(data.transcript || '')
      setSummary(data.summary || '')
      const entry = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
        callId: callIdProp || 'graedufy-demo',
        callName: callLabel,
        topic: summaryTopic,
        summary: data.summary || '',
        transcript: data.transcript || '',
        createdAt: Date.now(),
      }
      saveSummaryLocally(entry)
    } catch (err) {
      console.error('summary error', err)
      setSummaryError(err?.response?.data?.error || err.message || 'Failed to summarize audio')
    } finally {
      setProcessingSummary(false)
    }
  }

  useEffect(() => {
    return () => stopRecordingTracks()
  }, [])

  useEffect(() => {
    if (!call?.screenShare?.state) return
    setIsScreenSharing(call.screenShare.state.status === 'enabled')
    const sub = call.screenShare.state.status$?.subscribe((status) => {
      setIsScreenSharing(status === 'enabled')
    })
    return () => {
      try { sub?.unsubscribe?.() } catch {}
    }
  }, [call])

  return (
    <div className={`fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[9999] ${expanded ? 'p-2 sm:p-4' : 'p-4'}`}>
      <div className={`relative w-full ${expanded ? 'max-w-none h-[95vh]' : 'max-w-7xl h-[90vh]'} rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-gradient-to-br from-gray-900 to-black flex flex-col`}>
        
        {/* Error Alert */}
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full">
            <div className="alert alert-error shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="flex-1">{error}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setError('')}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 relative overflow-hidden">
          {client && call ? (
            <VideoSDK.StreamVideo client={client}>
              <VideoSDK.StreamCall call={call}>
                <div className="absolute inset-0 bg-gray-900">
                  {/* Enhanced Header */}
                  <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black/80 to-black/60 backdrop-blur-md border-b border-white/10 z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      <h2 className="font-bold text-white text-lg">
                        {mode === 'voice' ? 'Voice Call' : 'Video Call'}
                      </h2>
                      <div className="text-sm text-white/60">
                        {callLabel}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setExpanded((s) => !s)}
                        className="btn btn-ghost btn-sm text-white hover:bg-white/20 gap-2"
                        title={expanded ? 'Collapse call window' : 'Expand call window'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {expanded ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h8M4 16h8m-6 4l-6-6 6-6m10 12l6-6-6-6" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9h6M4 15h6m5-9h5v5m0 4v5h-5m-4 0H6v-5m0-4V5h5" />
                          )}
                        </svg>
                        {expanded ? 'Collapse' : 'Expand'}
                      </button>

                      {/* Quick Controls */}
                      <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2">
                        {/* Audio Toggle */}
                        <button
                          onClick={toggleAudio}
                          className={`btn btn-sm gap-2 ${
                            isAudioMuted 
                              ? 'btn-error text-white' 
                              : 'btn-ghost text-white hover:bg-white/20'
                          }`}
                          title={isAudioMuted ? 'Unmute' : 'Mute'}
                        >
                          {isAudioMuted ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6a7.975 7.975 0 014.242 1.226l-4.242 4.243V6zM5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                          )}
                        </button>

                        {/* Video Toggle - Only show for video calls */}
                        {mode !== 'voice' && (
                          <button
                            onClick={toggleVideo}
                            className={`btn btn-sm gap-2 ${
                              isVideoMuted 
                                ? 'btn-error text-white' 
                                : 'btn-ghost text-white hover:bg-white/20'
                            }`}
                            title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
                          >
                            {isVideoMuted ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        )}

                        {/* Screen Share */}
                        {canShareScreen && (
                          <button
                            onClick={toggleScreenShare}
                            className={`btn btn-sm gap-2 ${isScreenSharing ? 'btn-primary text-white' : 'btn-ghost text-white hover:bg-white/20'}`}
                            title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
                            aria-pressed={isScreenSharing}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {isScreenSharing ? 'Sharing' : 'Share'}
                          </button>
                        )}

                        {/* Participants */}
                        <button
                          className="btn btn-ghost btn-sm text-white hover:bg-white/20 gap-2"
                          title="View participants"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </button>
                      </div>

                      {/* Live class summary */}
                      <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2">
                        <input
                          type="text"
                          className="input input-xs input-bordered bg-white/10 text-white placeholder:text-white/60"
                          placeholder="Topic (optional)"
                          value={summaryTopic}
                          onChange={(e) => setSummaryTopic(e.target.value)}
                        />
                        {!isRecording ? (
                          <button className="btn btn-xs btn-primary" onClick={startRecording}>Record</button>
                        ) : (
                          <button className="btn btn-xs btn-secondary" onClick={stopRecording}>Stop</button>
                        )}
                        <button
                          className="btn btn-xs btn-accent"
                          disabled={processingSummary || isRecording || !audioBlob}
                          onClick={summarizeAudio}
                        >
                          {processingSummary ? 'Working...' : 'Send summary'}
                        </button>
                      </div>

                      {channel && (
                        <button
                          className="btn btn-outline btn-sm text-white border-white/30 hover:bg-white/20 hover:border-white/50 gap-2"
                          onClick={() => setAddOpen(true)}
                          title="Add people to call"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add People
                        </button>
                      )}
                      
                      <button
                        onClick={async () => { try { await call?.leave?.() } catch {} onClose() }}
                        className="btn btn-error btn-sm gap-2 font-semibold"
                        title="End call"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        End Call
                      </button>
                    </div>
                  </div>

                  {/* Call Content */}
                  {VideoSDK.CallContent ? (
                    <VideoSDK.CallContent />
                  ) : (
                    <div className="h-full flex flex-col pt-16 pb-24 relative">
                      {VideoSDK.SpeakerLayout ? (
                        <VideoSDK.SpeakerLayout />
                      ) : (
                        <div className="flex-1 grid place-items-center">
                          <div className="text-center">
                            <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
                            <div className="text-white/70">Connected to call...</div>
                          </div>
                        </div>
                      )}

                      {/* Enhanced Call Controls */}
                      {VideoSDK.CallControls && (
                        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
                          <div className="bg-black/60 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                            <div className="flex items-center gap-4">
                              {/* Custom Audio Control */}
                              <button
                                onClick={toggleAudio}
                                className={`btn btn-circle btn-lg ${
                                  isAudioMuted 
                                    ? 'btn-error text-white' 
                                    : 'btn-ghost text-white hover:bg-white/20'
                                }`}
                                title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
                              >
                                {isAudioMuted ? (
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                  </svg>
                                ) : (
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6a7.975 7.975 0 014.242 1.226l-4.242 4.243V6zM5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                  </svg>
                                )}
                              </button>

                              {/* Custom Video Control */}
                              {mode !== 'voice' && (
                                <button
                                  onClick={toggleVideo}
                                  className={`btn btn-circle btn-lg ${
                                    isVideoMuted 
                                      ? 'btn-error text-white' 
                                      : 'btn-ghost text-white hover:bg-white/20'
                                  }`}
                                  title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
                                >
                                  {isVideoMuted ? (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                    </svg>
                                  ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </button>
                              )}

                              {/* Screen Share Control */}
                              {canShareScreen && (
                                <button
                                  onClick={toggleScreenShare}
                                  className={`btn btn-circle btn-lg ${isScreenSharing ? 'btn-primary text-white' : 'btn-ghost text-white hover:bg-white/20'}`}
                                  title={isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
                                  aria-pressed={isScreenSharing}
                                >
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                </button>
                              )}

                              {/* End Call Button */}
                              <button
                                onClick={async () => { try { await call?.leave?.() } catch {} onClose() }}
                                className="btn btn-circle btn-lg btn-error text-white"
                                title="End call"
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {(isRecording || audioBlob || summary || transcript || summaryError) && (
                        <div className="absolute bottom-4 right-4 w-full max-w-md bg-black/70 border border-white/10 rounded-xl p-4 backdrop-blur-md space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-white text-sm">Live class summary</div>
                            <div className="text-xs text-white/60">
                              {isRecording ? 'Recording...' : processingSummary ? 'Processing...' : audioBlob ? 'Ready to send' : ''}
                            </div>
                          </div>
                          {summaryError && <div className="text-error text-sm">{summaryError}</div>}
                          {transcript && (
                            <div className="text-xs text-white/70 max-h-16 overflow-auto border border-white/10 rounded p-2">
                              Transcript: {transcript.slice(0, 400)}{transcript.length > 400 ? '...' : ''}
                            </div>
                          )}
                          {summary && (
                            <div className="text-sm text-white whitespace-pre-wrap border border-white/10 rounded p-2 bg-white/5 space-y-2">
                              <div>{summary}</div>
                              <div className="flex justify-end">
                                <button
                                  className="btn btn-xs btn-outline"
                                  onClick={() => downloadSummaryPdf({
                                    summary,
                                    transcript,
                                    topic: summaryTopic,
                                    callId: callLabel,
                                    createdAt: Date.now(),
                                  })}
                                >
                                  Download PDF
                                </button>
                              </div>
                            </div>
                          )}
                          {!summary && !summaryError && audioBlob && !processingSummary && (
                            <div className="text-xs text-white/60">Audio captured. Click "Send summary" in the header.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </VideoSDK.StreamCall>
            </VideoSDK.StreamVideo>
          ) : (
            <div className="h-full grid place-items-center bg-gray-900">
              <div className="text-center">
                <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
                <div className="text-white font-medium">Initializing your {mode} call...</div>
                <div className="text-white/60 text-sm mt-2">Please wait a moment</div>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Add People Modal */}
        {addOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-base-100 border border-base-300 rounded-2xl shadow-2xl w-full max-w-md">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Add People to Call</h3>
                    <p className="text-sm text-base-content/70">Invite friends to join this call</p>
                  </div>
                </div>

                <div className="max-h-64 overflow-auto border border-base-300 rounded-lg mb-4">
                  {friendOptions.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="text-base-content/60 mb-2">No available friends to add</div>
                      <div className="text-xs text-base-content/40">All friends are already in this call</div>
                    </div>
                  ) : (
                    <ul className="divide-y divide-base-300">
                      {friendOptions.map((f) => (
                        <li key={f.handle} className="flex items-center gap-3 p-3 hover:bg-base-200 transition-colors">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-primary checkbox-sm"
                            checked={!!selectedToAdd[f.handle]}
                            onChange={() => setSelectedToAdd((s) => ({ ...s, [f.handle]: !s[f.handle] }))}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-base-content truncate">{f.handle}</div>
                            <div className="text-xs text-base-content/60 truncate">
                              {[f.firstName, f.lastName].filter(Boolean).join(' ') || 'No name'}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex justify-end gap-3">
                  <button 
                    className="btn btn-ghost btn-sm gap-2"
                    onClick={() => { setAddOpen(false); setSelectedToAdd({}) }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>
                  <button
                    className={`btn btn-primary btn-sm gap-2 ${adding ? 'loading' : ''}`}
                    disabled={adding || Object.keys(selectedToAdd).filter(h => selectedToAdd[h]).length === 0}
                    onClick={async () => {
                      const chosen = Object.keys(selectedToAdd).filter((h) => selectedToAdd[h])
                      if (chosen.length === 0) { setAddOpen(false); return }
                      setAdding(true)
                      try {
                        // add to channel if missing
                        const missing = chosen.filter((h) => !channelMemberIds.includes(h))
                        if (missing.length > 0) {
                          try { await channel?.addMembers?.(missing) } catch {}
                        }
                        const from = channel?.getClient?.()?.userID
                        const invite = { 
                          callId: callIdProp || 'graedufy-demo', 
                          mode, 
                          type: 'add', 
                          to: chosen, 
                          from, 
                          inviter: from, 
                          ts: Date.now() 
                        }
                        await channel?.sendMessage?.({ text: 'Call invite', callInvite: invite })
                        setAddOpen(false)
                        setSelectedToAdd({})
                      } catch (e) {
                        console.error('Failed to add people', e)
                      } finally {
                        setAdding(false)
                      }
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {adding ? 'Sending...' : 'Send Invites'}
                  </button>
                </div>
              </div>
            </div>
            <div 
              className="absolute inset-0 -z-10" 
              onClick={() => { setAddOpen(false); setSelectedToAdd({}) }}
            ></div>
          </div>
        )}
      </div>
    </div>
  )
}
