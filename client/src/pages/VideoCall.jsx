import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { authedApi } from '../lib/api.js'
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  StreamTheme,
  SpeakerLayout,
  ScreenShareButton,
  ToggleAudioPublishingButton,
  ToggleVideoPublishingButton,
} from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { downloadSummaryPdf } from '../utils/downloadSummaryPdf'

const SUMMARY_STORAGE_KEY = 'graedufy_voice_summaries'
// HashRouter-safe external URL (path-based URLs 404 on Vercel without rewrites).
const DEFAULT_WEB_CALL_BASE = 'https://edufy-deployment.vercel.app/#/call/'

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
}

function getWebCallBase() {
  const envBase = import.meta?.env?.VITE_WEB_CALL_BASE
  if (envBase) return ensureTrailingSlash(String(envBase))

  // On normal web deployments, prefer the current origin.
  if (typeof window !== 'undefined') {
    const origin = window.location?.origin || ''
    if (/^https?:\/\//i.test(origin)) return `${origin}/#/call/`
  }

  return DEFAULT_WEB_CALL_BASE
}

// Web Speech API: only rely on Chrome / Edge for production usage.
function isChromeOrEdge() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isEdge = ua.includes('Edg/')
  const isChrome = ua.includes('Chrome/') && !isEdge
  return isEdge || isChrome
}

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
  const [leaving, setLeaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [selectedToAdd, setSelectedToAdd] = useState({})
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [summary, setSummary] = useState('')
  const [transcript, setTranscript] = useState('')
  const [summaryTopic, setSummaryTopic] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [processingSummary, setProcessingSummary] = useState(false)
  const recorderRef = useRef(null)
  const leavingRef = useRef(false)
  const hasLeftRef = useRef(false)
  const [audioDataUrl, setAudioDataUrl] = useState('')

  // -----------------------------
  // Speech recognition (Chrome/Edge)
  // -----------------------------
  // MUST NOT be recreated on re-render. We create it once and keep it in a ref.
  const recognitionRef = useRef(null)
  const speechStateRef = useRef({
    active: false,
    running: false,
    starting: false,
    manualStop: false,
    disabled: false,
    restartTimer: null,
  })
  const finalTranscriptRef = useRef('')
  const interimTranscriptRef = useRef('')
  const lastSessionKeyRef = useRef(null)

  const [speechSupported, setSpeechSupported] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const [speechLiveText, setSpeechLiveText] = useState('')
  // SpeechRecognition language:
  // - 'auto' follows the browser/user language
  // - explicit locale forces recognition to that language (Chrome's Speech API behavior)
  const [speechLang, setSpeechLang] = useState('tr-TR')

  const [micLevel, setMicLevel] = useState(0)
  const micMeterRef = useRef({ rafId: null, audioContext: null })
  const [expanded, setExpanded] = useState(false)
  const recordingTranscriptStartRef = useRef('')
  const recordingSessionKeyRef = useRef(null)
  const savedRecordingKeyRef = useRef(null)
  const callLabel = callNameProp || callIdProp || 'Active Call'
  const isElectron =
    typeof navigator !== 'undefined' &&
    (navigator.userAgent.toLowerCase().includes('electron') ||
      (typeof window !== 'undefined' &&
        (window?.desktop?.isElectron || window?.process?.type === 'renderer')))
  const isCapacitor =
    typeof window !== 'undefined' &&
    !!window?.Capacitor?.isNativePlatform?.()
  const shouldOpenExternally = isElectron || isCapacitor
  const externalUrl = useMemo(() => {
    const base = getWebCallBase()
    const callId = encodeURIComponent(callIdProp || 'graedufy-demo')
    const sp = new URLSearchParams()
    if (mode) sp.set('mode', mode)
    if (callNameProp) sp.set('name', callNameProp)
    const qs = sp.toString()
    return `${base}${callId}${qs ? `?${qs}` : ''}`
  }, [callIdProp, callNameProp, mode])
  const [externalOpened, setExternalOpened] = useState(false)

  // Call is considered active once StreamCall is created/joined.
  const callActive = Boolean(call) && !shouldOpenExternally

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
    if (shouldOpenExternally && !externalOpened) {
      try {
        window.open(externalUrl, '_blank', 'noopener,noreferrer')
        setExternalOpened(true)
        setError('Video calls open in browser for best performance.')
      } catch (err) {
        console.warn('Failed to open external call URL', err)
      }
    }
  }, [shouldOpenExternally, externalOpened, externalUrl])

  useEffect(() => {
    if (shouldOpenExternally) return undefined
    let mounted = true
    const init = async () => {
      try {
        const http = await authedApi(getToken)
        const { data } = await http.post('/stream/token/video')

        const c = new StreamVideoClient({
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
  }, [shouldOpenExternally])

  const stopRecordingTracks = () => {
    const rec = recorderRef.current
    if (rec?.stream) {
      rec.stream.getTracks().forEach((t) => t.stop())
    }
    recorderRef.current = null
  }

  // -----------------------------
  // Speech recognition helpers
  // -----------------------------
  const resetSpeechBuffers = () => {
    finalTranscriptRef.current = ''
    interimTranscriptRef.current = ''
    setTranscript('')
    setSpeechLiveText('')
  }

  const clearSpeechRestartTimer = () => {
    const state = speechStateRef.current
    if (state.restartTimer) {
      try { clearTimeout(state.restartTimer) } catch {}
      state.restartTimer = null
    }
  }

  const stopSpeech = () => {
    const recognition = recognitionRef.current
    const state = speechStateRef.current

    state.manualStop = true
    clearSpeechRestartTimer()

    if (!recognition) return
    if (!state.running && !state.starting) return

    try {
      recognition.stop()
    } catch {
      try { recognition.abort?.() } catch {}
    } finally {
      state.running = false
      state.starting = false
    }
  }

  const startSpeech = () => {
    const recognition = recognitionRef.current
    const state = speechStateRef.current

    if (!recognition) return
    if (state.disabled) return
    if (state.running || state.starting) return

    state.manualStop = false
    state.starting = true

    try {
      recognition.start()
    } catch {
      // InvalidStateError happens if start() is called too fast or while already running.
    } finally {
      // Release the "starting" lock shortly after calling start().
      setTimeout(() => {
        speechStateRef.current.starting = false
      }, 250)
    }
  }

  const stopMicMeter = () => {
    const meter = micMeterRef.current
    if (meter?.rafId) {
      try { cancelAnimationFrame(meter.rafId) } catch {}
    }
    meter.rafId = null
    if (meter?.audioContext) {
      try { meter.audioContext.close() } catch {}
    }
    meter.audioContext = null
    setMicLevel(0)
  }

  const startMicMeter = (stream) => {
    stopMicMeter()
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const audioContext = new AudioCtx()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)

      const data = new Uint8Array(analyser.fftSize)
      const tick = () => {
        try {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / data.length)
          // Non-linear scale for UI (more sensitive at low volumes)
          const level = Math.max(0, Math.min(1, rms * 3.5))
          setMicLevel(level)
        } catch {}
        micMeterRef.current.rafId = requestAnimationFrame(tick)
      }

      micMeterRef.current.audioContext = audioContext
      micMeterRef.current.rafId = requestAnimationFrame(tick)
    } catch {}
  }

  // Create SpeechRecognition once and keep it stable across renders.
  useEffect(() => {
    if (shouldOpenExternally) return undefined
    if (typeof window === 'undefined') return undefined

    // Chrome / Edge only (production-safe assumption).
    if (!isChromeOrEdge()) {
      setSpeechSupported(false)
      setSpeechError('Live transcription supports Chrome / Edge only.')
      return undefined
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false)
      setSpeechError('Speech recognition is not available in this browser.')
      return undefined
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = (navigator?.language || 'en-US').toLowerCase().startsWith('tr') ? 'tr-TR' : (navigator?.language || 'en-US')

    recognitionRef.current = recognition
    setSpeechSupported(true)
    setSpeechError('')

    const state = speechStateRef.current

    recognition.onstart = () => {
      state.running = true
      state.starting = false
      setSpeechError('')
    }

    recognition.onresult = (event) => {
      try {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text = (result?.[0]?.transcript || '').trim()
          if (!text) continue

          if (result.isFinal) {
            finalTranscriptRef.current = `${finalTranscriptRef.current}${text} `.replace(/\s+/g, ' ')
          } else {
            interim += `${text} `
          }
        }

        interimTranscriptRef.current = interim.trim()
        const finalText = finalTranscriptRef.current.trim()
        const combined = `${finalText} ${interimTranscriptRef.current}`.trim()

        if (finalText) setTranscript(finalText)
        setSpeechLiveText(combined)
      } catch (err) {
        console.warn('speech onresult error', err)
      }
    }

    recognition.onerror = (event) => {
      const code = String(event?.error || '').toLowerCase()

      // Permissions / capture issues: disable auto-restarts and surface a helpful message.
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        state.disabled = true
        state.manualStop = true
        setSpeechError('Speech recognition permission denied or microphone unavailable.')
        stopSpeech()
        return
      }

      // Other transient errors often recover on restart.
      // Examples: "no-speech", "aborted", "network"
      setSpeechError(code ? `Speech recognition error: ${code}` : 'Speech recognition error')
    }

    recognition.onend = () => {
      state.running = false
      state.starting = false

      // Auto-restart while active, unless manually stopped or disabled.
      if (!state.active || state.manualStop || state.disabled) return

      clearSpeechRestartTimer()
      state.restartTimer = setTimeout(() => {
        // Guard again at time of restart.
        const s = speechStateRef.current
        if (!s.active || s.manualStop || s.disabled) return
        startSpeech()
      }, 350)
    }

    const onVisibility = () => {
      const s = speechStateRef.current
      if (document.visibilityState === 'visible' && s.active && !s.disabled && !s.manualStop) {
        startSpeech()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stopSpeech()
      try {
        recognition.onstart = null
        recognition.onresult = null
        recognition.onerror = null
        recognition.onend = null
      } catch {}
      recognitionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpenExternally])

  // Update recognition language without recreating the instance.
  useEffect(() => {
    const recognition = recognitionRef.current
    if (!recognition) return

    const autoLang = (navigator?.language || 'en-US').toLowerCase().startsWith('tr') ? 'tr-TR' : (navigator?.language || 'en-US')
    const nextLang = speechLang === 'auto' ? autoLang : speechLang

    try {
      recognition.lang = nextLang
    } catch {}

    // Apply lang changes immediately if we're actively transcribing.
    const state = speechStateRef.current
    if (state.active && (state.running || state.starting) && !state.disabled) {
      state.manualStop = true
      stopSpeech()
      state.manualStop = false
      setTimeout(() => startSpeech(), 200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechLang])

  const safeLeave = async () => {
    if (!call) return
    if (hasLeftRef.current) return
    if (leavingRef.current) return

    leavingRef.current = true
    setLeaving(true)
    try {
      // Stop speech recognition before leaving the call to avoid auto-restart loops.
      speechStateRef.current.active = false
      stopSpeech()

      await call.leave()
      hasLeftRef.current = true
    } catch (err) {
      const message = String(err?.message || err || '')
      if (/already been left/i.test(message)) {
        hasLeftRef.current = true
      } else {
        console.error('call.leave failed', err)
      }
    } finally {
      leavingRef.current = false
      setLeaving(false)
    }
  }

  // Start speech recognition when the call is active; stop when it ends.
  useEffect(() => {
    const state = speechStateRef.current
    state.active = Boolean(callActive) && Boolean(speechSupported) && !state.disabled

    if (!speechSupported || state.disabled) return

    if (callActive) {
      // Reset buffers once per call session.
      const sessionKey = callIdProp || 'graedufy-demo'
      if (lastSessionKeyRef.current !== sessionKey) {
        resetSpeechBuffers()
        lastSessionKeyRef.current = sessionKey
      }
      startSpeech()
    } else {
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callActive, speechSupported, callIdProp])

  const startRecording = async () => {
    setSummaryError('')
    setSummary('')
    setAudioBlob(null)
    setAudioDataUrl('')
    recordingSessionKeyRef.current = `${Date.now()}`
    savedRecordingKeyRef.current = null
    recordingTranscriptStartRef.current = (finalTranscriptRef.current || transcript || '').trim()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
      startMicMeter(stream)
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
        stopMicMeter()
        stopRecordingTracks()
        setIsRecording(false)
      }
      recorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('record error', err)
      stopMicMeter()
      setSummaryError('Microphone access denied or unavailable.')
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    stopMicMeter()

    // Persist the transcript segment for this recording so it can be summarized on the Summaries page.
    setTimeout(() => {
      try { saveCurrentRecordingTranscript() } catch {}
    }, 400)
  }

  const getRecordingTranscriptText = () => {
    const start = (recordingTranscriptStartRef.current || '').trim()
    const currentFinal = (finalTranscriptRef.current || '').trim()
    const currentCombined = (speechLiveText || currentFinal).trim()

    if (!start) return currentCombined || currentFinal
    if (currentFinal && currentFinal.startsWith(start)) return currentFinal.slice(start.length).trim()
    if (currentCombined && currentCombined.startsWith(start)) return currentCombined.slice(start.length).trim()
    return currentCombined || currentFinal
  }

  const saveTranscriptToSummaries = (rawText, { preventDuplicatesKey } = {}) => {
    const transcriptText = String(rawText || '').trim()
    if (transcriptText.length < 20) return false

    if (preventDuplicatesKey && savedRecordingKeyRef.current === preventDuplicatesKey) return false
    if (preventDuplicatesKey) savedRecordingKeyRef.current = preventDuplicatesKey

    const entry = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      callId: callIdProp || 'graedufy-demo',
      callName: callLabel,
      topic: summaryTopic,
      summary: '',
      transcript: transcriptText,
      createdAt: Date.now(),
    }
    saveSummaryLocally(entry)
    setTranscript(transcriptText)
    return true
  }

  const saveCurrentRecordingTranscript = () => {
    const sessionKey = recordingSessionKeyRef.current
    const segment = getRecordingTranscriptText()
    return saveTranscriptToSummaries(segment, { preventDuplicatesKey: sessionKey || undefined })
  }

  const saveCurrentTranscript = () => {
    if (isRecording) return saveCurrentRecordingTranscript()
    const full = (finalTranscriptRef.current || transcript || speechLiveText || '').trim()
    return saveTranscriptToSummaries(full)
  }

  const summarizeFromTranscript = async (rawText) => {
    setProcessingSummary(true)
    setSummaryError('')
    try {
      const transcriptText = String(rawText || '').trim()
      let finalTranscript = ''
      let finalSummary = ''

      // Prefer free-ish path: browser speech-to-text + server summarization (OpenRouter fallbacks supported).
      if (transcriptText.length >= 20) {
        const http = await authedApi(getToken)
        const topicHint = summaryTopic ? `Topic hint: ${summaryTopic}\n` : ''

        // Some deployments still have /ai/voice-summary wired to Gemini-only audio transcription.
        // We attempt transcript-only summarization first; on "Gemini required" errors, fall back to /ai/chat.
        try {
          const { data } = await http.post('/ai/voice-summary', {
            transcript: transcriptText,
            topic: summaryTopic,
          })
          finalTranscript = data?.transcript || transcriptText
          finalSummary = data?.summary || ''
        } catch (e) {
          const serverMsg = String(e?.response?.data?.error || e?.message || '')
          const isGeminiRequired =
            /gemini/i.test(serverMsg) ||
            /gemini_api_key/i.test(serverMsg) ||
            /requires gemini/i.test(serverMsg)

          if (!isGeminiRequired) throw e

          const requestInput =
            `Summarize the following transcript in a student-friendly way.\n` +
            `Make it medium-length (about 8-12 sentences) so it's useful for studying.\n` +
            `No headings; return only the summary text.\n` +
            `Reply in the same language as the transcript.\n` +
            `${topicHint}` +
            `\nTranscript:\n${transcriptText}\n`
          const { data } = await http.post('/ai/chat', { input: requestInput })
          finalTranscript = transcriptText
          finalSummary = data?.reply || ''
        }

        if (!String(finalSummary || '').trim()) {
          setSummaryError('AI returned an empty summary. Please try again.')
          return
        }
      } else {
        setSummaryError('Transcript is empty. Use Chrome/Edge and allow microphone + speech recognition, then try again.')
        return
      }

      setTranscript(finalTranscript)
      setSummary(finalSummary)

      const entry = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
        callId: callIdProp || 'graedufy-demo',
        callName: callLabel,
        topic: summaryTopic,
        summary: finalSummary || '',
        transcript: finalTranscript || '',
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

  const summarizeCurrentRecording = async () => {
    const sessionKey = recordingSessionKeyRef.current
    if (!sessionKey) return
    if (savedRecordingKeyRef.current === sessionKey) return
    if (processingSummary) return

    const segment = getRecordingTranscriptText()
    if (String(segment || '').trim().length < 20) return

    savedRecordingKeyRef.current = sessionKey
    await summarizeFromTranscript(segment)
  }

  const summarizeAudio = async () => {
    const transcriptText = (finalTranscriptRef.current || transcript || speechLiveText || '').trim()
    await summarizeFromTranscript(transcriptText)
  }

  useEffect(() => {
    return () => {
      speechStateRef.current.active = false
      stopSpeech()
      stopMicMeter()
      stopRecordingTracks()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white">
      <div className="relative w-full h-full flex flex-col">
        {/* Error Alert */}
        {error && (
          <div className="absolute top-3 inset-x-3 z-50">
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

        <div className="flex-1 relative overflow-hidden pt-14 pb-28 sm:pb-32">
          {shouldOpenExternally ? (
            <div className="h-full grid place-items-center bg-gray-900 px-4 text-center space-y-4">
              <div className="text-xl font-semibold">Video calls open in browser for best performance.</div>
              <div className="text-white/70">We’ve opened the call in your default browser.</div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  className="btn btn-primary"
                  onClick={() => window.open(externalUrl, '_blank', 'noopener,noreferrer')}
                >
                  Open Call
                </button>
                <button className="btn" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          ) : client && call ? (
            <StreamVideo client={client}>
              <StreamCall call={call}>
                <StreamTheme>
                  <div className="absolute inset-0 bg-gray-900">
                    {/* Floating Header */}
                    <div className="absolute top-0 left-0 right-0 z-20 px-3 py-2 flex items-center justify-between bg-black/70 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                        <div className="leading-tight">
                          <div className="text-sm font-semibold">{mode === 'voice' ? 'Voice Call' : 'Video Call'}</div>
                          <div className="text-xs text-white/60">{callLabel}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpanded((s) => !s)}
                          className="btn btn-ghost btn-xs text-white"
                          title={expanded ? 'Collapse call window' : 'Expand call window'}
                        >
                          {expanded ? 'Compact' : 'Expand'}
                        </button>
                        <button
                          onClick={async () => { await safeLeave(); onClose() }}
                          className="btn btn-error btn-xs"
                          title="End call"
                          disabled={leaving}
                        >
                          End
                        </button>
                      </div>
                    </div>

                    <div className="h-full flex flex-col relative pt-12 pb-28 sm:pb-32">
                      <div className="flex-1 relative">
                        <SpeakerLayout />
                      </div>

                      <div className="fixed bottom-0 left-0 right-0 z-30 bg-black/80 border-t border-white/10 p-3 sm:p-4">
                        <div className="max-w-4xl mx-auto space-y-3">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <ToggleAudioPublishingButton />
                            {mode !== 'voice' && <ToggleVideoPublishingButton />}
                            {(!screenShareOnlyForTeacher || isTeacher) && <ScreenShareButton />}
                            <button
                              className="btn btn-error btn-sm"
                              disabled={leaving}
                              onClick={async () => { await safeLeave(); onClose() }}
                              title="End call"
                            >
                              End
                            </button>
                          </div>

                          {isRecording && (
                            <div className="flex items-center gap-2 text-xs text-white/70">
                              <div className="w-28 h-2 rounded bg-white/10 overflow-hidden">
                                <div
                                  className={`h-full ${micLevel < 0.12 ? 'bg-warning' : 'bg-success'}`}
                                  style={{ width: `${Math.round(micLevel * 100)}%` }}
                                />
                              </div>
                              <div className="min-w-[180px]">
                                {micLevel < 0.12 ? 'Mic level low — speak closer / louder.' : 'Mic level OK'}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            {channel && (
                              <button
                                className="btn btn-outline btn-sm text-white border-white/30"
                                onClick={() => setAddOpen(true)}
                                title="Add people to call"
                              >
                                Add People
                              </button>
                            )}
                            {speechSupported && (
                              <select
                                className="select select-xs select-bordered bg-white/10 text-white border-white/20"
                                value={speechLang}
                                onChange={(e) => setSpeechLang(e.target.value)}
                                title="Transcription language"
                              >
                                <option value="auto">Auto</option>
                                <option value="tr-TR">Turkish (tr-TR)</option>
                                <option value="en-US">English (en-US)</option>
                              </select>
                            )}
                            <input
                              type="text"
                              className="input input-xs input-bordered bg-white/10 text-white placeholder:text-white/60 flex-1 min-w-[160px]"
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
                              disabled={
                                (isRecording
                                  ? getRecordingTranscriptText().trim().length < 20
                                  : (speechLiveText || transcript || finalTranscriptRef.current || '').trim().length < 20)
                              }
                              onClick={saveCurrentTranscript}
                            >
                              Save transcript
                            </button>
                          </div>
                        </div>
                      </div>

                      {mode === 'voice' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="flex flex-col items-center gap-3 bg-black/50 px-4 py-3 rounded-xl">
                            <div className="w-16 h-16 rounded-full bg-primary/30 border border-primary/60" />
                            <div className="text-sm text-white/80">Voice call in progress</div>
                          </div>
                        </div>
                      )}

                      {(isRecording || audioBlob || summary || transcript || summaryError || speechError) && (
                        <div className="absolute bottom-4 right-4 w-full max-w-md bg-black/80 border border-white/10 rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-white text-sm">Live class summary</div>
                            <div className="text-xs text-white/60">
                              {isRecording ? 'Recording...' : processingSummary ? 'Processing...' : audioBlob ? 'Ready to send' : ''}
                            </div>
                          </div>
                          {speechError && <div className="text-warning text-sm">{speechError}</div>}
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
                            <div className="text-xs text-white/60">Audio captured. Tap "Send summary" below.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </StreamTheme>
              </StreamCall>
            </StreamVideo>
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
