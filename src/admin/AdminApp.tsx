import React, { lazy, Suspense, useState } from 'react'
import type { StaffUser } from '../data/admin-seed'
import { clearSession, loadSession } from '../lib/auth'
import { PREVIEW_AUTH_ENABLED } from '../lib/runtime-env'
import { SignIn } from './access/SignIn'
import { TwoStep } from './access/TwoStep'
import { EmailCodeStep } from './access/EmailCodeStep'
import { ForgotPassword } from './access/ForgotPassword'
import { ResetPassword } from './access/ResetPassword'
import { SignedOut } from './access/SignedOut'
import { ProdShell } from './ProdShell'

/**
 * Staff console entry and access flow.
 *
 * PRODUCTION-SAFE ROUTER (Oct 2026): this module and every STATIC import must
 * evaluate cleanly in production builds — lib/store, data fixtures and their
 * importers (AdminShell, AcceptInvitation, SetupTwoStep) throw at module load
 * in prod, so they are lazy chunks that production never fetches. The prod
 * shell is ProdShell, which talks to the Go API (JWT session).
 * `onExit` returns to the public site.
 */
const AdminShell = lazy(() => import('./AdminShell').then((m) => ({ default: m.AdminShell })))
const AcceptInvitation = lazy(() => import('./access/AcceptInvitation').then((m) => ({ default: m.AcceptInvitation })))
const SetupTwoStep = lazy(() => import('./access/SetupTwoStep').then((m) => ({ default: m.SetupTwoStep })))

export type AccessStep =
  | { step: 'signin' }
  | { step: 'twostep'; user: StaffUser }
  | { step: 'emailCode'; user: StaffUser }
  | { step: 'forgot' }
  | { step: 'reset'; email: string }
  | { step: 'invite'; email: string }
  | { step: 'setup'; user: StaffUser }
  | { step: 'signedout'; reason: 'manual' | 'timeout' }
  | { step: 'shell'; user: StaffUser }

const loading = (
  <p role="status" className="mx-auto max-w-6xl px-5 py-16 text-graphite">Loading staff console…</p>
)

export function AdminApp({ onExit, className }: { onExit?: () => void; className?: string }) {
  // Session persistence: a live JWT session (sessionStorage) survives page
  // reloads and browser back/forward navigation — the console restores
  // straight into the shell. Sign-out (manual or expired-token) clears the
  // session, so those cases still land on the sign-in / signed-out screens.
  const [s, setS] = useState<AccessStep>(() => {
    const session = loadSession()
    return session?.token && session.user ? { step: 'shell', user: session.user } : { step: 'signin' }
  })
  const go = (next: AccessStep) => setS(next)

  const signOut = (user: StaffUser, reason: 'manual' | 'timeout') => {
    clearSession() // production JWT session (no-op in preview)
    if (PREVIEW_AUTH_ENABLED) {
      void import('../lib/store').then(({ store }) => {
        store.audit(user.name, reason === 'timeout' ? 'Session expired' : 'Signed out', user.email)
      })
    }
    go({ step: 'signedout', reason })
  }

  switch (s.step) {
    case 'signin':
      return <SignIn className={className} onExit={onExit} go={go} />
    case 'twostep':
      return <TwoStep className={className} user={s.user} go={go} />
    case 'emailCode':
      return <EmailCodeStep className={className} user={s.user} go={go} />
    case 'forgot':
      return <ForgotPassword className={className} go={go} />
    case 'reset':
      return <ResetPassword className={className} email={s.email} go={go} />
    case 'invite':
      return (
        <Suspense fallback={loading}>
          <AcceptInvitation className={className} email={s.email} go={go} />
        </Suspense>
      )
    case 'setup':
      return (
        <Suspense fallback={loading}>
          <SetupTwoStep className={className} user={s.user} go={go} />
        </Suspense>
      )
    case 'signedout':
      return <SignedOut className={className} reason={s.reason} go={go} onExit={onExit} />
    case 'shell':
      if (!PREVIEW_AUTH_ENABLED) {
        return <ProdShell className={className} user={s.user} onExit={onExit} onSignOut={(reason) => signOut(s.user, reason)} />
      }
      return (
        <Suspense fallback={loading}>
          <AdminShell className={className} user={s.user} onExit={onExit} onSignOut={(reason) => signOut(s.user, reason)} />
        </Suspense>
      )
  }
}
