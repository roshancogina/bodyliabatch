import React from 'react'
import { Clock, LogOut } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { AuthLayout } from './AuthLayout'
import type { AccessStep } from '../AdminApp'

export function SignedOut({
  reason,
  go,
  onExit,
  className,
}: {
  reason: 'manual' | 'timeout'
  go: (s: AccessStep) => void
  onExit?: () => void
  className?: string
}) {
  const Icon = reason === 'timeout' ? Clock : LogOut
  return (
    <AuthLayout className={className} title={reason === 'timeout' ? 'You were signed out for security' : 'You’ve signed out'}>
      <div role="status" className="text-graphite">
        <Icon className="size-10 text-burgundy" strokeWidth={1.75} aria-hidden="true" />
        <p className="mt-3">
          {reason === 'timeout'
            ? 'Your session ended after a period of inactivity. Anything you had saved is safe; unsaved form entries were not kept.'
            : 'Your session has ended on this device. Close the browser if this is a shared computer.'}
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <Button size="lg" onClick={() => go({ step: 'signin' })}>Sign in again</Button>
        {onExit && <Button size="lg" variant="outline" onClick={onExit}>Go to the public batch check</Button>}
      </div>
    </AuthLayout>
  )
}
