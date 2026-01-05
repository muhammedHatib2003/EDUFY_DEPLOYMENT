import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react'
import AppShell from '../AppShell.jsx'

export default function AppWithClerk() {
  return (
    <>
      <SignedIn>
        <AppShell />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}
