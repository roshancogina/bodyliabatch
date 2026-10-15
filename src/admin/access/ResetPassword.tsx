import React, { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { resetPassword } from '../../lib/auth'
import { Button } from '../../components/ui/button'
import { AuthLayout } from './AuthLayout'
import { NewPasswordForm } from './NewPasswordForm'
import type { AccessStep } from '../AdminApp'

export function ResetPassword({ email, go, className }: { email: string; go: (s: AccessStep) => void; className?: string }) {
  const [done, setDone] = useState(false)

  if (done)
    return (
      <AuthLayout className={className} title="Password updated">
        <div role="status">
          <CheckCircle2 className="size-10 text-success" strokeWidth={1.75} aria-hidden="true" />
          <p className="mt-3 text-graphite">
            You can now sign in with your new password. For your security we’ve signed you out of every other device.
          </p>
        </div>
        <Button size="lg" className="mt-6 w-full" onClick={() => go({ step: 'signin' })}>
          Go to sign in
        </Button>
      </AuthLayout>
    )

  return (
    <AuthLayout
      className={className}
      title="Choose a new password"
      lead={<>For <strong className="text-graphite">{email}</strong>. This link expires 30 minutes after it was sent.</>}
      back={{ label: 'Back to sign in', onClick: () => go({ step: 'signin' }) }}
    >
      <NewPasswordForm
        submitLabel="Update password"
        onValid={async (pw) => {
          await resetPassword(email, pw)
          setDone(true)
        }}
      />
    </AuthLayout>
  )
}
