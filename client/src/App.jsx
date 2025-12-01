import { SignedIn, SignedOut, SignIn, SignUp, RedirectToSignIn, useAuth } from '@clerk/clerk-react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import NotificationsProvider from './components/NotificationsProvider.jsx'
import NotificationsBell from './components/NotificationsBell.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Profile from './pages/Profile.jsx'
import Feed from './pages/Feed.jsx'
import GroqChat from './pages/GroqChat.jsx'
import Friends from './pages/Friends.jsx'
import Chat from './pages/Chat.jsx'
import Classrooms from './pages/Classrooms.jsx'
import ClassroomView from './pages/ClassroomView.jsx'
import PublicProfile from './pages/PublicProfile.jsx'

function AuthedLayout() {
  return (
    <NotificationsProvider>
    <div className="h-full drawer">
      <input id="app-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex flex-col">
        <div className="w-full navbar bg-base-100 border-b min-h-0 h-10 px-2">
          <div className="flex-none">
            <label htmlFor="app-drawer" className="btn btn-ghost btn-square btn-xs" aria-label="Toggle sidebar">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </label>
          </div>
          <div className="flex-1 pl-2 font-bold text-sm">graEDUFY</div>
          <div className="flex-none pr-2">
            <NotificationsBell />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <Routes>
            <Route path="/" element={<Navigate to="/profile" replace />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profiles/:handle" element={<PublicProfile />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/groq" element={<GroqChat />} />
            <Route path="/classrooms" element={<Classrooms />} />
            <Route path="/classrooms/:id" element={<ClassroomView />} />
            <Route path="*" element={<Navigate to="/profile" replace />} />
          </Routes>
        </div>
      </div>
      <div className="drawer-side">
        <label htmlFor="app-drawer" className="drawer-overlay" aria-label="close sidebar"></label>
        <Sidebar />
      </div>
    </div>
    </NotificationsProvider>
  )
}

export default function App() {
  return (
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
        element={<SignIn routing="path" path="/sign-in" afterSignInUrl="/onboarding" />} />
      <Route
        path="/sign-up/*"
        element={<SignUp routing="path" path="/sign-up" afterSignUpUrl="/onboarding" />} />

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
  )
}
