import { useEffect, useState } from 'react'
import {
  SignedIn,
  SignedOut,
  SignIn,
  SignUp,
  RedirectToSignIn,
  useAuth,
  useClerk,
} from '@clerk/clerk-react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'

import Sidebar from './components/Sidebar.jsx'
import NotificationsProvider from './components/NotificationsProvider.jsx'
import NotificationsBell from './components/NotificationsBell.jsx'
import CallToastListener from './components/CallToastListener.jsx'

import Onboarding from './pages/Onboarding.jsx'
import Profile from './pages/Profile.jsx'
import Feed from './pages/Feed.jsx'
import Friends from './pages/Friends.jsx'
import Chat from './pages/Chat.jsx'
import Classrooms from './pages/Classrooms.jsx'
import ClassroomView from './pages/ClassroomView.jsx'
import PublicProfile from './pages/PublicProfile.jsx'
import Courses from './pages/Courses.jsx'
import CreateCourse from './pages/CreateCourse.jsx'
import CourseDetails from './pages/CourseDetails.jsx'
import LessonViewer from './pages/LessonViewer.jsx'
import Summaries from './pages/Summaries.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Todos from './pages/Todos.jsx'
import GeminiChat from './pages/GeminiChat.jsx'

import { authedApi } from '@/lib/api'

/* =========================================================
   CLERK DEEP LINK HANDLER (ANDROID / IOS)
   ========================================================= */
function ClerkDeepLinkHandler() {
  const { clerk } = useClerk()
  const { isLoaded } = useAuth()

  useEffect(() => {
    if (!isLoaded || !clerk) return

    const sub = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url) return
      try {
        console.log('[DEEP LINK]', url)
        await clerk.handleRedirectCallback(url)
        console.log('[CLERK] redirect handled')
      } catch (err) {
        console.error('[CLERK] redirect error', err)
      }
    })

    return () => sub.remove()
  }, [isLoaded, clerk])

  return null
}

/* =========================================================
   AUTHED LAYOUT (NO BLANK SCREEN)
   ========================================================= */
function AuthedLayout() {
  const { getToken, isLoaded } = useAuth()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!isLoaded) return

    let cancelled = false

    const verifyOnboarded = async () => {
      try {
        const token = await getToken()
        if (!token) {
          setChecking(false)
          return
        }

        const http = await authedApi(getToken)
        const { data } = await http.get('/users/me')

        if (!data?.user?.onboarded) {
          navigate('/onboarding', { replace: true })
          return
        }
      } catch (err) {
        // ❗ Hata = onboarding demek değil
        console.warn('[verifyOnboarded] skipped', err)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    verifyOnboarded()

    return () => {
      cancelled = true
    }
  }, [isLoaded, getToken, navigate])

  if (checking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-base-100">
        <div className="loading loading-lg text-primary" />
      </div>
    )
  }

  return (
    <NotificationsProvider>
      <CallToastListener />
      <div className="h-full drawer">
        <input id="app-drawer" type="checkbox" className="drawer-toggle" />
        <div className="drawer-content flex flex-col">
          <div className="w-full navbar bg-base-100 border-b min-h-0 h-10 px-2">
            <div className="flex-none">
              <label htmlFor="app-drawer" className="btn btn-ghost btn-square btn-xs">
                ☰
              </label>
            </div>
            <div className="flex-1 pl-2 font-bold text-sm">graEDUFY</div>
            <div className="flex-none pr-2">
              <NotificationsBell />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/todos" element={<Todos />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profiles/:handle" element={<PublicProfile />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/assistant" element={<GeminiChat />} />
              <Route path="/classrooms" element={<Classrooms />} />
              <Route path="/classrooms/:id" element={<ClassroomView />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/courses/create" element={<CreateCourse />} />
              <Route path="/courses/:id" element={<CourseDetails />} />
              <Route path="/courses/:id/learn" element={<LessonViewer />} />
              <Route path="/summaries" element={<Summaries />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>

        <div className="drawer-side">
          <label htmlFor="app-drawer" className="drawer-overlay" />
          <Sidebar />
        </div>
      </div>
    </NotificationsProvider>
  )
}

/* =========================================================
   APP ROOT
   ========================================================= */
export default function App() {
  return (
    <>
      {/* ANDROID / IOS DEEP LINK */}
      <ClerkDeepLinkHandler />

      <Routes>
        <Route
          path="/onboarding"
          element={
            <SignedIn>
              <Onboarding />
            </SignedIn>
          }
        />

        <Route
          path="/sign-in/*"
          element={<SignIn routing="path" path="/sign-in" afterSignInUrl="/onboarding" />}
        />

        <Route
          path="/sign-up/*"
          element={<SignUp routing="path" path="/sign-up" afterSignUpUrl="/onboarding" />}
        />

        <Route
          path="/*"
          element={
            <>
              <SignedIn>
                <AuthedLayout />
              </SignedIn>
              <SignedOut>
                <RedirectToSignIn />
              </SignedOut>
            </>
          }
        />
      </Routes>
    </>
  )
}
