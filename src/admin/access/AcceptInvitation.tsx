import React from 'react'
import { AlertCircle } from 'lucide-react'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../../data/admin-seed'
import { acceptInvitation } from '../../lib/auth'
import { useStore } from '../../lib/store'
import { Button } from '../../components/ui/button'
import { AuthLayout } from './AuthLayout'
import { NewPasswordForm } from './NewPasswordForm'
import type { AccessStep } from '../AdminApp'

export function AcceptInvitation({ email, go, className }: { email: string; go: (s: AccessStep) => void; className?: string }) {
  const user = useStore((s) => s.users.find((u) => u.email === email))

  if (!user || user.status !== 'invited')
    return (
      <AuthLayout className={className} title="This invitation can’t be used">
        <div className="flex gap-3 text-graphite">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-error" aria-hidden="true" />
          <p>It has already been accepted, has expired (after 7 days), or was withdrawn. Ask an administrator to send a new one.</p>
        </div>
        <Button variant="outline" className="mt-6" onClick={() => go({ step: 'signin' })}>Go to sign in</Button>
      </AuthLayout>
    )

  return (
    <AuthLayout
      className={className}
      title={`Welcome, ${user.name.split(' ')[0]}`}
      lead={<>{user.invitedBy ?? 'An administrator'} invited you to the Bodylia batch console as <strong className="text-graphite">{ROLE_LABEL[user.role]}</strong>.</>}
      aside={
        <>
          <p className="font-semibold text-graphite">As {ROLE_LABEL[user.role]} you can:</p>
          <p className="mt-1">{ROLE_DESCRIPTION[user.role]}</p>
          <p className="mt-4">Two steps to get started: choose a password, then connect your authenticator app.</p>
        </>
      }
    >
      <p className="mb-5 text-sm text-graphite">
        Step 1 of 2 · Signing in as <strong>{user.email}</strong>
      </p>
      <NewPasswordForm
        submitLabel="Continue to 2-step setup"
        onValid={async (pw) => {
          await acceptInvitation(user.email, pw)
          go({ step: 'setup', user })
        }}
      />
    </AuthLayout>
  )
}
