import React, { useState } from 'react'
import type { StaffUser } from '../data/admin-seed'
import { store } from '../lib/store'
import { SignIn } from './access/SignIn'
import { TwoStep } from './access/TwoStep'
import { ForgotPassword } from './access/ForgotPassword'
import { ResetPassword } from './access/ResetPassword'
import { AcceptInvitation } from './access/AcceptInvitation'
import { SetupTwoStep } from './access/SetupTwoStep'
import { SignedOut } from './access/SignedOut'
import { AdminShell } from './AdminShell'

export type AccessStep =
  | { step: 'signin' }
  | { step: 'twostep'; user: StaffUser }
  | { step: 'forgot' }
  | { step: 'reset'; email: string }
  | { step: 'invite'; email: string }
  | { step: 'setup'; user: StaffUser }
  | { step: 'signedout'; reason: 'manual' | 'timeout' }
  | { step: 'shell'; user: StaffUser }

/** Staff console entry and access flow. `onExit` returns to the public site. */
export function AdminApp({ onExit, className }: { onExit?: () => void; className?: string }) {
  const [s, setS] = useState<AccessStep>({ step: 'signin' })
  const go = (next: AccessStep) => setS(next)

  const signOut = (user: StaffUser, reason: 'manual' | 'timeout') => {
    store.audit(user.name, reason === 'timeout' ? 'Session expired' : 'Signed out', user.email)
    go({ step: 'signedout', reason })
  }

  switch (s.step) {
    case 'signin':
      return <SignIn className={className} onExit={onExit} go={go} />
    case 'twostep':
      return <TwoStep className={className} user={s.user} go={go} />
    case 'forgot':
      return <ForgotPassword className={className} go={go} />
    case 'reset':
      return <ResetPassword className={className} email={s.email} go={go} />
    case 'invite':
      return <AcceptInvitation className={className} email={s.email} go={go} />
    case 'setup':
      return <SetupTwoStep className={className} user={s.user} go={go} />
    case 'signedout':
      return <SignedOut className={className} reason={s.reason} go={go} onExit={onExit} />
    case 'shell':
      return <AdminShell className={className} user={s.user} onExit={onExit} onSignOut={(reason) => signOut(s.user, reason)} />
  }
}
