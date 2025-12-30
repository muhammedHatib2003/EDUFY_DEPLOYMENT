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
import aiRouter from './routes/ai.js'
import questionsRouter from './routes/questions.js'
import coursesRouter from './routes/courses.js'
import scheduleRouter from './routes/schedule.js'


const app = express()

// Config
const PORT = process.env.PORT || 5001
const MONGODB_URI = process.env.MONGODB_URI
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

// Middleware
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

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
  res.json({ ok: true, uptime: process.uptime() })
})
console.log()
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

async function start() {
  try {
    if (!MONGODB_URI) throw new Error('Missing MONGODB_URI')
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB connected')

    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('Failed to start server:', err)
    process.exit(1)
  }

}

start()
