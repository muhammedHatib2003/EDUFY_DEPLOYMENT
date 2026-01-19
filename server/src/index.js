import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import mongoose from 'mongoose'
import * as Clerk from '@clerk/express'

import usersRouter, { publicUsersRouter } from './routes/users.js'
import friendsRouter from './routes/friends.js'
import streamRouter from './routes/stream.js'
import feedRouter, { publicFeedRouter } from './routes/feed.js'
import classroomsRouter from './routes/classrooms.js'
import notificationsRouter from './routes/notifications.js'
import aiRouter from './routes/ai.routes.js'
import questionsRouter from './routes/questions.js'
import coursesRouter from './routes/courses.js'
import scheduleRouter from './routes/schedule.js'


const app = express()

// Config
const PORT = process.env.PORT || 5001
const MONGODB_URI = process.env.MONGODB_URI
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

// Middleware
function parseOriginList(value) {
  if (!value || typeof value !== 'string') return []
  return value
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\/+$/, ''))
}

function buildVercelPreviewRegex(origin) {
  try {
    const url = new URL(origin)
    if (!url.hostname.endsWith('.vercel.app')) return null
    const base = url.hostname.replace(/\.vercel\.app$/, '')
    // Allow production + preview deployments: <base>.vercel.app or <base>-<suffix>.vercel.app
    return new RegExp(`^https?:\\\\/\\\\/${base}(-[a-z0-9-]+)?\\\\.vercel\\\\.app$`, 'i')
  } catch {
    return null
  }
}

// Allowed origins (env + sensible defaults)
const allowedOrigins = new Set([
  ...parseOriginList(CORS_ORIGIN),
  'https://edufy-deployment.vercel.app',
  'http://localhost:5173',

  // Capacitor / Mobile
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
])

const allowAllOrigins = allowedOrigins.has('*')
const vercelPreviewRegexes = [...allowedOrigins]
  .map(buildVercelPreviewRegex)
  .filter(Boolean)

const corsOptions = {
  origin: (origin, callback) => {
    // Mobile & server-to-server requests
    if (!origin) return callback(null, true)

    const normalized = String(origin).replace(/\/+$/, '')
    if (allowAllOrigins) return callback(null, true)
    if (allowedOrigins.has(normalized)) return callback(null, true)
    if (vercelPreviewRegexes.some((re) => re.test(normalized))) return callback(null, true)

    console.log('Blocked by CORS:', normalized)
    return callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-clerk-auth',
    'x-clerk-session',
  ],
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))


app.use(express.json({ limit: '20mb' }))
app.use(morgan('dev'))
// Attach Clerk middleware (supporting multiple versions)
const clerkMiddleware = Clerk.clerkMiddleware || Clerk.ClerkExpressWithAuth
if (!clerkMiddleware) {
  console.warn('Clerk middleware not found. Ensure @clerk/express is installed and up to date.')
} else {
  app.use(clerkMiddleware())
}

if (publicUsersRouter) {
  app.use('/api/public/users', publicUsersRouter)
}
if (publicFeedRouter) {
  app.use('/api/public/feed', publicFeedRouter)
}

// Health
app.get('/health', (req, res) => {
  const ready = mongoose.connection.readyState === 1
  res.json({
    ok: true,
    ready,
    dbState: mongoose.connection.readyState, // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    uptime: process.uptime(),
  })
})

// Readiness (useful for deploy health checks)
app.get('/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1
  if (!ready) return res.status(503).json({ ok: false, ready: false })
  return res.json({ ok: true, ready: true })
})

// If DB is down, fail fast instead of buffering Mongoose operations.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next()
  if (mongoose.connection.readyState === 1) return next()
  return res.status(503).json({ error: 'Database not ready' })
})
// Routes (protected)
const requireAuthMw = Clerk.requireAuth ? Clerk.requireAuth() : (Clerk.ClerkExpressRequireAuth ? Clerk.ClerkExpressRequireAuth() : null)
if (!requireAuthMw) {
  console.warn('Clerk requireAuth middleware not found. Routes will not be protected.')
  app.use('/api/users', usersRouter)
  app.use('/api/friends', friendsRouter)
  app.use('/api/stream', streamRouter)
  app.use('/api/feed', feedRouter)
  app.use('/api/questions', questionsRouter)
  app.use('/api/classrooms', classroomsRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/ai', aiRouter)
  app.use('/api/courses', coursesRouter)
  app.use('/api/schedule', scheduleRouter)
} else {
  app.use('/api/users', requireAuthMw, usersRouter)
  app.use('/api/friends', requireAuthMw, friendsRouter)
  app.use('/api/stream', requireAuthMw, streamRouter)
  // Feed read endpoints are public; write endpoints self-check auth
  app.use('/api/feed', feedRouter)
  // Questions are public to read; write actions self-check auth
  app.use('/api/questions', questionsRouter)
  app.use('/api/classrooms', requireAuthMw, classroomsRouter)
  app.use('/api/notifications', requireAuthMw, notificationsRouter)
  app.use('/api/ai', requireAuthMw, aiRouter)
  app.use('/api/courses', coursesRouter)
  app.use('/api/schedule', requireAuthMw, scheduleRouter)
}

async function connectMongoWithRetry() {
  if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI (server will run but DB will stay disconnected)')
    return
  }

  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 })
    console.log('MongoDB connected')
  } catch (err) {
    console.error('MongoDB connection failed (will retry):', err?.message || err)
    setTimeout(connectMongoWithRetry, 5_000)
  }
}

// Start HTTP server immediately (deploy platforms expect a bound port quickly).
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
  void connectMongoWithRetry()
})
